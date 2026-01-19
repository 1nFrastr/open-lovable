import type { SandboxState } from '@/types/sandbox';
import { getFileContents, formatFilesForAI } from '@/lib/context-selector';
import type { EditContext } from '@/types/file-manifest';

/**
 * Full Context Builder Module
 * 
 * Builds complete context for AI prompts by:
 * - Fetching sandbox files from backend cache or frontend
 * - Formatting file contents for AI consumption
 * - Handling edit mode vs first-time generation
 */

export interface ContextBuildOptions {
  prompt: string;
  context?: any;
  isEdit: boolean;
  editContext?: EditContext;
}

export interface FileData {
  content: string;
  lastModified: number;
}

/**
 * Build full context string for AI prompt
 * 
 * @param options - Context build configuration
 * @returns Formatted context string including file structure and contents
 */
export async function buildFullContext(options: ContextBuildOptions): Promise<string> {
  const { prompt, context, isEdit, editContext } = options;
  
  let fullPrompt = prompt;
  
  if (!context) {
    return fullPrompt;
  }
  
  const contextParts: string[] = [];
  
  // Add sandbox ID
  if (context.sandboxId) {
    contextParts.push(`Current sandbox ID: ${context.sandboxId}`);
  }
  
  // Add file structure
  if (context.structure) {
    contextParts.push(`Current file structure:\n${context.structure}`);
  }
  
  // Use backend file cache instead of frontend-provided files
  let backendFiles = (global as any).sandboxState?.fileCache?.files || {};
  let hasBackendFiles = Object.keys(backendFiles).length > 0;
  
  console.log('[buildFullContext] Backend file cache status:');
  console.log('[buildFullContext] - Has sandboxState:', !!(global as any).sandboxState);
  console.log('[buildFullContext] - Has fileCache:', !!(global as any).sandboxState?.fileCache);
  console.log('[buildFullContext] - File count:', Object.keys(backendFiles).length);
  console.log('[buildFullContext] - Has manifest:', !!(global as any).sandboxState?.fileCache?.manifest);
  
  // If no backend files and we're in edit mode, try to fetch from sandbox
  if (!hasBackendFiles && isEdit && ((global as any).activeSandboxProvider || context?.sandboxId)) {
    console.log('[buildFullContext] No backend files, attempting to fetch from sandbox...');
    
    try {
      const filesResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/get-sandbox-files`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      if (filesResponse.ok) {
        const filesData = await filesResponse.json();
        if (filesData.success && filesData.files) {
          console.log('[buildFullContext] Successfully fetched', Object.keys(filesData.files).length, 'files from sandbox');
          
          // Initialize sandboxState if needed
          if (!(global as any).sandboxState) {
            (global as any).sandboxState = {
              fileCache: {
                files: {},
                lastSync: Date.now(),
                sandboxId: context?.sandboxId || 'unknown'
              }
            } as SandboxState;
          } else if (!(global as any).sandboxState.fileCache) {
            (global as any).sandboxState.fileCache = {
              files: {},
              lastSync: Date.now(),
              sandboxId: context?.sandboxId || 'unknown'
            };
          }
          
          // Store files in cache
          for (const [path, content] of Object.entries(filesData.files)) {
            const normalizedPath = path.replace('/home/user/app/', '');
            if ((global as any).sandboxState.fileCache) {
              (global as any).sandboxState.fileCache.files[normalizedPath] = {
                content: content as string,
                lastModified: Date.now()
              };
            }
          }
          
          if (filesData.manifest && (global as any).sandboxState.fileCache) {
            (global as any).sandboxState.fileCache.manifest = filesData.manifest;
            // TODO: Re-implement edit intent analysis here
          }
          
          // Update variables
          backendFiles = (global as any).sandboxState.fileCache?.files || {};
          hasBackendFiles = Object.keys(backendFiles).length > 0;
          console.log('[buildFullContext] Updated backend cache with fetched files');
        }
      }
    } catch (error) {
      console.error('[buildFullContext] Failed to fetch sandbox files:', error);
    }
  }
  
  // Include current file contents from backend cache
  if (hasBackendFiles) {
    // If we have edit context, use intelligent file selection
    if (editContext && editContext.primaryFiles.length > 0) {
      contextParts.push('\nEXISTING APPLICATION - TARGETED EDIT MODE');
      contextParts.push(`\n${editContext.systemPrompt || ''}\n`);
      
      // Get contents of primary and context files
      const manifest = (global as any).sandboxState?.fileCache?.manifest;
      if (manifest) {
        const primaryFileContents = await getFileContents(editContext.primaryFiles, manifest);
        const contextFileContents = await getFileContents(editContext.contextFiles, manifest);
        
        // Format files for AI
        const formattedFiles = formatFilesForAI(primaryFileContents, contextFileContents);
        contextParts.push(formattedFiles);
        
        contextParts.push('\nIMPORTANT: Only modify the files listed under "Files to Edit". The context files are provided for reference only.');
      }
    } else {
      // Fallback to showing all files if no edit context
      console.log('[buildFullContext] WARNING: Using fallback mode - no edit context available');
      contextParts.push('\nEXISTING APPLICATION - TARGETED EDIT REQUIRED');
      contextParts.push('\nYou MUST analyze the user request and determine which specific file(s) to edit.');
      contextParts.push('\nCurrent project files (DO NOT regenerate all of these):');
      
      const fileEntries = Object.entries(backendFiles);
      console.log(`[buildFullContext] Using backend cache: ${fileEntries.length} files`);
      
      // Show file list first for reference
      contextParts.push('\n### File List:');
      for (const [path] of fileEntries) {
        contextParts.push(`- ${path}`);
      }
      
      // Include ALL files as context in fallback mode
      contextParts.push('\n### File Contents (ALL FILES FOR CONTEXT):');
      for (const [path, fileData] of fileEntries) {
        const content = (fileData as FileData).content;
        if (typeof content === 'string') {
          contextParts.push(`\n<file path="${path}">\n${content}\n</file>`);
        }
      }
      
      contextParts.push('\n🚨 CRITICAL INSTRUCTIONS - VIOLATION = FAILURE 🚨');
      contextParts.push('1. Analyze the user request: "' + prompt + '"');
      contextParts.push('2. Identify the MINIMUM number of files that need editing (usually just ONE)');
      contextParts.push('3. PRESERVE ALL EXISTING CONTENT in those files');
      contextParts.push('4. ONLY ADD/MODIFY the specific part requested');
      contextParts.push('5. DO NOT regenerate entire components from scratch');
      contextParts.push('6. DO NOT change unrelated parts of any file');
      contextParts.push('7. Generate ONLY the files that MUST be changed - NO EXTRAS');
      contextParts.push('\n⚠️ FILE COUNT RULE:');
      contextParts.push('- Simple change (color, text, spacing) = 1 file ONLY');
      contextParts.push('- Adding new component = 2 files MAX (new component + parent that imports it)');
      contextParts.push('- DO NOT exceed these limits unless absolutely necessary');
      contextParts.push('\nEXAMPLES OF CORRECT BEHAVIOR:');
      contextParts.push('✅ "add a chart to the hero" → Edit ONLY Hero.tsx, ADD the chart, KEEP everything else');
      contextParts.push('✅ "change header to black" → Edit ONLY Header.tsx, change ONLY the color');
      contextParts.push('✅ "fix spacing in footer" → Edit ONLY Footer.tsx, adjust ONLY spacing');
      contextParts.push('\nEXAMPLES OF FAILURES:');
      contextParts.push('❌ "change header color" → You edit Header, Footer, and App "for consistency"');
      contextParts.push('❌ "add chart to hero" → You regenerate the entire Hero component');
      contextParts.push('❌ "fix button" → You update 5 different component files');
      contextParts.push('\n⚠️ FINAL WARNING:');
      contextParts.push('If you generate MORE files than necessary, you have FAILED');
      contextParts.push('If you DELETE or REWRITE existing functionality, you have FAILED');
      contextParts.push('ONLY change what was EXPLICITLY requested - NOTHING MORE');
    }
  } else if (context.currentFiles && Object.keys(context.currentFiles).length > 0) {
    // Fallback to frontend-provided files if backend cache is empty
    console.log('[buildFullContext] Warning: Backend cache empty, using frontend files');
    contextParts.push('\nEXISTING APPLICATION - DO NOT REGENERATE FROM SCRATCH');
    contextParts.push('Current project files (modify these, do not recreate):');
    
    const fileEntries = Object.entries(context.currentFiles);
    for (const [path, content] of fileEntries) {
      if (typeof content === 'string') {
        contextParts.push(`\n<file path="${path}">\n${content}\n</file>`);
      }
    }
    contextParts.push('\nThe above files already exist. When the user asks to modify something (like "change the header color to black"), find the relevant file above and generate ONLY that file with the requested changes.');
  }
  
  // Add explicit edit mode indicator
  if (isEdit) {
    contextParts.push('\nEDIT MODE ACTIVE');
    contextParts.push('This is an incremental update to an existing application.');
    contextParts.push('DO NOT regenerate App.tsx, index.css, or other core files unless explicitly requested.');
    contextParts.push('ONLY create or modify the specific files needed for the user\'s request.');
    contextParts.push('\n⚠️ CRITICAL FILE OUTPUT FORMAT - VIOLATION = FAILURE:');
    contextParts.push('YOU MUST use writeFile() tool calls for EVERY file:');
    contextParts.push('');
    contextParts.push('Example:');
    contextParts.push('writeFile("src/components/ComponentName.tsx", <complete file content>)');
    contextParts.push('writeFile("src/index.css", <complete CSS content>)');
    contextParts.push('');
    contextParts.push('❌ NEVER just list filenames or describe changes');
    contextParts.push('❌ NEVER output partial/incomplete file content');
    contextParts.push('✅ ALWAYS: Call writeFile() for EVERY file with COMPLETE content');
    contextParts.push('✅ ALWAYS: Include EVERY line of each file you modify');
  } else if (!hasBackendFiles) {
    // First generation mode - make it beautiful!
    contextParts.push('\n🎨 FIRST GENERATION MODE - CREATE SOMETHING BEAUTIFUL!');
    contextParts.push('\nThis is the user\'s FIRST experience. Make it impressive:');
    contextParts.push('1. **USE TAILWIND PROPERLY** - Use standard Tailwind color classes');
    contextParts.push('2. **NO PLACEHOLDERS** - Use real content, not lorem ipsum');
    contextParts.push('3. **COMPLETE COMPONENTS** - Header, Hero, Features, Footer minimum');
    contextParts.push('4. **VISUAL POLISH** - Shadows, hover states, transitions');
    contextParts.push('5. **STANDARD CLASSES** - bg-white, text-gray-900, bg-blue-500, NOT bg-background');
    contextParts.push('\nCreate a polished, professional application that works perfectly on first load.');
    contextParts.push('\n⚠️ OUTPUT FORMAT:');
    contextParts.push('Use writeFile() tool calls for EVERY file');
    contextParts.push('NEVER output "Generated Files:" as plain text');
  }
  
  // Add conversation context (scraped websites, etc)
  if (context.conversationContext) {
    if (context.conversationContext.scrapedWebsites?.length > 0) {
      contextParts.push('\nScraped Websites in Context:');
      context.conversationContext.scrapedWebsites.forEach((site: any) => {
        contextParts.push(`\nURL: ${site.url}`);
        contextParts.push(`Scraped: ${new Date(site.timestamp).toLocaleString()}`);
        if (site.content) {
          // Include a summary of the scraped content
          const contentPreview = typeof site.content === 'string' 
            ? site.content.substring(0, 1000) 
            : JSON.stringify(site.content).substring(0, 1000);
          contextParts.push(`Content Preview: ${contentPreview}...`);
        }
      });
    }
    
    if (context.conversationContext.currentProject) {
      contextParts.push(`\nCurrent Project: ${context.conversationContext.currentProject}`);
    }
  }
  
  if (contextParts.length > 0) {
    fullPrompt = `CONTEXT:\n${contextParts.join('\n')}\n\nUSER REQUEST:\n${prompt}`;
  }
  
  return fullPrompt;
}
