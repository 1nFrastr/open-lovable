import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import type { SandboxState } from '@/types/sandbox';
import { getFileContents, formatFilesForAI } from '@/lib/context-selector';
import type { ConversationState, ConversationMessage, ConversationEdit } from '@/types/conversation';
import { appConfig } from '@/config/app.config';
import { 
  MAX_RESPONSE_SEGMENTS, 
  CONTINUE_PROMPT, 
  detectTruncation,
  extractPartialContent 
} from '@/lib/stream';

// Force dynamic route to enable streaming
export const dynamic = 'force-dynamic';

// Check if we're using Vercel AI Gateway
const isUsingAIGateway = !!process.env.AI_GATEWAY_API_KEY;
const aiGatewayBaseURL = 'https://ai-gateway.vercel.sh/v1';

console.log('[generate-ai-code-stream] AI Gateway config:', {
  isUsingAIGateway,
  hasGroqKey: !!process.env.GROQ_API_KEY,
  hasAIGatewayKey: !!process.env.AI_GATEWAY_API_KEY
});

const groq = createGroq({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GROQ_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

const anthropic = createAnthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.ANTHROPIC_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1'),
});

const googleGenerativeAI = createGoogleGenerativeAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GEMINI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : process.env.OPENAI_BASE_URL,
});

// Helper function to analyze user preferences from conversation history
function analyzeUserPreferences(messages: ConversationMessage[]): {
  commonPatterns: string[];
  preferredEditStyle: 'targeted' | 'comprehensive';
} {
  const userMessages = messages.filter(m => m.role === 'user');
  const patterns: string[] = [];
  
  // Count edit-related keywords
  let targetedEditCount = 0;
  let comprehensiveEditCount = 0;
  
  userMessages.forEach(msg => {
    const content = msg.content.toLowerCase();
    
    // Check for targeted edit patterns
    if (content.match(/\b(update|change|fix|modify|edit|remove|delete)\s+(\w+\s+)?(\w+)\b/)) {
      targetedEditCount++;
    }
    
    // Check for comprehensive edit patterns
    if (content.match(/\b(rebuild|recreate|redesign|overhaul|refactor)\b/)) {
      comprehensiveEditCount++;
    }
    
    // Extract common request patterns
    if (content.includes('hero')) patterns.push('hero section edits');
    if (content.includes('header')) patterns.push('header modifications');
    if (content.includes('color') || content.includes('style')) patterns.push('styling changes');
    if (content.includes('button')) patterns.push('button updates');
    if (content.includes('animation')) patterns.push('animation requests');
  });
  
  return {
    commonPatterns: [...new Set(patterns)].slice(0, 3), // Top 3 unique patterns
    preferredEditStyle: targetedEditCount > comprehensiveEditCount ? 'targeted' : 'comprehensive'
  };
}

declare global {
  var sandboxState: SandboxState;
  var conversationState: ConversationState | null;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, model = 'openai/gpt-oss-20b', context, isEdit = false } = await request.json();
    
    console.log('[generate-ai-code-stream] Received request:');
    console.log('[generate-ai-code-stream] - prompt:', prompt);
    console.log('[generate-ai-code-stream] - isEdit:', isEdit);
    console.log('[generate-ai-code-stream] - context.sandboxId:', context?.sandboxId);
    console.log('[generate-ai-code-stream] - context.currentFiles:', context?.currentFiles ? Object.keys(context.currentFiles) : 'none');
    console.log('[generate-ai-code-stream] - currentFiles count:', context?.currentFiles ? Object.keys(context.currentFiles).length : 0);
    
    // Define tools for AI to interact with the sandbox
    const tools: any = {
      writeFile: tool({
        description: 'Write or update a file in the sandbox. Use this to create new files or completely replace existing file content.',
        inputSchema: z.object({
          path: z.string().describe('File path, e.g., "src/components/Button.tsx"'),
          content: z.string().describe('Complete file content to write')
        }),
        execute: async ({ path, content }: { path: string; content: string }) => {
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
        execute: async ({ packages }: { packages: string[] }) => {
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
    
    // Initialize conversation state if not exists
    if (!global.conversationState) {
      global.conversationState = {
        conversationId: `conv-${Date.now()}`,
        startedAt: Date.now(),
        lastUpdated: Date.now(),
        context: {
          messages: [],
          edits: [],
          projectEvolution: { majorChanges: [] },
          userPreferences: {}
        }
      };
    }
    
    // Add user message to conversation history
    const userMessage: ConversationMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      metadata: {
        sandboxId: context?.sandboxId
      }
    };
    global.conversationState.context.messages.push(userMessage);
    
    // Clean up old messages to prevent unbounded growth
    if (global.conversationState.context.messages.length > 20) {
      // Keep only the last 15 messages
      global.conversationState.context.messages = global.conversationState.context.messages.slice(-15);
      console.log('[generate-ai-code-stream] Trimmed conversation history to prevent context overflow');
    }
    
    // Clean up old edits
    if (global.conversationState.context.edits.length > 10) {
      global.conversationState.context.edits = global.conversationState.context.edits.slice(-8);
    }
    
    // Debug: Show a sample of actual file content
    if (context?.currentFiles && Object.keys(context.currentFiles).length > 0) {
      const firstFile = Object.entries(context.currentFiles)[0];
      console.log('[generate-ai-code-stream] - sample file:', firstFile[0]);
      console.log('[generate-ai-code-stream] - sample content preview:', 
        typeof firstFile[1] === 'string' ? firstFile[1].substring(0, 100) + '...' : 'not a string');
    }
    
    if (!prompt) {
      return NextResponse.json({ 
        success: false, 
        error: 'Prompt is required' 
      }, { status: 400 });
    }
    
    // Create a stream for real-time updates
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Function to send progress updates with flushing
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      try {
        await writer.write(encoder.encode(message));
        // Force flush by writing a keep-alive comment
        if (data.type === 'stream' || data.type === 'conversation') {
          await writer.write(encoder.encode(': keepalive\n\n'));
        }
      } catch (error) {
        console.error('[generate-ai-code-stream] Error writing to stream:', error);
      }
    };
    
    // Start processing in background
    (async () => {
      try {
        // Send initial status
        await sendProgress({ type: 'status', message: 'Initializing AI...' });
        
        // No keep-alive needed - sandbox provisioned for 10 minutes
        
        // Build conversation context for system prompt
        let conversationContext = '';
        if (global.conversationState && global.conversationState.context.messages.length > 1) {
          console.log('[generate-ai-code-stream] Building conversation context');
          console.log('[generate-ai-code-stream] Total messages:', global.conversationState.context.messages.length);
          console.log('[generate-ai-code-stream] Total edits:', global.conversationState.context.edits.length);
          
          conversationContext = `\n\n## Conversation History (Recent)\n`;
          
          // Include only the last 3 edits to save context
          const recentEdits = global.conversationState.context.edits.slice(-3);
          if (recentEdits.length > 0) {
            console.log('[generate-ai-code-stream] Including', recentEdits.length, 'recent edits in context');
            conversationContext += `\n### Recent Edits:\n`;
            recentEdits.forEach(edit => {
              conversationContext += `- "${edit.userRequest}" → ${edit.editType} (${edit.targetFiles.map(f => f.split('/').pop()).join(', ')})\n`;
            });
          }
          
          // Include recently created files - CRITICAL for preventing duplicates
          const recentMsgs = global.conversationState.context.messages.slice(-5);
          const recentlyCreatedFiles: string[] = [];
          recentMsgs.forEach(msg => {
            if (msg.metadata?.editedFiles) {
              recentlyCreatedFiles.push(...msg.metadata.editedFiles);
            }
          });
          
          if (recentlyCreatedFiles.length > 0) {
            const uniqueFiles = [...new Set(recentlyCreatedFiles)];
            conversationContext += `\n### 🚨 RECENTLY CREATED/EDITED FILES (DO NOT RECREATE THESE):\n`;
            uniqueFiles.forEach(file => {
              conversationContext += `- ${file}\n`;
            });
            conversationContext += `\nIf the user mentions any of these components, UPDATE the existing file!\n`;
          }
          
          // Include only last 5 messages for context (reduced from 10)
          const recentMessages = recentMsgs;
          if (recentMessages.length > 2) { // More than just current message
            conversationContext += `\n### Recent Messages:\n`;
            recentMessages.slice(0, -1).forEach(msg => { // Exclude current message
              if (msg.role === 'user') {
                const truncatedContent = msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content;
                conversationContext += `- "${truncatedContent}"\n`;
              }
            });
          }
          
          // Include only last 2 major changes
          const majorChanges = global.conversationState.context.projectEvolution.majorChanges.slice(-2);
          if (majorChanges.length > 0) {
            conversationContext += `\n### Recent Changes:\n`;
            majorChanges.forEach(change => {
              conversationContext += `- ${change.description}\n`;
            });
          }
          
          // Keep user preferences - they're concise
          const userPrefs = analyzeUserPreferences(global.conversationState.context.messages);
          if (userPrefs.commonPatterns.length > 0) {
            conversationContext += `\n### User Preferences:\n`;
            conversationContext += `- Edit style: ${userPrefs.preferredEditStyle}\n`;
          }
          
          // Limit total conversation context length
          if (conversationContext.length > 2000) {
            conversationContext = conversationContext.substring(0, 2000) + '\n[Context truncated to prevent length errors]';
          }
        }
        
        // Build system prompt with conversation awareness
        let systemPrompt = `🔧 AVAILABLE TOOLS:
You have access to these tools to interact with the sandbox:

1. **writeFile(path, content)** - Create or update files
   - Use this for ALL file operations
   - Replaces the old <file> XML tag format
   - Path example: "src/components/Button.tsx"
   - Content: Complete file content as a string

2. **installPackages(packages[])** - Install npm packages
   - Use this BEFORE writing code that needs external dependencies
   - Replaces the old <package>/<packages> XML tags
   - Example: installPackages(["react-router-dom", "axios"])

TOOL USAGE WORKFLOW:
- For multiple files: Call writeFile multiple times, one per file
- For packages + code: Call installPackages first, then writeFile
- Files are provided in context for your reference

EXAMPLE WORKFLOW:
User: "Add React Router navigation"
Your approach:
1. installPackages(["react-router-dom", "@types/react-router-dom"])
2. writeFile("src/App.tsx", <updated App with Router>)
3. writeFile("src/components/Navbar.tsx", <new Navbar component>)

⚠️ IMPORTANT:
- DO NOT use XML tags like <file>, <package> anymore
- Use the tools instead - they are more reliable
- You can see all existing files in the context provided

---

You are an expert React + TypeScript developer. Generate clean, CONCISE React code for Vite applications.

🚨 CODE BREVITY IS CRITICAL - AVOID TOKEN LIMITS 🚨
Your response may be truncated if too long. Follow these rules to keep code SHORT:

1. **MINIMAL FILES**: 
   - Simple apps (todo, counter, form) = 2-3 files MAX (App.tsx + 1-2 components)
   - DO NOT split into Header/Footer/Stats for simple apps
   - Only create separate components if they have COMPLEX logic or are REUSED

2. **CONCISE CODE**:
   - NO excessive comments - code should be self-documenting
   - NO redundant type annotations when TypeScript can infer them
   - Use SHORT but clear variable names
   - Prefer inline styles over separate className variables
   - ONE line for simple returns: const fn = () => <div>text</div>

3. **SIMPLE STYLING**:
   - Use BASIC Tailwind: p-4, m-2, bg-white, text-gray-800, rounded, shadow
   - NO excessive animations (skip hover:scale-105, transition-all unless needed)
   - NO gradient backgrounds unless requested
   - MINIMAL responsive variants - mobile-first, add sm:/md: only if needed

4. **COMPONENT STRUCTURE**:
   - For simple apps, put ALL logic in App.tsx
   - Only extract components when they exceed 50 lines or are reused
   - Inline small UI pieces instead of creating tiny components

TYPESCRIPT (required):
- ALL files use .tsx extension
- Use TypeScript types but keep them MINIMAL
- Prefer inline types over separate interfaces for simple props

FILE CONVENTIONS:
- Components: src/components/Name.tsx
- Main: src/App.tsx
- Entry: src/main.tsx (DO NOT MODIFY - contains critical CSS import)
- Styles: src/index.css

🚨 NEVER MODIFY src/main.tsx 🚨
The main.tsx file contains the critical CSS import (import './index.css') that enables Tailwind CSS.
If you modify or regenerate main.tsx without this import, ALL STYLES WILL BREAK.
Only modify main.tsx if explicitly requested AND always preserve: import './index.css'

${conversationContext}

🚨 CRITICAL RULES:
1. DO EXACTLY what is asked - nothing more
2. CHECK App.tsx first before creating new components
3. USE STANDARD Tailwind only (bg-white, text-gray-900 - NOT bg-background)
4. FILE LIMITS: Simple change=1 file, new component=2 files MAX
5. NO custom SVGs - use lucide-react icons or emoji placeholders

${isEdit ? `CRITICAL: THIS IS AN EDIT TO AN EXISTING APPLICATION

YOU MUST FOLLOW THESE EDIT RULES:
0. NEVER create tailwind.config.js, vite.config.ts, package.json, or any other config files - they already exist!
1. DO NOT regenerate the entire application
2. DO NOT create files that already exist (like App.tsx, index.css, tailwind.config.js)
3. ONLY edit the EXACT files needed for the requested change - NO MORE, NO LESS
4. If the user says "update the header", ONLY edit the Header component - DO NOT touch Footer, Hero, or any other components
5. If the user says "change the color", ONLY edit the relevant style or component file - DO NOT "improve" other parts
6. If you're unsure which file to edit, choose the SINGLE most specific one related to the request
7. IMPORTANT: When adding new components or libraries:
   - Create the new component file
   - UPDATE ONLY the parent component that will use it
   - Example: Adding a Newsletter component means:
     * Create Newsletter.tsx
     * Update ONLY the file that will use it (e.g., Footer.tsx OR App.tsx) - NOT both
8. When adding npm packages:
   - Import them ONLY in the files where they're actually used
   - The system will auto-install missing packages

CRITICAL FILE MODIFICATION RULES - VIOLATION = FAILURE:
- **NEVER TRUNCATE FILES** - Always return COMPLETE files with ALL content
- **NO ELLIPSIS (...)** - Include every single line of code, no skipping
- Files MUST be complete and runnable - include ALL imports, functions, JSX, and closing tags
- Count the files you're about to generate
- If the user asked to change ONE thing, you should generate ONE file (or at most two if adding a new component)
- DO NOT "fix" or "improve" files that weren't mentioned in the request
- DO NOT update multiple components when only one was requested
- DO NOT add features the user didn't ask for
- RESIST the urge to be "helpful" by updating related files

CRITICAL: DO NOT REDESIGN OR REIMAGINE COMPONENTS
- "update" means make a small change, NOT redesign the entire component
- "change X to Y" means ONLY change X to Y, nothing else
- "fix" means repair what's broken, NOT rewrite everything
- "remove X" means delete X from the existing file, NOT create a new file
- "delete X" means remove X from where it currently exists
- Preserve ALL existing functionality and design unless explicitly asked to change it

NEVER CREATE NEW FILES WHEN THE USER ASKS TO REMOVE/DELETE SOMETHING
If the user says "remove X", you must:
1. Find which existing file contains X
2. Edit that file to remove X
3. DO NOT create any new files

VIOLATION OF THESE RULES WILL RESULT IN FAILURE!
` : ''}

CRITICAL INCREMENTAL UPDATE RULES:
- When the user asks for additions or modifications (like "add a videos page", "create a new component", "update the header"):
  - DO NOT regenerate the entire application
  - DO NOT recreate files that already exist unless explicitly asked
  - ONLY create/modify the specific files needed for the requested change
  - Preserve all existing functionality and files
  - If adding a new page/route, integrate it with the existing routing system
  - Reference existing components and styles rather than duplicating them
  - NEVER recreate config files (tailwind.config.js, vite.config.js, package.json, etc.)

IMPORTANT: When the user asks for edits or modifications:
- You have access to the current file contents in the context
- Make targeted changes to existing files rather than regenerating everything
- Preserve the existing structure and only modify what's requested
- If you need to see a specific file that's not in context, mention it

IMPORTANT: You have access to the full conversation context including:
- Previously scraped websites and their content
- Components already generated and applied
- The current project being worked on
- Recent conversation history
- Any Vite errors that need to be resolved

When the user references "the app", "the website", or "the site" without specifics, refer to:
1. The most recently scraped website in the context
2. The current project name in the context
3. The files currently in the sandbox

If you see scraped websites in the context, you're working on a clone/recreation of that site.

UI RULES:
- NO emojis in code/UI
- Mobile-first responsive design (sm:, md:, lg:)
- Use semantic HTML

STYLING RULES:
- Use Tailwind CSS ONLY - no inline styles, no CSS files except index.css
- Use STANDARD Tailwind classes: bg-white, text-gray-900, border-gray-200 (NOT bg-background, text-foreground)
- Keep styling SIMPLE:
  - Buttons: "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
  - Cards: "bg-white rounded shadow p-4 border border-gray-200"
  - Containers: "max-w-2xl mx-auto p-4"

STRING RULES:
- Use double quotes for strings with apostrophes: "you're"
- Convert smart quotes to straight quotes
- For code in JSX: use template literals {\`code here\`}

APP CREATION RULES:
- NEVER create config files (vite.config.ts, tailwind.config.js, package.json) - they exist!
- For SIMPLE apps: Put everything in App.tsx (no separate Header/Footer needed)
- For WEBSITE clones: Create Header, sections, Footer as needed
- ALWAYS complete ALL files you import - no placeholders

SCRAPED CONTENT: Sanitize quotes - use double quotes for text with apostrophes.

IMPORTANT: NEVER create config files - they already exist (vite.config.ts, tailwind.config.js, package.json)!

USER INTENT:
- "add X" / "update X" / "fix X" → Modify ONLY the specific feature/file
- "rebuild" / "start over" → Full regeneration
- Default: Make minimal, targeted changes
  - New feature = 2 files MAX (feature + parent)
- If you're editing >3 files for a simple request, STOP - you're doing too much

EXAMPLES OF CORRECT SURGICAL EDITS:
✅ "change header to black" → Find className="..." in Header.tsx, change ONLY color classes
✅ "update hero text" → Find the <h1> or <p> in Hero.tsx, change ONLY the text inside
✅ "add a button to hero" → Find the return statement, ADD button, keep everything else
❌ WRONG: Regenerating entire Header.tsx to change one color
❌ WRONG: Rewriting Hero.tsx to add one button

NAVIGATION/HEADER INTELLIGENCE:
- ALWAYS check App.tsx imports first
- Navigation is usually INSIDE Header.tsx, not separate
- If user says "nav", check Header.tsx FIRST
- Only create Nav.tsx if no navigation exists anywhere
- Logo, menu, hamburger = all typically in Header

CRITICAL: When files are provided in the context:
1. The user is asking you to MODIFY the existing app, not create a new one
2. Find the relevant file(s) from the provided context
3. Generate ONLY the files that need changes
4. Do NOT ask to see files - they are already provided in the context above
5. Make the requested change immediately`;

        // Build full prompt with context
        let fullPrompt = prompt;
        if (context) {
          const contextParts = [];
          
          if (context.sandboxId) {
            contextParts.push(`Current sandbox ID: ${context.sandboxId}`);
          }
          
          if (context.structure) {
            contextParts.push(`Current file structure:\n${context.structure}`);
          }
          
          // Use backend file cache instead of frontend-provided files
          let backendFiles = global.sandboxState?.fileCache?.files || {};
          let hasBackendFiles = Object.keys(backendFiles).length > 0;
          
          console.log('[generate-ai-code-stream] Backend file cache status:');
          console.log('[generate-ai-code-stream] - Has sandboxState:', !!global.sandboxState);
          console.log('[generate-ai-code-stream] - Has fileCache:', !!global.sandboxState?.fileCache);
          console.log('[generate-ai-code-stream] - File count:', Object.keys(backendFiles).length);
          console.log('[generate-ai-code-stream] - Has manifest:', !!global.sandboxState?.fileCache?.manifest);
          
          // If no backend files and we're in edit mode, try to fetch from sandbox
          if (!hasBackendFiles && isEdit && (global.activeSandboxProvider || context?.sandboxId)) {
            console.log('[generate-ai-code-stream] No backend files, attempting to fetch from sandbox...');
            
            try {
              const filesResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/get-sandbox-files`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              });
              
              if (filesResponse.ok) {
                const filesData = await filesResponse.json();
                if (filesData.success && filesData.files) {
                  console.log('[generate-ai-code-stream] Successfully fetched', Object.keys(filesData.files).length, 'files from sandbox');
                  
                  // Initialize sandboxState if needed
                  if (!global.sandboxState) {
                    global.sandboxState = {
                      fileCache: {
                        files: {},
                        lastSync: Date.now(),
                        sandboxId: context?.sandboxId || 'unknown'
                      }
                    } as any;
                  } else if (!global.sandboxState.fileCache) {
                    global.sandboxState.fileCache = {
                      files: {},
                      lastSync: Date.now(),
                      sandboxId: context?.sandboxId || 'unknown'
                    };
                  }
                  
                  // Store files in cache
                  for (const [path, content] of Object.entries(filesData.files)) {
                    const normalizedPath = path.replace('/home/user/app/', '');
                    if (global.sandboxState.fileCache) {
                      global.sandboxState.fileCache.files[normalizedPath] = {
                        content: content as string,
                        lastModified: Date.now()
                      };
                    }
                  }
                  
                  if (filesData.manifest && global.sandboxState.fileCache) {
                    global.sandboxState.fileCache.manifest = filesData.manifest;
                    // TODO: Re-implement edit intent analysis here
                  }
                  
                  // Update variables
                  backendFiles = global.sandboxState.fileCache?.files || {};
                  hasBackendFiles = Object.keys(backendFiles).length > 0;
                  console.log('[generate-ai-code-stream] Updated backend cache with fetched files');
                }
              }
            } catch (error) {
              console.error('[generate-ai-code-stream] Failed to fetch sandbox files:', error);
            }
          }
          
          // Include current file contents from backend cache
          if (hasBackendFiles) {
            contextParts.push('\nEXISTING APPLICATION - TARGETED EDIT REQUIRED');
            contextParts.push('\nYou MUST analyze the user request and determine which specific file(s) to edit.');
            contextParts.push('\nCurrent project files (DO NOT regenerate all of these):');
            
            const fileEntries = Object.entries(backendFiles);
            console.log(`[generate-ai-code-stream] Using backend cache: ${fileEntries.length} files`);
            
            // Show file list first for reference
            contextParts.push('\n### File List:');
            for (const [path] of fileEntries) {
              contextParts.push(`- ${path}`);
            }
            
            // Include ALL files as context
            contextParts.push('\n### File Contents (ALL FILES FOR CONTEXT):');
            for (const [path, fileData] of fileEntries) {
              const content = fileData.content;
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
          } else if (context.currentFiles && Object.keys(context.currentFiles).length > 0) {
            // Fallback to frontend-provided files if backend cache is empty
            console.log('[generate-ai-code-stream] Warning: Backend cache empty, using frontend files');
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
        }
        
        await sendProgress({ type: 'status', message: 'Planning application structure...' });
        
        console.log('\n[generate-ai-code-stream] Starting streaming response...\n');
        
        // Track packages that need to be installed
        const packagesToInstall: string[] = [];
        
        // Determine which provider to use based on model
        const isAnthropic = model.startsWith('anthropic/');
        const isGoogle = model.startsWith('google/');
        const isOpenAI = model.startsWith('openai/');
        const isKimiGroq = model === 'moonshotai/kimi-k2-instruct-0905';
        const modelProvider = isAnthropic ? anthropic : 
                              (isOpenAI ? openai : 
                              (isGoogle ? googleGenerativeAI : 
                              (isKimiGroq ? groq : groq)));
        
        // Fix model name transformation for different providers
        let actualModel: string;
        if (isAnthropic) {
          actualModel = model.replace('anthropic/', '');
        } else if (isOpenAI) {
          actualModel = model.replace('openai/', '');
        } else if (isKimiGroq) {
          // Kimi on Groq - use full model string
          actualModel = 'moonshotai/kimi-k2-instruct-0905';
        } else if (isGoogle) {
          // Google uses specific model names - convert our naming to theirs  
          actualModel = model.replace('google/', '');
        } else {
          actualModel = model;
        }

        console.log(`[generate-ai-code-stream] Using provider: ${isAnthropic ? 'Anthropic' : isGoogle ? 'Google' : isOpenAI ? 'OpenAI' : 'Groq'}, model: ${actualModel}`);
        console.log(`[generate-ai-code-stream] AI Gateway enabled: ${isUsingAIGateway}`);
        console.log(`[generate-ai-code-stream] Model string: ${model}`);

        // Check if the current model supports tool calling
        // Enable for OpenAI and Anthropic models (both support tool calling in AI SDK)
        const supportsTools = isOpenAI || isAnthropic;
        
        console.log(`[generate-ai-code-stream] Tool calling ${supportsTools ? 'ENABLED' : 'DISABLED'} for this model (provider: ${isAnthropic ? 'Anthropic' : isGoogle ? 'Google' : isOpenAI ? 'OpenAI' : 'Groq'})`);
        
        // Make streaming API call with appropriate provider
        const streamOptions: any = {
          model: modelProvider(actualModel),
          messages: [
            { 
              role: 'system', 
              content: systemPrompt + `

🚨 CRITICAL CODE GENERATION RULES - VIOLATION = FAILURE 🚨:
1. NEVER truncate ANY code - ALWAYS write COMPLETE files
2. NEVER use "..." anywhere in your code - this causes syntax errors
3. NEVER cut off strings mid-sentence - COMPLETE every string
4. NEVER leave incomplete class names or attributes
5. ALWAYS close ALL tags, quotes, brackets, and parentheses
6. If you run out of space, prioritize completing the current file

CRITICAL STRING RULES TO PREVENT SYNTAX ERRORS:
- NEVER write: className="px-8 py-4 bg-black text-white font-bold neobrut-border neobr...
- ALWAYS write: className="px-8 py-4 bg-black text-white font-bold neobrut-border neobrut-shadow"
- COMPLETE every className attribute
- COMPLETE every string literal
- NO ellipsis (...) ANYWHERE in code

PACKAGE RULES:
- For INITIAL generation: Use ONLY React, no external packages
- For EDITS: You may use packages, specify them with <package> tags
- NEVER install packages like @mendable/firecrawl-js unless explicitly requested

Examples of SYNTAX ERRORS (NEVER DO THIS):
❌ className="px-4 py-2 bg-blue-600 hover:bg-blue-7...
❌ <button className="btn btn-primary btn-...
❌ const title = "Welcome to our...
❌ import { useState, useEffect, ... } from 'react'

Examples of CORRECT CODE (ALWAYS DO THIS):
✅ className="px-4 py-2 bg-blue-600 hover:bg-blue-700"
✅ <button className="btn btn-primary btn-large">
✅ const title = "Welcome to our application"
✅ import { useState, useEffect, useCallback } from 'react'

REMEMBER: It's better to generate fewer COMPLETE files than many INCOMPLETE files.`
            },
            { 
              role: 'user', 
              content: fullPrompt + `

CRITICAL: You MUST provide COMPLETE file content when calling writeFile().

NEVER write partial code - always include the ENTIRE file from start to finish.

If you're running out of space, generate FEWER files but make them COMPLETE.
It's better to have 3 complete files than 10 incomplete files.

Remember: Use writeFile(path, content) for every file you create or modify.`
            }
          ],
          maxTokens: 8192, // Reduce to ensure completion
          stopSequences: [] // Don't stop early
        };
        
        // ✅ Enable tool calling only for supported models
        if (supportsTools) {
          console.log('[generate-ai-code-stream] Enabling tool calling with tools:', Object.keys(tools));
          console.log('[generate-ai-code-stream] Tool calling mode for:', isAnthropic ? 'Anthropic Claude' : isOpenAI ? 'OpenAI GPT' : 'Unknown');
          
          streamOptions.tools = tools;
          streamOptions.toolChoice = 'auto';  // AI automatically decides when to call tools
          streamOptions.maxSteps = 5;  // Limit to 5 rounds of tool calling (conservative for MVP)
          
          // ✅ Tool call callback
          streamOptions.onStepFinish = async (step: any) => {
            console.log('[generate-ai-code-stream] onStepFinish called:', {
              stepType: step.stepType,
              finishReason: step.finishReason,
              hasToolCalls: !!step.toolCalls,
              toolCallsCount: step.toolCalls?.length || 0,
              hasToolResults: !!step.toolResults,
              toolResultsCount: step.toolResults?.length || 0
            });
            
            if (step.toolCalls && step.toolCalls.length > 0) {
              for (const toolCall of step.toolCalls) {
                // AI SDK v6 uses 'input' not 'args'
                console.log(`[Tool Call] ${toolCall.toolName}`, {
                  toolCallId: toolCall.toolCallId,
                  input: toolCall.input,
                  hasInput: !!toolCall.input
                });
                
                // Track files created via writeFile tool
                if (toolCall.toolName === 'writeFile' && toolCall.input) {
                  toolCalledFiles.push({
                    path: toolCall.input.path,
                    content: toolCall.input.content
                  });
                  console.log(`[generate-ai-code-stream] Tracked file from tool call: ${toolCall.input.path}`);
                  
                  // Send file write progress to frontend
                  await sendProgress({
                    type: 'file',
                    action: 'write',
                    path: toolCall.input.path,
                    size: toolCall.input.content?.length || 0
                  });
                } else if (toolCall.toolName === 'installPackages' && toolCall.input) {
                  // Send package install progress to frontend
                  const packages = toolCall.input.packages || [];
                  for (const pkg of packages) {
                    if (!packagesToInstall.includes(pkg)) {
                      packagesToInstall.push(pkg);
                    }
                    await sendProgress({
                      type: 'package',
                      name: pkg,
                      message: `Installing package: ${pkg}`
                    });
                  }
                }
                
                // Send tool call event to frontend (for debugging/logging)
                await sendProgress({
                  type: 'tool-call',
                  tool: toolCall.toolName,
                  args: toolCall.input,  // AI SDK v6: use 'input' not 'args'
                  result: toolCall.result
                });
              }
            }
            
            if (step.toolResults && step.toolResults.length > 0) {
              console.log('[generate-ai-code-stream] Tool results:', step.toolResults.map((r: any) => ({
                toolName: r.toolName,
                toolCallId: r.toolCallId,
                hasResult: !!r.result,
                resultPreview: r.result 
                  ? (typeof r.result === 'string' ? r.result.slice(0, 100) : JSON.stringify(r.result).slice(0, 100))
                  : 'no result'
              })));
            }
          };
        }
        
        // Add temperature for non-reasoning models
        if (!model.startsWith('openai/gpt-5')) {
          streamOptions.temperature = 0.7;
        }
        
        // Add reasoning effort for GPT-5 models
        if (isOpenAI) {
          streamOptions.experimental_providerMetadata = {
            openai: {
              reasoningEffort: 'high'
            }
          };
        }
        
        // Streaming state for continuation support
        let generatedCode = '';
        let currentFile = '';
        let currentFilePath = '';
        let componentCount = 0;
        let isInFile = false;
        let isInTag = false;
        let conversationalBuffer = '';
        let tagBuffer = '';
        let continuationCount = 0;
        
        // Track files created via tool calls (when not using XML format)
        const toolCalledFiles: Array<{ path: string; content: string }> = [];
        
        // Message history for continuation
        const conversationMessages: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
          { role: 'system', content: streamOptions.messages[0].content as string },
          { role: 'user', content: streamOptions.messages[1].content as string }
        ];
        
        /**
         * Stream processing function - can be called recursively for continuation
         */
        async function processStream(currentStreamOptions: any): Promise<string> {
          let result;
          let retryCount = 0;
          const maxRetries = 2;
          
          while (retryCount <= maxRetries) {
            try {
              result = await streamText(currentStreamOptions);
              break; // Success, exit retry loop
            } catch (streamError: any) {
              console.error(`[generate-ai-code-stream] Error calling streamText (attempt ${retryCount + 1}/${maxRetries + 1}):`, streamError);
              
              // Check if this is a Groq service unavailable error
              const isGroqServiceError = isKimiGroq && streamError.message?.includes('Service unavailable');
              const isRetryableError = streamError.message?.includes('Service unavailable') || 
                                      streamError.message?.includes('rate limit') ||
                                      streamError.message?.includes('timeout');
              
              if (retryCount < maxRetries && isRetryableError) {
                retryCount++;
                console.log(`[generate-ai-code-stream] Retrying in ${retryCount * 2} seconds...`);
                
                // Send progress update about retry
                await sendProgress({ 
                  type: 'info', 
                  message: `Service temporarily unavailable, retrying (attempt ${retryCount + 1}/${maxRetries + 1})...` 
                });
                
                // Wait before retry with exponential backoff
                await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
                
                // If Groq fails, try switching to a fallback model
                if (isGroqServiceError && retryCount === maxRetries) {
                  console.log('[generate-ai-code-stream] Groq service unavailable, falling back to GPT-4');
                  currentStreamOptions.model = openai('gpt-4-turbo');
                  actualModel = 'gpt-4-turbo';
                }
              } else {
                // Final error, send to user
                await sendProgress({ 
                  type: 'error', 
                  message: `Failed to initialize ${isGoogle ? 'Gemini' : isAnthropic ? 'Claude' : isOpenAI ? 'GPT-5' : isKimiGroq ? 'Kimi (Groq)' : 'Groq'} streaming: ${streamError.message}` 
                });
                
                // If this is a Google model error, provide helpful info
                if (isGoogle) {
                  await sendProgress({ 
                    type: 'info', 
                    message: 'Tip: Make sure your GEMINI_API_KEY is set correctly and has proper permissions.' 
                  });
                }
                
                throw streamError;
              }
            }
          }
          
          // Track content generated in this segment
          let segmentContent = '';
          
          // Track current tool call for streaming tool arguments
          let currentToolCall: { toolName: string; toolCallId: string; argsText: string } | null = null;
          
          // Stream the response using fullStream to capture tool call events
          for await (const chunk of result?.fullStream || []) {
            // Handle different chunk types from fullStream
            if (chunk.type === 'text-delta') {
              // Text content streaming (same as before)
              const text = chunk.text || '';
              generatedCode += text;
              segmentContent += text;
              currentFile += text;
              
              // Log streaming chunks to console
              process.stdout.write(text);
              
              // Stream any conversational text (AI explaining what it's doing)
              // Note: Most output will be tool calls now, not XML tags
              if (text.trim() && !text.includes('```')) {
                conversationalBuffer += text;
                
                // Send conversational updates in chunks
                if (conversationalBuffer.length > 100) {
                  await sendProgress({ 
                    type: 'conversation', 
                    text: conversationalBuffer.trim()
                  });
                  conversationalBuffer = '';
                }
              }
              
              // Stream the raw text for live preview
              await sendProgress({ 
                type: 'stream', 
                text: text,
                raw: true 
              });
              
              // Debug: Log every 100 characters streamed
              if (generatedCode.length % 100 < text.length) {
                console.log(`[generate-ai-code-stream] Streamed ${generatedCode.length} chars`);
              }
            } else if (chunk.type === 'tool-call') {
              // Tool call started - immediately notify frontend
              console.log(`[generate-ai-code-stream] Tool call started: ${chunk.toolName}`, {
                toolCallId: chunk.toolCallId
              });
              
              // Initialize current tool call tracking
              currentToolCall = {
                toolName: chunk.toolName,
                toolCallId: chunk.toolCallId,
                argsText: ''
              };
              
              // Send immediate notification that tool is being called
              await sendProgress({
                type: 'tool-call-start',
                tool: chunk.toolName,
                toolCallId: chunk.toolCallId,
                message: chunk.toolName === 'writeFile' 
                  ? '📝 Writing file...' 
                  : chunk.toolName === 'installPackages'
                    ? '📦 Installing packages...'
                    : `🔧 Calling ${chunk.toolName}...`
              });
            } else if (chunk.type === 'tool-input-start') {
              // Tool call argument streaming started
              console.log(`[generate-ai-code-stream] Tool argument streaming started: ${chunk.toolName}`);
              
              currentToolCall = {
                toolName: chunk.toolName,
                toolCallId: chunk.id, // AI SDK v6 uses 'id' not 'toolCallId'
                argsText: ''
              };
              
              // Send notification that tool call is starting
              await sendProgress({
                type: 'tool-call-start',
                tool: chunk.toolName,
                toolCallId: chunk.id,
                message: chunk.toolName === 'writeFile' 
                  ? '📝 Writing file...' 
                  : chunk.toolName === 'installPackages'
                    ? '📦 Installing packages...'
                    : `🔧 Calling ${chunk.toolName}...`
              });
            } else if (chunk.type === 'tool-input-delta') {
              // Tool call arguments being streamed
              if (currentToolCall) {
                currentToolCall.argsText += chunk.delta || ''; // AI SDK v6 uses 'delta' not 'inputTextDelta'
                
                // Try to extract file path from partial args for writeFile
                if (currentToolCall.toolName === 'writeFile') {
                  // Try to parse partial JSON to get the path
                  const pathMatch = currentToolCall.argsText.match(/"path"\s*:\s*"([^"]+)"/);
                  if (pathMatch && !currentToolCall.argsText.includes('__pathSent')) {
                    // Mark that we've sent the path to avoid duplicates
                    currentToolCall.argsText += '__pathSent';
                    
                    await sendProgress({
                      type: 'tool-call-progress',
                      tool: 'writeFile',
                      toolCallId: currentToolCall.toolCallId,
                      path: pathMatch[1],
                      message: `📝 Writing file: ${pathMatch[1]}`
                    });
                  }
                  
                  // Stream content length updates periodically
                  const contentMatch = currentToolCall.argsText.match(/"content"\s*:\s*"([\s\S]*)/);
                  if (contentMatch) {
                    const contentLength = contentMatch[1].length;
                    // Send progress every ~500 chars
                    if (contentLength % 500 < 10) {
                      await sendProgress({
                        type: 'tool-call-progress',
                        tool: 'writeFile',
                        toolCallId: currentToolCall.toolCallId,
                        bytesWritten: contentLength,
                        message: `Writing... ${Math.round(contentLength / 1024 * 10) / 10}KB`
                      });
                    }
                  }
                } else if (currentToolCall.toolName === 'installPackages') {
                  // Try to extract packages list
                  const packagesMatch = currentToolCall.argsText.match(/"packages"\s*:\s*\[([\s\S]*)/);
                  if (packagesMatch) {
                    // Extract individual package names as they appear
                    const pkgMatches = packagesMatch[1].matchAll(/"([^"]+)"/g);
                    for (const match of pkgMatches) {
                      const pkg = match[1];
                      if (!packagesToInstall.includes(pkg)) {
                        packagesToInstall.push(pkg);
                        await sendProgress({
                          type: 'tool-call-progress',
                          tool: 'installPackages',
                          toolCallId: currentToolCall.toolCallId,
                          package: pkg,
                          message: `📦 Will install: ${pkg}`
                        });
                      }
                    }
                  }
                }
              }
            } else if (chunk.type === 'tool-result') {
              // Tool execution completed
              console.log(`[generate-ai-code-stream] Tool result received: ${chunk.toolName}`);
              
              await sendProgress({
                type: 'tool-call-complete',
                tool: chunk.toolName,
                toolCallId: chunk.toolCallId,
                result: chunk.output // AI SDK v6 uses 'output' not 'result'
              });
              
              // Reset current tool call tracking
              currentToolCall = null;
            } else if (chunk.type === 'reasoning-delta') {
              // Extended thinking/reasoning (for models that support it)
              await sendProgress({
                type: 'thinking',
                text: chunk.text || '' // AI SDK v6 uses 'text' not 'textDelta' for reasoning-delta
              });
            } else if (chunk.type === 'finish') {
              // Stream finished
              console.log(`[generate-ai-code-stream] Stream finished: ${chunk.finishReason}`);
            }
          }
          
          // Check finish reason after stream completes
          const finishReason = await result?.finishReason;
          const usage = await result?.usage;
          
          console.log(`\n[generate-ai-code-stream] Segment ${continuationCount + 1} complete:`, {
            finishReason,
            tokens: usage?.totalTokens || 'unknown',
            segmentLength: segmentContent.length,
            totalLength: generatedCode.length
          });
          
          // Special logging for tool-calls finish reason
          if (finishReason === 'tool-calls') {
            console.log('[generate-ai-code-stream] ⚠️  Finish reason is "tool-calls" - tools were called but response may not contain file content in XML format');
            console.log('[generate-ai-code-stream] Tool calling is working, but files may need to be retrieved from tool results instead of generated text');
          }
          
          // Check if response was truncated due to token limit
          if (finishReason === 'length' && continuationCount < MAX_RESPONSE_SEGMENTS) {
            // Response was truncated, need to continue
            continuationCount++;
            const segmentsLeft = MAX_RESPONSE_SEGMENTS - continuationCount;
            
            console.log(`[generate-ai-code-stream] Response truncated! Continuing... (${segmentsLeft} continuation(s) remaining)`);
            
            // Send progress update (user-visible)
            await sendProgress({ 
              type: 'info', 
              message: `Response was long, continuing generation... (${continuationCount}/${MAX_RESPONSE_SEGMENTS + 1})` 
            });
            
            // Extract partial content info for better continuation
            const { partialFilePath, partialFileContent } = extractPartialContent(segmentContent);
            
            // Build continuation context
            let continuationContext = CONTINUE_PROMPT;
            if (partialFilePath && partialFileContent) {
              continuationContext += `\n\nYou were generating file "${partialFilePath}". The partial content so far is:\n${partialFileContent.slice(-500)}\n\nContinue from exactly where you left off.`;
            }
            
            // Add current content as assistant message and continue prompt as user message
            conversationMessages.push({ role: 'assistant', content: segmentContent });
            conversationMessages.push({ role: 'user', content: continuationContext });
            
            // Create new stream options for continuation
            const continuationOptions = {
              ...currentStreamOptions,
              messages: conversationMessages.map(msg => ({
                role: msg.role,
                content: msg.content
              }))
            };
            
            // Recursively process the continuation
            const continuationContent = await processStream(continuationOptions);
            return segmentContent + continuationContent;
          }
          
          // Check for content-based truncation (backup detection)
          const truncationCheck = detectTruncation(generatedCode);
          if (truncationCheck.isTruncated && continuationCount < MAX_RESPONSE_SEGMENTS && finishReason !== 'stop') {
            console.warn(`[generate-ai-code-stream] Content truncation detected: ${truncationCheck.reason}`);
            
            // Only auto-continue if truncation is severe
            if (truncationCheck.reason?.includes('Unclosed file tags')) {
              continuationCount++;
              
              await sendProgress({ 
                type: 'warning', 
                message: `Detected incomplete content, attempting to complete... (${continuationCount}/${MAX_RESPONSE_SEGMENTS + 1})` 
              });
              
              // Add current content and continue prompt
              conversationMessages.push({ role: 'assistant', content: segmentContent });
              conversationMessages.push({ role: 'user', content: CONTINUE_PROMPT + '\n\nIMPORTANT: The previous response was cut off mid-file. Complete the file and close all tags.' });
              
              const continuationOptions = {
                ...currentStreamOptions,
                messages: conversationMessages.map(msg => ({
                  role: msg.role,
                  content: msg.content
                }))
              };
              
              const continuationContent = await processStream(continuationOptions);
              return segmentContent + continuationContent;
            }
          }
          
          return segmentContent;
        }
        
        // Start processing the stream
        await processStream(streamOptions);
        
        console.log(`\n\n[generate-ai-code-stream] Streaming complete. Total continuations: ${continuationCount}`);
        
        // Send any remaining conversational text
        if (conversationalBuffer.trim()) {
          await sendProgress({ 
            type: 'conversation', 
            text: conversationalBuffer.trim()
          });
        }
        
        // Also parse <packages> tag for multiple packages - ONLY for edits
        if (isEdit) {
          const packagesRegex = /<packages>([\s\S]*?)<\/packages>/g;
          let packagesMatch;
          while ((packagesMatch = packagesRegex.exec(generatedCode)) !== null) {
            const packagesContent = packagesMatch[1].trim();
            const packagesList = packagesContent.split(/[\n,]+/)
              .map(pkg => pkg.trim())
              .filter(pkg => pkg.length > 0);
            
            for (const packageName of packagesList) {
              if (!packagesToInstall.includes(packageName)) {
                packagesToInstall.push(packageName);
                console.log(`[generate-ai-code-stream] Package from <packages> tag: ${packageName}`);
                await sendProgress({ 
                  type: 'package', 
                  name: packageName,
                  message: `Package detected: ${packageName}`
                });
              }
            }
          }
        }
        
        // Function to extract packages from import statements
        function extractPackagesFromCode(content: string): string[] {
          const packages: string[] = [];
          // Match ES6 imports
          const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
          let importMatch;
          
          while ((importMatch = importRegex.exec(content)) !== null) {
            const importPath = importMatch[1];
            // Skip relative imports and built-in React
            if (!importPath.startsWith('.') && !importPath.startsWith('/') && 
                importPath !== 'react' && importPath !== 'react-dom' &&
                !importPath.startsWith('@/')) {
              // Extract package name (handle scoped packages like @heroicons/react)
              const packageName = importPath.startsWith('@') 
                ? importPath.split('/').slice(0, 2).join('/')
                : importPath.split('/')[0];
              
              if (!packages.includes(packageName)) {
                packages.push(packageName);
              }
            }
          }
          
          return packages;
        }
        
        // Use files from tool calls (writeFile)
        const files = toolCalledFiles;
        console.log(`[generate-ai-code-stream] Using ${files.length} files from tool calls`);
        
        // Extract packages from tool-called files and send progress
        for (const file of toolCalledFiles) {
          const filePackages = extractPackagesFromCode(file.content);
          for (const pkg of filePackages) {
            if (!packagesToInstall.includes(pkg)) {
              packagesToInstall.push(pkg);
              console.log(`[generate-ai-code-stream] Package detected from imports: ${pkg}`);
              await sendProgress({ 
                type: 'package', 
                name: pkg,
                message: `Package detected: ${pkg}`
              });
            }
          }
          
          // Send progress for each file
          if (file.path.includes('components/')) {
            componentCount++;
            const componentName = file.path.split('/').pop()?.replace('.tsx', '') || 'Component';
            await sendProgress({ 
              type: 'component', 
              name: componentName,
              path: file.path,
              index: componentCount
            });
          } else if (file.path.includes('App.tsx')) {
            await sendProgress({ 
              type: 'app', 
              message: 'Generated main App.tsx',
              path: file.path
            });
          }
        }
        
        // Default explanation
        const explanation = 'Code generated successfully!';
        
        // Validate generated files for truncation issues
        const truncationWarnings: string[] = [];
        
        // Check each file from tool calls for truncation
        for (const file of files) {
          const { path: filePath, content } = file;
          
          // Only check for really obvious truncation issues
          if (content.trim().endsWith('<') || content.trim().endsWith('</')) {
            truncationWarnings.push(`File ${filePath} appears to have incomplete HTML tags`);
          }
          
          // Only check for SEVERE truncation issues in JS/TS files
          if (filePath.match(/\.(jsx?|tsx?)$/)) {
            // Check for severely unmatched brackets (more than 3 difference)
            const openBraces = (content.match(/{/g) || []).length;
            const closeBraces = (content.match(/}/g) || []).length;
            const braceDiff = Math.abs(openBraces - closeBraces);
            if (braceDiff > 3) { // Only flag severe mismatches
              truncationWarnings.push(`File ${filePath} has severely unmatched braces (${openBraces} open, ${closeBraces} closed)`);
            }
            
            // Check if file is extremely short and looks incomplete
            if (content.length < 20 && content.includes('function') && !content.includes('}')) {
              truncationWarnings.push(`File ${filePath} appears severely truncated`);
            }
          }
        }
        
        // Handle truncation with automatic retry (if enabled in config)
        if (truncationWarnings.length > 0 && appConfig.codeApplication.enableTruncationRecovery) {
          console.warn('[generate-ai-code-stream] Truncation detected, attempting to fix:', truncationWarnings);
          
          await sendProgress({
            type: 'warning',
            message: 'Detected incomplete code generation. Attempting to complete...',
            warnings: truncationWarnings
          });
          
          // Identify truncated files from tool calls
          const truncatedFiles: string[] = [];
          
          for (const file of files) {
            const { path: filePath, content } = file;
            
            // Check if this file appears truncated - be more selective
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
          
          // If we have truncated files, try to regenerate them
          if (truncatedFiles.length > 0) {
            console.log('[generate-ai-code-stream] Attempting to regenerate truncated files:', truncatedFiles);
            
            for (const filePath of truncatedFiles) {
              await sendProgress({
                type: 'info',
                message: `Completing ${filePath}...`
              });
              
              try {
                // Create a focused prompt to complete just this file
                const completionPrompt = `Complete the following file that was truncated. Provide the FULL file content.
                
File: ${filePath}
Original request: ${prompt}
                
Provide the complete file content without any truncation. Include all necessary imports, complete all functions, and close all tags properly.`;
                
                // Make a focused API call to complete this specific file
                // Create a new client for the completion based on the provider
                let completionClient;
                if (model.includes('gpt') || model.includes('openai')) {
                  completionClient = openai;
                } else if (model.includes('claude')) {
                  completionClient = anthropic;
                } else if (model === 'moonshotai/kimi-k2-instruct-0905') {
                  completionClient = groq;
                } else {
                  completionClient = groq;
                }
                
                // Determine the correct model name for the completion
                let completionModelName: string;
                if (model === 'moonshotai/kimi-k2-instruct-0905') {
                  completionModelName = 'moonshotai/kimi-k2-instruct-0905';
                } else if (model.includes('openai')) {
                  completionModelName = model.replace('openai/', '');
                } else if (model.includes('anthropic')) {
                  completionModelName = model.replace('anthropic/', '');
                } else if (model.includes('google')) {
                  completionModelName = model.replace('google/', '');
                } else {
                  completionModelName = model;
                }
                
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
                
                // Update the file in the files array
                const fileIndex = files.findIndex(f => f.path === filePath);
                if (fileIndex !== -1) {
                  files[fileIndex].content = cleanContent;
                  console.log(`[generate-ai-code-stream] Successfully completed ${filePath}`);
                }
                
              } catch (completionError) {
                console.error(`[generate-ai-code-stream] Failed to complete ${filePath}:`, completionError);
                await sendProgress({
                  type: 'warning',
                  message: `Could not auto-complete ${filePath}. Manual review may be needed.`
                });
              }
            }
            
            // Clear the warnings after attempting fixes
            truncationWarnings.length = 0;
            await sendProgress({
              type: 'info',
              message: 'Truncation recovery complete'
            });
          }
        }
        
        // Log final generation summary
        console.log('[generate-ai-code-stream] Generation complete:', {
          generatedCodeLength: generatedCode.length,
          filesCount: files.length,
          filesList: files.map(f => f.path),
          componentsCount: componentCount,
          packagesCount: packagesToInstall.length,
          hasWarnings: truncationWarnings.length > 0
        });
        
        // Send completion with packages info
        await sendProgress({ 
          type: 'complete', 
          generatedCode,
          explanation,
          files: files.length,
          components: componentCount,
          model,
          packagesToInstall: packagesToInstall.length > 0 ? packagesToInstall : undefined,
          warnings: truncationWarnings.length > 0 ? truncationWarnings : undefined
        });
        
      } catch (error) {
        console.error('[generate-ai-code-stream] Stream processing error:', error);
        
        // Check if it's a tool validation error
        if ((error as any).message?.includes('tool call validation failed')) {
          console.error('[generate-ai-code-stream] Tool call validation error - this may be due to the AI model sending incorrect parameters');
          await sendProgress({ 
            type: 'warning', 
            message: 'Package installation tool encountered an issue. Packages will be detected from imports instead.'
          });
          // Continue processing - packages can still be detected from the code
        } else {
          await sendProgress({ 
            type: 'error', 
            error: (error as Error).message 
          });
        }
      } finally {
        await writer.close();
      }
    })();
    
    // Return the stream with proper headers for streaming support
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Content-Encoding': 'none', // Prevent compression that can break streaming
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
    
  } catch (error) {
    console.error('[generate-ai-code-stream] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}