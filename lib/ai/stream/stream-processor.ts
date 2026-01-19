import { streamText } from 'ai';
import { MAX_RESPONSE_SEGMENTS, CONTINUE_PROMPT, detectTruncation, extractPartialContent } from '@/lib/stream';

/**
 * AI Stream Processor Module
 * 
 * Handles AI response streaming with support for:
 * - Tool calling (writeFile, installPackages)
 * - Automatic continuation for long responses
 * - Real-time progress updates
 * - Reasoning/thinking events (for GPT-5 etc.)
 */

export interface StreamProcessorOptions {
  streamOptions: any; // AI SDK streamText options
  sendProgress: (data: any) => Promise<void>;
  toolCalledFiles: Array<{ path: string; content: string }>;
  packagesToInstall: string[];
}

export interface StreamProcessorResult {
  generatedCode: string;
  continuationCount: number;
}

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Process AI streaming response with tool calling and continuation support
 * 
 * @param options - Stream processor configuration
 * @returns Result containing generated code and continuation count
 */
export async function processAIStream(options: StreamProcessorOptions): Promise<StreamProcessorResult> {
  const { streamOptions, sendProgress, toolCalledFiles, packagesToInstall } = options;
  
  // Streaming state for continuation support
  let generatedCode = '';
  let currentFile = '';
  let conversationalBuffer = '';
  let continuationCount = 0;
  
  // Message history for continuation
  const conversationMessages: ConversationMessage[] = [
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
    
    // Retry logic for transient errors
    while (retryCount <= maxRetries) {
      try {
        result = await streamText(currentStreamOptions);
        break; // Success, exit retry loop
      } catch (streamError: any) {
        console.error(`[processAIStream] Error calling streamText (attempt ${retryCount + 1}/${maxRetries + 1}):`, streamError);
        
        // Check if this is a retryable error
        const isRetryableError = streamError.message?.includes('Service unavailable') || 
                                streamError.message?.includes('rate limit') ||
                                streamError.message?.includes('timeout');
        
        if (retryCount < maxRetries && isRetryableError) {
          retryCount++;
          console.log(`[processAIStream] Retrying in ${retryCount * 2} seconds...`);
          
          // Send progress update about retry
          await sendProgress({ 
            type: 'info', 
            message: `Service temporarily unavailable, retrying (attempt ${retryCount + 1}/${maxRetries + 1})...` 
          });
          
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
        } else {
          // Final error, send to user
          await sendProgress({ 
            type: 'error', 
            message: `Failed to initialize streaming: ${streamError.message}` 
          });
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
        // Text content streaming
        const text = chunk.text || '';
        generatedCode += text;
        segmentContent += text;
        currentFile += text;
        
        // Log streaming chunks to console
        process.stdout.write(text);
        
        // Stream any conversational text (AI explaining what it's doing)
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
          console.log(`[processAIStream] Streamed ${generatedCode.length} chars`);
        }
      } else if (chunk.type === 'tool-call') {
        // Tool call started - immediately notify frontend
        console.log(`[processAIStream] Tool call started: ${chunk.toolName}`, {
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
        console.log(`[processAIStream] Tool argument streaming started: ${chunk.toolName}`);
        
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
        console.log(`[processAIStream] Tool result received: ${chunk.toolName}`);
        
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
        console.log(`[processAIStream] Stream finished: ${chunk.finishReason}`);
      }
    }
    
    // Check finish reason after stream completes
    const finishReason = await result?.finishReason;
    const usage = await result?.usage;
    
    console.log(`\n[processAIStream] Segment ${continuationCount + 1} complete:`, {
      finishReason,
      tokens: usage?.totalTokens || 'unknown',
      segmentLength: segmentContent.length,
      totalLength: generatedCode.length
    });
    
    // Special logging for tool-calls finish reason
    if (finishReason === 'tool-calls') {
      console.log('[processAIStream] ⚠️  Finish reason is "tool-calls" - tools were called but response may not contain file content in XML format');
      console.log('[processAIStream] Tool calling is working, but files may need to be retrieved from tool results instead of generated text');
    }
    
    // Check if response was truncated due to token limit
    if (finishReason === 'length' && continuationCount < MAX_RESPONSE_SEGMENTS) {
      // Response was truncated, need to continue
      continuationCount++;
      const segmentsLeft = MAX_RESPONSE_SEGMENTS - continuationCount;
      
      console.log(`[processAIStream] Response truncated! Continuing... (${segmentsLeft} continuation(s) remaining)`);
      
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
      console.warn(`[processAIStream] Content truncation detected: ${truncationCheck.reason}`);
      
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
  
  console.log(`\n\n[processAIStream] Streaming complete. Total continuations: ${continuationCount}`);
  
  // Send any remaining conversational text
  if (conversationalBuffer.trim()) {
    await sendProgress({ 
      type: 'conversation', 
      text: conversationalBuffer.trim()
    });
  }
  
  return {
    generatedCode,
    continuationCount
  };
}

/**
 * Setup tool call callback for onStepFinish event
 * 
 * @param sendProgress - Progress callback
 * @param toolCalledFiles - Array to track files created via tool calls
 * @param packagesToInstall - Array to track packages to install
 * @returns onStepFinish callback function
 */
export function createToolCallbackHandler(
  sendProgress: (data: any) => Promise<void>,
  toolCalledFiles: Array<{ path: string; content: string }>,
  packagesToInstall: string[]
) {
  let hasCalledInstallPackages = false;
  let hasCalledWriteFile = false;
  
  return async (step: any) => {
    console.log('[createToolCallbackHandler] onStepFinish called:', {
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
          hasCalledWriteFile = true;
          toolCalledFiles.push({
            path: toolCall.input.path,
            content: toolCall.input.content
          });
          console.log(`[createToolCallbackHandler] Tracked file from tool call: ${toolCall.input.path}`);
          
          // Send file write progress to frontend
          await sendProgress({
            type: 'file',
            action: 'write',
            path: toolCall.input.path,
            size: toolCall.input.content?.length || 0
          });
        } else if (toolCall.toolName === 'installPackages' && toolCall.input) {
          hasCalledInstallPackages = true;
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
      console.log('[createToolCallbackHandler] Tool results:', step.toolResults.map((r: any) => ({
        toolName: r.toolName,
        toolCallId: r.toolCallId,
        hasResult: !!r.result,
        resultPreview: r.result 
          ? (typeof r.result === 'string' ? r.result.slice(0, 100) : JSON.stringify(r.result).slice(0, 100))
          : 'no result'
      })));
    }
    
    // Check if AI only called installPackages without writeFile (incomplete task)
    if (step.finishReason === 'stop' && hasCalledInstallPackages && !hasCalledWriteFile) {
      console.warn('[createToolCallbackHandler] ⚠️  AI called installPackages but no writeFile calls detected!');
      console.warn('[createToolCallbackHandler] This is likely a prompt following issue - packages installed but no code generated');
      
      await sendProgress({
        type: 'warning',
        message: '⚠️ AI installed packages but did not generate code files. This may be a model issue. Try rephrasing your request or using a different model.',
        hasCalledInstallPackages,
        hasCalledWriteFile,
        suggestion: 'Try: "Create a complete blog app with all necessary files using shadcn/ui and lucide-react"'
      });
    }
  };
}
