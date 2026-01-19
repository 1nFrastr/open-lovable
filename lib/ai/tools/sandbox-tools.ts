import { tool } from 'ai';
import { z } from 'zod';
import { replace, generateDiff, calculateDiffStats, normalizeLineEndings } from './edit-file';

/**
 * Sandbox Tools Module
 * 
 * Defines AI tools for interacting with the sandbox environment.
 * These tools allow the AI to write files, edit files, and install packages.
 */

export interface ToolResult {
  success: boolean;
  error?: string;
  message?: string;
  [key: string]: any;
}

/**
 * Create sandbox tools for AI to interact with the development environment
 * 
 * @returns Record of tool definitions compatible with AI SDK
 */
export function createSandboxTools(): Record<string, any> {
  return {
    editFile: tool({
      description: 'Edit a file by replacing a specific string with new content. Use this for incremental updates and partial replacements. This is more efficient than writeFile for small changes.',
      inputSchema: z.object({
        path: z.string().describe('File path, e.g., "src/components/Button.tsx"'),
        oldString: z.string().describe('The exact text to replace. Must be unique in the file or provide enough context to identify the match.'),
        newString: z.string().describe('The new text to replace it with (must be different from oldString)'),
        replaceAll: z.boolean().optional().describe('Replace all occurrences of oldString (default: false). Use when renaming variables or making bulk changes.')
      }),
      execute: async ({ path, oldString, newString, replaceAll }: { 
        path: string; 
        oldString: string; 
        newString: string; 
        replaceAll?: boolean 
      }): Promise<ToolResult> => {
        console.log('[Tool Execute] editFile called:', {
          path,
          oldStringLength: oldString?.length || 0,
          newStringLength: newString?.length || 0,
          replaceAll: replaceAll || false
        });
        
        const provider = (global as any).activeSandboxProvider;
        if (!provider) {
          console.error('[Tool Execute] editFile: No active sandbox provider');
          return { success: false, error: 'No active sandbox' };
        }

        // Validation
        if (oldString === newString) {
          return { 
            success: false, 
            error: 'oldString and newString must be different',
            path 
          };
        }
        
        try {
          // Read existing file content
          let oldContent: string;
          try {
            oldContent = await provider.readFile(path);
          } catch (readError) {
            return { 
              success: false, 
              error: `File not found: ${path}`,
              path 
            };
          }

          // Apply replacement using intelligent matching strategies
          let newContent: string;
          try {
            newContent = replace(normalizeLineEndings(oldContent), oldString, newString, replaceAll || false);
          } catch (replaceError) {
            const errorMessage = (replaceError as Error).message;
            return { 
              success: false, 
              error: errorMessage,
              path,
              suggestion: errorMessage.includes('multiple matches') 
                ? 'Provide more surrounding context in oldString to uniquely identify the match, or set replaceAll: true'
                : errorMessage.includes('not found')
                ? 'The oldString was not found. Verify the exact content including whitespace and indentation.'
                : undefined
            };
          }

          // Write updated content back to file
          await provider.writeFile(path, newContent);
          
          // Generate diff for display
          const diff = generateDiff(path, oldContent, newContent);
          const stats = calculateDiffStats(oldContent, newContent);
          
          console.log('[Tool Execute] editFile success:', {
            path,
            additions: stats.additions,
            deletions: stats.deletions
          });
          
          return {
            success: true,
            message: `File ${path} edited successfully`,
            path,
            diff,
            additions: stats.additions,
            deletions: stats.deletions,
            size: newContent.length
          };
        } catch (error) {
          console.error('[Tool Execute] editFile error:', error);
          return {
            success: false,
            error: (error as Error).message,
            path
          };
        }
      },
    }),

    writeFile: tool({
      description: 'Write or update a file in the sandbox. Use this to create new files or completely replace existing file content. For small changes, prefer editFile instead.',
      inputSchema: z.object({
        path: z.string().describe('File path, e.g., "src/components/Button.tsx"'),
        content: z.string().describe('Complete file content to write')
      }),
      execute: async ({ path, content }: { path: string; content: string }): Promise<ToolResult> => {
        console.log('[Tool Execute] writeFile called:', {
          path,
          contentLength: content?.length || 0,
          hasContent: !!content,
          contentPreview: content?.slice(0, 100)
        });
        
        const provider = (global as any).activeSandboxProvider;
        if (!provider) {
          console.error('[Tool Execute] writeFile: No active sandbox provider');
          return { success: false, error: 'No active sandbox' };
        }
        
        try {
          await provider.writeFile(path, content);
          console.log('[Tool Execute] writeFile success:', path);
          
          // Don't send progress here - wait for onStepFinish to maintain proper order
          return {
            success: true,
            message: `File ${path} written successfully`,
            path,
            size: content.length
          };
        } catch (error) {
          console.error('[Tool Execute] writeFile error:', error);
          return {
            success: false,
            error: (error as Error).message,
            path
          };
        }
      },
    }),

    installPackages: tool({
      description: 'Install npm packages in the sandbox. Use this BEFORE writing code that needs external dependencies.',
      inputSchema: z.object({
        packages: z.array(z.string()).describe('Array of package names, e.g., ["react-router-dom", "axios"]')
      }),
      execute: async ({ packages }: { packages: string[] }): Promise<ToolResult> => {
        console.log('[Tool Execute] installPackages called:', {
          packages,
          packagesCount: packages?.length || 0
        });
        
        const provider = (global as any).activeSandboxProvider;
        if (!provider) {
          console.error('[Tool Execute] installPackages: No active sandbox provider');
          return { success: false, error: 'No active sandbox' };
        }
        
        try {
          const result = await provider.installPackages(packages);
          console.log('[Tool Execute] installPackages result:', {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            packages
          });
          
          return {
            success: result.exitCode === 0,
            packages,
            message: result.exitCode === 0
              ? `Successfully installed: ${packages.join(', ')}`
              : 'Installation failed',
            stdout: result.stdout?.slice(0, 500), // Limit output length
            stderr: result.stderr?.slice(0, 500)
          };
        } catch (error) {
          console.error('[Tool Execute] installPackages error:', error);
          return {
            success: false,
            error: (error as Error).message,
            packages
          };
        }
      },
    }),
  };
}
