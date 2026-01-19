import { streamText } from 'ai';
import { appConfig } from '@/config/app.config';

/**
 * Code Truncation Recovery Module
 * 
 * Detects and automatically recovers from code truncation issues.
 * Provides intelligent analysis and regeneration for incomplete files.
 */

export interface TruncationCheckResult {
  hasTruncation: boolean;
  truncatedFiles: string[];
  warnings: string[];
}

export interface FileContent {
  path: string;
  content: string;
}

/**
 * Validate generated files for truncation issues
 * 
 * @param files - Array of generated files to check
 * @returns Object containing truncation status, affected files, and warnings
 */
export function detectTruncation(files: FileContent[]): TruncationCheckResult {
  const warnings: string[] = [];
  const truncatedFiles: string[] = [];
  
  // Check each file for truncation
  for (const file of files) {
    const { path: filePath, content } = file;
    
    // Only check for really obvious truncation issues
    if (content.trim().endsWith('<') || content.trim().endsWith('</')) {
      warnings.push(`File ${filePath} appears to have incomplete HTML tags`);
    }
    
    // Only check for SEVERE truncation issues in JS/TS files
    if (filePath.match(/\.(jsx?|tsx?)$/)) {
      // Check for severely unmatched brackets (more than 3 difference)
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      const braceDiff = Math.abs(openBraces - closeBraces);
      if (braceDiff > 3) { // Only flag severe mismatches
        warnings.push(`File ${filePath} has severely unmatched braces (${openBraces} open, ${closeBraces} closed)`);
      }
      
      // Check if file is extremely short and looks incomplete
      if (content.length < 20 && content.includes('function') && !content.includes('}')) {
        warnings.push(`File ${filePath} appears severely truncated`);
      }
    }
    
    // Detailed truncation check - be more selective
    const hasEllipsis = content.includes('...') && 
                       !content.includes('...rest') && 
                       !content.includes('...props') &&
                       !content.includes('spread');
                       
    const endsAbruptly = content.trim().endsWith('...') || 
                         content.trim().endsWith(',') ||
                         content.trim().endsWith('(');
                         
    const hasUnclosedTags = content.includes('</') && 
                            !content.match(/<\/[a-zA-Z0-9]+>/) &&
                            content.includes('<');
                            
    const tooShort = content.length < 50 && filePath.match(/\.(jsx?|tsx?)$/);
    
    // Check for unmatched braces specifically
    const openBraceCount = (content.match(/{/g) || []).length;
    const closeBraceCount = (content.match(/}/g) || []).length;
    const hasUnmatchedBraces = Math.abs(openBraceCount - closeBraceCount) > 1;
    
    const isTruncated = (hasEllipsis && endsAbruptly) || 
                       hasUnclosedTags || 
                       (tooShort && !content.includes('export')) ||
                       hasUnmatchedBraces;
    
    if (isTruncated) {
      truncatedFiles.push(filePath);
    }
  }
  
  return {
    hasTruncation: truncatedFiles.length > 0,
    truncatedFiles,
    warnings
  };
}

/**
 * Recover truncated files by regenerating them with focused AI completion
 * 
 * @param truncatedFiles - Array of file paths that need recovery
 * @param originalPrompt - Original user request
 * @param model - AI model string (e.g., "openai/gpt-4", "anthropic/claude-3-opus")
 * @param providerClients - Object containing AI provider clients (anthropic, openai, groq, etc.)
 * @param sendProgress - Optional callback for progress updates
 * @returns Object mapping file paths to recovered content
 */
export async function recoverTruncatedFiles(
  truncatedFiles: string[],
  originalPrompt: string,
  model: string,
  providerClients: {
    anthropic: any;
    openai: any;
    groq: any;
    googleGenerativeAI?: any;
  },
  sendProgress?: (data: any) => Promise<void>
): Promise<Record<string, string>> {
  const recoveredContent: Record<string, string> = {};
  
  console.log('[recoverTruncatedFiles] Attempting to regenerate truncated files:', truncatedFiles);
  
  for (const filePath of truncatedFiles) {
    if (sendProgress) {
      await sendProgress({
        type: 'info',
        message: `Completing ${filePath}...`
      });
    }
    
    try {
      // Create a focused prompt to complete just this file
      const completionPrompt = `Complete the following file that was truncated. Provide the FULL file content.

File: ${filePath}
Original request: ${originalPrompt}

Provide the complete file content without any truncation. Include all necessary imports, complete all functions, and close all tags properly.`;
      
      // Determine provider client and model name
      const { completionClient, completionModelName } = getProviderForModel(
        model,
        providerClients
      );
      
      // Make a focused API call to complete this specific file
      const completionResult = await streamText({
        model: completionClient(completionModelName),
        messages: [
          { 
            role: 'system', 
            content: 'You are completing a truncated file. Provide the complete, working file content.'
          },
          { role: 'user', content: completionPrompt }
        ],
        temperature: model.startsWith('openai/gpt-5') ? undefined : appConfig.ai.defaultTemperature
      });
      
      // Get the full text from the stream
      let completedContent = '';
      for await (const chunk of completionResult.textStream) {
        completedContent += chunk;
      }
      
      // Extract just the code content (remove any markdown or explanation)
      let cleanContent = completedContent;
      if (cleanContent.includes('```')) {
        const codeMatch = cleanContent.match(/```[\w]*\n([\s\S]*?)```/);
        if (codeMatch) {
          cleanContent = codeMatch[1];
        }
      }
      
      recoveredContent[filePath] = cleanContent;
      console.log(`[recoverTruncatedFiles] Successfully completed ${filePath}`);
      
    } catch (completionError) {
      console.error(`[recoverTruncatedFiles] Failed to complete ${filePath}:`, completionError);
      if (sendProgress) {
        await sendProgress({
          type: 'warning',
          message: `Could not auto-complete ${filePath}. Manual review may be needed.`
        });
      }
    }
  }
  
  if (sendProgress) {
    await sendProgress({
      type: 'info',
      message: 'Truncation recovery complete'
    });
  }
  
  return recoveredContent;
}

/**
 * Helper function to determine the correct provider and model name
 */
function getProviderForModel(
  model: string,
  providerClients: {
    anthropic: any;
    openai: any;
    groq: any;
    googleGenerativeAI?: any;
  }
): { completionClient: any; completionModelName: string } {
  let completionClient: any;
  let completionModelName: string;
  
  if (model.includes('gpt') || model.includes('openai')) {
    completionClient = providerClients.openai;
    completionModelName = model.replace('openai/', '');
  } else if (model.includes('claude') || model.includes('anthropic')) {
    completionClient = providerClients.anthropic;
    completionModelName = model.replace('anthropic/', '');
  } else if (model === 'moonshotai/kimi-k2-instruct-0905') {
    completionClient = providerClients.groq;
    completionModelName = 'moonshotai/kimi-k2-instruct-0905';
  } else if (model.includes('google')) {
    completionClient = providerClients.googleGenerativeAI || providerClients.groq;
    completionModelName = model.replace('google/', '');
  } else {
    completionClient = providerClients.groq;
    completionModelName = model;
  }
  
  return { completionClient, completionModelName };
}

/**
 * Apply recovered content to original files array
 * 
 * @param files - Original files array
 * @param recoveredContent - Recovered content mapping
 * @returns Updated files array with recovered content
 */
export function applyRecoveredContent(
  files: FileContent[],
  recoveredContent: Record<string, string>
): FileContent[] {
  return files.map(file => {
    if (recoveredContent[file.path]) {
      return {
        ...file,
        content: recoveredContent[file.path]
      };
    }
    return file;
  });
}
