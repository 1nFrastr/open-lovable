import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { appConfig } from '@/config/app.config';

// Import our refactored modules
import { createSandboxTools } from '@/lib/ai/tools/sandbox-tools';
import { extractPackagesFromFiles } from '@/lib/ai/tools/package-detector';
import { 
  initConversationState, 
  buildConversationContext, 
  addUserMessage,
  getMessageHistoryForLLM,
  addAssistantMessage
} from '@/lib/ai/context/conversation-context-builder';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/prompts/system-prompt-builder';
import { buildFullContext } from '@/lib/ai/context/full-context-builder';
import { processAIStream, createToolCallbackHandler } from '@/lib/ai/stream/stream-processor';
import { 
  detectTruncation, 
  recoverTruncatedFiles, 
  applyRecoveredContent 
} from '@/lib/stream/code-truncation-recovery';
import type { ConversationEdit } from '@/types/conversation';

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

// Initialize AI provider clients
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

export async function POST(request: NextRequest) {
  try {
    // 1. Parse request
    const { prompt, model = 'openai/gpt-oss-20b', context, isEdit = false } = await request.json();
    
    console.log('[generate-ai-code-stream] Received request:');
    console.log('[generate-ai-code-stream] - prompt:', prompt);
    console.log('[generate-ai-code-stream] - isEdit:', isEdit);
    console.log('[generate-ai-code-stream] - model:', model);
    console.log('[generate-ai-code-stream] - context.sandboxId:', context?.sandboxId);
    
    if (!prompt) {
      return NextResponse.json({ 
        success: false, 
        error: 'Prompt is required' 
      }, { status: 400 });
    }
    
    // 2. Initialize conversation state
    if (!global.conversationState) {
      global.conversationState = initConversationState();
    }
    
    // Add user message to conversation history
    addUserMessage(global.conversationState, prompt, {
      sandboxId: context?.sandboxId
    });
    
    // 3. Create streaming response
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Helper function to send progress updates
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
    
    // 4. Start background processing
    (async () => {
      try {
        await sendProgress({ type: 'status', message: 'Initializing AI...' });
        
        // 4.1 Build conversation context
        const conversationContext = global.conversationState 
          ? buildConversationContext(global.conversationState)
          : '';
        
        // 4.2 Build system prompt
        const hasBackendFiles = !!global.sandboxState?.fileCache?.files && 
                                Object.keys(global.sandboxState.fileCache.files).length > 0;
        
        const systemPrompt = buildSystemPrompt({
          isEdit,
          conversationContext,
          hasBackendFiles,
          // TODO: Add editContext when edit mode handler is re-implemented
          editContext: undefined
        });
        
        // 4.3 Build full context (includes file contents)
        const fullPrompt = await buildFullContext({
          prompt,
          context,
          isEdit,
          // TODO: Add editContext when edit mode handler is re-implemented
          editContext: undefined
        });
        
        await sendProgress({ type: 'status', message: 'Planning application structure...' });
        
        console.log('\n[generate-ai-code-stream] Starting streaming response...\n');
        
        // 4.4 Create tools
        const tools = createSandboxTools();
        
        // 4.5 Determine provider and model
        const isAnthropic = model.startsWith('anthropic/');
        const isGoogle = model.startsWith('google/');
        const isOpenAI = model.startsWith('openai/');
        const isKimiGroq = model === 'moonshotai/kimi-k2-instruct-0905';
        
        const modelProvider = isAnthropic ? anthropic : 
                              (isOpenAI ? openai : 
                              (isGoogle ? googleGenerativeAI : 
                              (isKimiGroq ? groq : groq)));
        
        // Transform model name
        let actualModel: string;
        if (isAnthropic) {
          actualModel = model.replace('anthropic/', '');
        } else if (isOpenAI) {
          actualModel = model.replace('openai/', '');
        } else if (isKimiGroq) {
          actualModel = 'moonshotai/kimi-k2-instruct-0905';
        } else if (isGoogle) {
          actualModel = model.replace('google/', '');
        } else {
          actualModel = model;
        }
        
        console.log(`[generate-ai-code-stream] Using provider: ${isAnthropic ? 'Anthropic' : isGoogle ? 'Google' : isOpenAI ? 'OpenAI' : 'Groq'}, model: ${actualModel}`);
        
        // Check if the current model supports tool calling
        const supportsTools = isOpenAI || isAnthropic;
        console.log(`[generate-ai-code-stream] Tool calling ${supportsTools ? 'ENABLED' : 'DISABLED'} for this model`);
        
        // Track files and packages
        const toolCalledFiles: Array<{ path: string; content: string }> = [];
        const packagesToInstall: string[] = [];
        
        // 4.6 Build stream options
        const streamOptions: any = {
          model: modelProvider(actualModel),
          messages: [
            { role: 'system', content: systemPrompt },
            // Include message history for context
            ...(global.conversationState 
              ? getMessageHistoryForLLM(global.conversationState) 
              : []
            ),
            { role: 'user', content: buildUserPrompt(fullPrompt) }
          ],
          maxTokens: 8192,
          stopSequences: []
        };
        
        // Log history count for debugging
        const historyCount = global.conversationState 
          ? global.conversationState.context.messages.length 
          : 0;
        console.log('[generate-ai-code-stream] Including', historyCount, 'messages in context');
        
        // Enable tool calling for supported models
        if (supportsTools) {
          console.log('[generate-ai-code-stream] Enabling tool calling with tools:', Object.keys(tools));
          
          streamOptions.tools = tools;
          streamOptions.toolChoice = 'auto';
          streamOptions.maxSteps = 5;
          
          // Setup tool call callback
          streamOptions.onStepFinish = createToolCallbackHandler(
            sendProgress,
            toolCalledFiles,
            packagesToInstall
          );
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
        
        // 4.7 Process AI stream
        const streamResult = await processAIStream({
          streamOptions,
          sendProgress,
          toolCalledFiles,
          packagesToInstall
        });
        
        const { generatedCode, continuationCount } = streamResult;
        
        console.log(`\n[generate-ai-code-stream] Stream processing complete. Continuations: ${continuationCount}`);
        
        // 4.8 Extract packages from generated files
        const detectedPackages = extractPackagesFromFiles(toolCalledFiles);
        for (const pkg of detectedPackages) {
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
        
        // Send progress for component files
        let componentCount = 0;
        for (const file of toolCalledFiles) {
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
        
        // 4.9 Check for truncation and recover if needed
        const truncationCheck = detectTruncation(toolCalledFiles);
        
        if (truncationCheck.hasTruncation && appConfig.codeApplication.enableTruncationRecovery) {
          console.warn('[generate-ai-code-stream] Truncation detected, attempting recovery:', truncationCheck.warnings);
          
          await sendProgress({
            type: 'warning',
            message: 'Detected incomplete code generation. Attempting to complete...',
            warnings: truncationCheck.warnings
          });
          
          // Recover truncated files
          const recoveredContent = await recoverTruncatedFiles(
            truncationCheck.truncatedFiles,
            prompt,
            model,
            { anthropic, openai, groq, googleGenerativeAI },
            sendProgress
          );
          
          // Apply recovered content
          const updatedFiles = applyRecoveredContent(toolCalledFiles, recoveredContent);
          toolCalledFiles.splice(0, toolCalledFiles.length, ...updatedFiles);
        }
        
        // Record assistant message before completion
        if (global.conversationState && toolCalledFiles.length > 0) {
          try {
            const editedFiles = toolCalledFiles.map((f) => f.path);
            addAssistantMessage(
              global.conversationState,
              generatedCode || 'Generated code successfully',
              editedFiles
            );
            
            console.log('[generate-ai-code-stream] Recorded assistant message with', editedFiles.length, 'files');
          } catch (error) {
            // Failure doesn't affect main flow
            console.error('[generate-ai-code-stream] Failed to record assistant message:', error);
          }
        }
        
        // 4.10 Send completion
        await sendProgress({ 
          type: 'complete', 
          generatedCode,
          explanation: 'Code generated successfully!',
          files: toolCalledFiles.length,
          components: componentCount,
          model,
          packagesToInstall: packagesToInstall.length > 0 ? packagesToInstall : undefined,
          warnings: truncationCheck.hasTruncation ? truncationCheck.warnings : undefined
        });
        
        // 4.11 Track edit in conversation history if applicable
        if (isEdit && global.conversationState) {
          const editRecord: ConversationEdit = {
            timestamp: Date.now(),
            userRequest: prompt,
            editType: 'UPDATE_COMPONENT', // TODO: Use actual editIntent when available
            targetFiles: toolCalledFiles.map(f => f.path),
            confidence: 0.8,
            outcome: 'success'
          };
          
          global.conversationState.context.edits.push(editRecord);
          
          // Track major changes if significant
          if (toolCalledFiles.length > 3) {
            global.conversationState.context.projectEvolution.majorChanges.push({
              timestamp: Date.now(),
              description: prompt,
              filesAffected: toolCalledFiles.map(f => f.path)
            });
          }
          
          global.conversationState.lastUpdated = Date.now();
          console.log('[generate-ai-code-stream] Updated conversation history with edit');
        }
        
        console.log('[generate-ai-code-stream] Generation complete:', {
          filesCount: toolCalledFiles.length,
          filesList: toolCalledFiles.map(f => f.path),
          packagesCount: packagesToInstall.length,
          hasWarnings: truncationCheck.hasTruncation
        });
        
      } catch (error) {
        console.error('[generate-ai-code-stream] Stream processing error:', error);
        
        // Check if it's a tool validation error
        if ((error as any).message?.includes('tool call validation failed')) {
          console.error('[generate-ai-code-stream] Tool call validation error');
          await sendProgress({ 
            type: 'warning', 
            message: 'Package installation tool encountered an issue. Packages will be detected from imports instead.'
          });
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
    
    // 5. Return streaming response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Content-Encoding': 'none',
        'X-Accel-Buffering': 'no',
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
