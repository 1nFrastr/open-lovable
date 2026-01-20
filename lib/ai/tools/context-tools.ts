import { tool } from 'ai';
import { z } from 'zod';
import { minimatch } from 'minimatch';

/**
 * Context Tools Module
 * 
 * Provides tools for LLM to actively explore and understand the codebase:
 * - readFile: Read content of existing files
 * - grep: Search for patterns across files
 * - glob: Find files matching patterns
 */

export interface ToolResult {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: Record<string, any>;
}

// ============ Read Tool ============
export const createReadTool = () => tool({
  description: `Read the content of a file from the sandbox. 
  
Use this tool when:
- User asks to modify an existing file and you need to see its current content
- You need to understand the structure of an existing component
- You want to check what dependencies are already imported

Examples:
- "Read src/components/Button.tsx to see its current implementation"
- "Check what's in src/App.tsx before adding the new route"`,
  
  inputSchema: z.object({
    path: z.string().describe('File path relative to sandbox root, e.g., "src/components/Button.tsx"'),
    offset: z.number().optional().describe('Starting line number (0-based). Use for large files.'),
    limit: z.number().optional().describe('Number of lines to read (default 1000, max 2000)')
  }),
  
  execute: async ({ path, offset = 0, limit = 1000 }): Promise<ToolResult> => {
    const provider = (global as any).activeSandboxProvider;
    if (!provider) {
      return {
        success: false,
        error: 'No active sandbox'
      };
    }
    
    try {
      console.log('[readFile] Reading file:', path);
      
      // Read file content
      const content = await provider.readFile(path);
      
      // Split into lines
      const lines = content.split('\n');
      const totalLines = lines.length;
      
      // Apply offset and limit
      const actualLimit = Math.min(limit, 2000);
      const start = Math.max(0, offset);
      const end = Math.min(totalLines, start + actualLimit);
      const selectedLines = lines.slice(start, end);
      
      // Format output with line numbers
      const numberedLines = selectedLines.map((line: string, idx: number) => {
        const lineNum = start + idx + 1;
        const truncated = line.length > 2000 ? line.substring(0, 2000) + '...' : line;
        return `${lineNum}|${truncated}`;
      });
      
      // Build output
      let output = `=== ${path} (lines ${start + 1}-${end} of ${totalLines}) ===\n`;
      output += numberedLines.join('\n');
      
      if (end < totalLines) {
        output += `\n\n... (file continues, ${totalLines - end} more lines available)`;
      }
      
      console.log('[readFile] Successfully read', selectedLines.length, 'lines from', path);
      
      return {
        success: true,
        content: output,
        metadata: {
          path,
          totalLines,
          showing: { start: start + 1, end }
        }
      };
      
    } catch (error: any) {
      console.error('[readFile] Error reading file:', error);
      
      // Friendly error for non-existent files
      if (error.message?.includes('not found') || error.message?.includes('ENOENT')) {
        return {
          success: false,
          error: `File not found: ${path}\n\nTip: Use glob tool to search for similar files.`
        };
      }
      
      return {
        success: false,
        error: `Failed to read file: ${error.message}`
      };
    }
  }
});

// ============ Grep Tool ============
export const createGrepTool = () => tool({
  description: `Search for a pattern in files within the sandbox.
  
Use this tool when:
- Looking for all usages of a specific function or variable
- Finding all files that import a certain module
- Searching for TODO comments or specific text patterns
- Understanding where a certain style or class is used

Examples:
- "Search for all files that use 'useState'"
- "Find all TODO comments in the codebase"
- "Look for all components that import Button"`,
  
  inputSchema: z.object({
    pattern: z.string().describe('Search pattern (supports regex)'),
    path: z.string().optional().describe('Directory to search (default: "src")'),
    filePattern: z.string().optional().describe('File pattern to include, e.g., "*.tsx", "*.{ts,tsx}"')
  }),
  
  execute: async ({ pattern, path = 'src', filePattern = '*' }): Promise<ToolResult> => {
    const provider = (global as any).activeSandboxProvider;
    if (!provider) {
      return { success: false, error: 'No active sandbox' };
    }
    
    try {
      console.log('[grep] Searching for pattern:', pattern, 'in path:', path);
      
      // Get all files - use undefined to get all files from sandbox root
      // Provider will use its default directory (/home/user/app for E2B, /vercel/sandbox for Vercel)
      const allFiles = await provider.listFiles();
      console.log('[grep] Found', allFiles.length, 'total files');
      
      // Filter by path prefix if specified (and not default 'src')
      let filteredByPath = allFiles;
      if (path && path !== 'src') {
        // Normalize path (remove leading/trailing slashes)
        const normalizedPath = path.replace(/^\/|\/$/g, '');
        filteredByPath = allFiles.filter((file: string) => 
          file.startsWith(normalizedPath + '/') || file === normalizedPath
        );
      } else if (path === 'src') {
        // Default: only search in src/ directory
        filteredByPath = allFiles.filter((file: string) => 
          file.startsWith('src/')
        );
      }
      
      console.log('[grep] After path filter:', filteredByPath.length, 'files');
      
      // Filter by file pattern
      const matchedFiles = filteredByPath.filter((file: string) => 
        minimatch(file, `**/${filePattern}`, { matchBase: true })
      );
      
      // Limit to code files if no pattern specified
      const codeFiles = matchedFiles.filter((file: string) => {
        const ext = file.split('.').pop()?.toLowerCase();
        return ['js', 'jsx', 'ts', 'tsx', 'css', 'html'].includes(ext || '');
      });
      
      console.log('[grep] Searching in', codeFiles.length, 'code files');
      
      // Search in files (parallel)
      const regex = new RegExp(pattern, 'gi');
      const results: Array<{
        file: string;
        matches: Array<{ line: number; text: string; context: string[] }>;
      }> = [];
      
      const searchPromises = codeFiles.slice(0, 50).map(async (file: string) => {
        try {
          const content = await provider.readFile(file);
          const lines = content.split('\n');
          const fileMatches: Array<{ line: number; text: string; context: string[] }> = [];
          
          lines.forEach((line: string, idx: number) => {
            if (regex.test(line)) {
              const context = [
                lines[idx - 2] || '',
                lines[idx - 1] || '',
                lines[idx + 1] || '',
                lines[idx + 2] || ''
              ];
              fileMatches.push({
                line: idx + 1,
                text: line,
                context
              });
            }
          });
          
          if (fileMatches.length > 0) {
            results.push({ file, matches: fileMatches.slice(0, 10) }); // Max 10 per file
          }
        } catch (e) {
          // Skip files that can't be read
        }
      });
      
      await Promise.all(searchPromises);
      
      // Build output
      if (results.length === 0) {
        console.log('[grep] No matches found');
        return {
          success: true,
          content: `No matches found for pattern: ${pattern}`
        };
      }
      
      const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);
      console.log('[grep] Found', totalMatches, 'matches in', results.length, 'files');
      
      let output = `Found ${totalMatches} matches in ${results.length} files:\n\n`;
      
      // Show first 50 matches
      let shown = 0;
      for (const result of results) {
        for (const match of result.matches) {
          if (shown >= 50) break;
          
          output += `${result.file}:${match.line}\n`;
          output += `${match.line - 2}| ${match.context[0]}\n`;
          output += `${match.line - 1}| ${match.context[1]}\n`;
          output += `${match.line}| ${match.text}  // <-- MATCH\n`;
          output += `${match.line + 1}| ${match.context[2]}\n`;
          output += `${match.line + 2}| ${match.context[3]}\n\n`;
          shown++;
        }
        if (shown >= 50) break;
      }
      
      if (totalMatches > shown) {
        output += `... (${totalMatches - shown} more matches not shown)`;
      }
      
      return {
        success: true,
        content: output,
        metadata: {
          totalMatches,
          filesWithMatches: results.length
        }
      };
      
    } catch (error: any) {
      console.error('[grep] Error:', error);
      return {
        success: false,
        error: `Grep failed: ${error.message}`
      };
    }
  }
});

// ============ Glob Tool ============
export const createGlobTool = () => tool({
  description: `Find files matching a glob pattern in the sandbox.
  
Use this tool when:
- You need to discover what files exist in a directory
- Looking for all components/pages/hooks/etc.
- Finding files by naming pattern
- Understanding project structure

Glob patterns:
- * matches any characters in a filename (not /)
- ** matches any characters including /
- ? matches a single character
- [...] matches character ranges

Examples:
- "Find all component files: **/*Button*.tsx"
- "List all hooks: **/use*.ts"
- "Find all CSS files: **/*.css"`,
  
  inputSchema: z.object({
    pattern: z.string().describe('Glob pattern, e.g., "**/*.tsx", "components/**/Button*"'),
    path: z.string().optional().describe('Root directory to search (default: "src")')
  }),
  
  execute: async ({ pattern, path = 'src' }): Promise<ToolResult> => {
    const provider = (global as any).activeSandboxProvider;
    if (!provider) {
      return { success: false, error: 'No active sandbox' };
    }
    
    try {
      console.log('[glob] Searching for pattern:', pattern, 'in path:', path);
      
      // Get all files from sandbox root
      const allFiles = await provider.listFiles();
      console.log('[glob] Found', allFiles.length, 'total files');
      
      // Filter by path prefix if specified
      let filteredByPath = allFiles;
      if (path && path !== 'src') {
        const normalizedPath = path.replace(/^\/|\/$/g, '');
        filteredByPath = allFiles.filter((file: string) => 
          file.startsWith(normalizedPath + '/') || file === normalizedPath
        );
      } else if (path === 'src') {
        // Default: only search in src/ directory
        filteredByPath = allFiles.filter((file: string) => 
          file.startsWith('src/')
        );
      }
      
      console.log('[glob] After path filter:', filteredByPath.length, 'files');
      
      // Match against pattern
      const matched = filteredByPath.filter((file: string) =>
        minimatch(file, pattern, { matchBase: true })
      );
      
      // Sort alphabetically
      matched.sort();
      
      // Limit to 100 results
      const limited = matched.slice(0, 100);
      
      console.log('[glob] Matched', matched.length, 'files');
      
      if (limited.length === 0) {
        return {
          success: true,
          content: `No files found matching pattern: ${pattern}\n\nTip: Try a broader pattern or check the path.`
        };
      }
      
      let output = `Found ${matched.length} files matching "${pattern}":\n\n`;
      output += limited.join('\n');
      
      if (matched.length > 100) {
        output += `\n\n... (${matched.length - 100} more files not shown, use more specific pattern)`;
      }
      
      return {
        success: true,
        content: output,
        metadata: {
          total: matched.length,
          showing: limited.length
        }
      };
      
    } catch (error: any) {
      console.error('[glob] Error:', error);
      return {
        success: false,
        error: `Glob search failed: ${error.message}`
      };
    }
  }
});
