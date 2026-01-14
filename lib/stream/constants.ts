/**
 * Stream continuation constants
 * 
 * Based on bolt.diy's implementation for handling response truncation
 */

/**
 * Maximum number of continuation segments allowed
 * Each segment represents one additional API call to continue a truncated response
 * 
 * Setting this to 2 allows for the original response + 2 continuations = up to 3x the normal token limit
 * 
 * Note: This can also be configured in config/app.config.ts under ai.streamContinuation.maxSegments
 */
export const MAX_RESPONSE_SEGMENTS = 2;

/**
 * Default max tokens for response generation
 * Used as fallback when model-specific limits are not available
 */
export const DEFAULT_MAX_TOKENS = 8192;

/**
 * Prompt to send when requesting continuation of a truncated response
 * 
 * Critical aspects:
 * - Tells AI to continue immediately from where it left off
 * - Explicitly forbids repeating any content
 * - Avoids any preamble or introduction
 */
export const CONTINUE_PROMPT = `Continue your prior response. IMPORTANT: Immediately begin from where you left off without any interruptions.
Do not repeat any content, including file tags, imports, or any code that was already generated.
Do not say "Continuing..." or add any preamble - just continue the code directly.`;

/**
 * Markers that indicate response may be truncated
 * These are used to detect incomplete XML file tags
 */
export const TRUNCATION_MARKERS = {
  // File tag patterns
  unclosedFileTag: /<file path="[^"]*">(?![\s\S]*<\/file>)/,
  
  // Code patterns that suggest truncation
  incompleteJsx: /<[A-Z][a-zA-Z]*[^>]*$/, // JSX tag started but not closed on same line
  unclosedBrace: /\{[^}]*$/, // Opening brace without closing
  incompleteString: /"[^"]*$|'[^']*$/, // Unclosed string literal
  
  // Common truncation indicators
  endsWithComma: /,\s*$/,
  endsWithOperator: /[+\-*/%=<>!&|]\s*$/,
};

/**
 * Check if content appears to be truncated
 */
export function detectTruncation(content: string): {
  isTruncated: boolean;
  reason?: string;
} {
  // Check for unclosed file tags
  const fileOpenCount = (content.match(/<file path="/g) || []).length;
  const fileCloseCount = (content.match(/<\/file>/g) || []).length;
  
  if (fileOpenCount > fileCloseCount) {
    return {
      isTruncated: true,
      reason: `Unclosed file tags: ${fileOpenCount} opened, ${fileCloseCount} closed`,
    };
  }
  
  // Check for severely unbalanced braces (more than 3 difference)
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  
  if (Math.abs(openBraces - closeBraces) > 3) {
    return {
      isTruncated: true,
      reason: `Severely unbalanced braces: ${openBraces} open, ${closeBraces} close`,
    };
  }
  
  // Check if content ends abruptly (only for obvious cases)
  const trimmed = content.trim();
  if (trimmed.endsWith('<') || trimmed.endsWith('</')) {
    return {
      isTruncated: true,
      reason: 'Content ends with incomplete tag',
    };
  }
  
  return { isTruncated: false };
}

/**
 * Extract the last partial file from truncated content for continuation
 */
export function extractPartialContent(content: string): {
  completedContent: string;
  partialFilePath?: string;
  partialFileContent?: string;
} {
  const fileOpenCount = (content.match(/<file path="/g) || []).length;
  const fileCloseCount = (content.match(/<\/file>/g) || []).length;
  
  if (fileOpenCount <= fileCloseCount) {
    // No truncation in file tags
    return { completedContent: content };
  }
  
  // Find the last unclosed file tag
  const lastFileMatch = content.match(/<file path="([^"]+)">([^]*?)$/);
  
  if (!lastFileMatch) {
    return { completedContent: content };
  }
  
  const partialFilePath = lastFileMatch[1];
  const partialFileContent = lastFileMatch[2];
  
  // Remove the partial file from content
  const completedContent = content.substring(0, content.lastIndexOf(`<file path="${partialFilePath}">`));
  
  return {
    completedContent: completedContent.trim(),
    partialFilePath,
    partialFileContent,
  };
}
