import { tool } from 'ai';
import { z } from 'zod';

/**
 * Sandbox Tools Module
 * 
 * Defines AI tools for interacting with the sandbox environment.
 * These tools allow the AI to write files and install packages.
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
    writeFile: tool({
      description: 'Write or update a file in the sandbox. Use this to create new files or completely replace existing file content.',
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
