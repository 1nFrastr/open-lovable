'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  chatMessagesAtom,
  aiChatInputAtom,
  aiEnabledAtom,
  conversationContextAtom,
  type ChatMessage,
} from '../atoms/chat';
import {
  sandboxDataAtom,
  structureContentAtom,
} from '../atoms/sandbox';
import {
  generationProgressAtom,
  codeApplicationStateAtom,
} from '../atoms/generation';
import {
  activeTabAtom,
  selectedFileAtom,
  promptInputAtom,
  aiModelAtom,
} from '../atoms/ui';

interface UseChatMessagesOptions {
  createSandbox: (fromHomeScreen?: boolean) => Promise<any>;
  applyGeneratedCode: (code: string, isEdit?: boolean, overrideSandboxData?: any) => Promise<void>;
}

export function useChatMessages(options: UseChatMessagesOptions) {
  const { createSandbox, applyGeneratedCode } = options;

  const [chatMessages, setChatMessages] = useAtom(chatMessagesAtom);
  const [aiChatInput, setAiChatInput] = useAtom(aiChatInputAtom);
  const aiEnabled = useAtomValue(aiEnabledAtom);
  const [conversationContext, setConversationContext] = useAtom(conversationContextAtom);
  const sandboxData = useAtomValue(sandboxDataAtom);
  const structureContent = useAtomValue(structureContentAtom);
  const [generationProgress, setGenerationProgress] = useAtom(generationProgressAtom);
  const setCodeApplicationState = useSetAtom(codeApplicationStateAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const setSelectedFile = useSetAtom(selectedFileAtom);
  const promptInput = useAtomValue(promptInputAtom);
  const aiModel = useAtomValue(aiModelAtom);

  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat messages
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const addChatMessage = useCallback((
    content: string,
    type: ChatMessage['type'],
    metadata?: ChatMessage['metadata']
  ) => {
    setChatMessages(prev => {
      // Skip duplicate consecutive system messages
      if (type === 'system' && prev.length > 0) {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.type === 'system' && lastMessage.content === content) {
          return prev;
        }
      }
      return [...prev, { content, type, timestamp: new Date(), metadata }];
    });
  }, [setChatMessages]);

  const clearChatMessages = useCallback(() => {
    setChatMessages([]);
  }, [setChatMessages]);

  const checkAndInstallPackages = useCallback(async () => {
    if (!sandboxData) {
      console.log('[checkAndInstallPackages] No sandbox data available yet');
      return;
    }
    addChatMessage('Checking packages... Sandbox is ready with Vite configuration.', 'system');
  }, [sandboxData, addChatMessage]);

  const sendChatMessage = useCallback(async (directMessage?: string) => {
    const message = (directMessage || aiChatInput).trim();
    if (!message) return;

    if (!aiEnabled) {
      addChatMessage('AI is disabled. Please enable it first.', 'system');
      return;
    }

    addChatMessage(message, 'user');
    setAiChatInput('');

    // Check for special commands
    const lowerMessage = message.toLowerCase().trim();
    if (lowerMessage === 'check packages' || lowerMessage === 'install packages' || lowerMessage === 'npm install') {
      if (!sandboxData) {
        addChatMessage('The sandbox is still being set up. Please wait for the generation to complete, then try again.', 'system');
        return;
      }
      await checkAndInstallPackages();
      return;
    }

    // Start sandbox creation in parallel if needed
    let sandboxPromise: Promise<void> | null = null;
    let sandboxCreating = false;

    if (!sandboxData) {
      sandboxCreating = true;
      addChatMessage('Creating sandbox while I plan your app...', 'system');
      sandboxPromise = createSandbox(true).catch((error: any) => {
        addChatMessage(`Failed to create sandbox: ${error.message}`, 'system');
        throw error;
      });
    }

    // Determine if this is an edit
    const isEdit = conversationContext.appliedCode.length > 0;

    try {
      setGenerationProgress(prev => ({
        ...prev,
        isGenerating: true,
        status: 'Starting AI generation...',
        components: [],
        currentComponent: 0,
        streamedCode: '',
        isStreaming: false,
        isThinking: true,
        thinkingText: 'Analyzing your request...',
        thinkingDuration: undefined,
        currentFile: undefined,
        lastProcessedPosition: 0,
        isEdit: isEdit,
        files: prev.files
      }));

      // Switch to generation tab
      setActiveTab('generation');
      setSelectedFile(null);

      console.log('[chat] Using backend file cache for context');

      const fullContext = {
        sandboxId: sandboxData?.sandboxId || (sandboxCreating ? 'pending' : null),
        structure: structureContent,
        recentMessages: chatMessages.slice(-20),
        conversationContext: conversationContext,
        currentCode: promptInput,
        sandboxUrl: sandboxData?.url,
        sandboxCreating: sandboxCreating
      };

      console.log('[chat] Sending context to AI:');
      console.log('[chat] - sandboxId:', fullContext.sandboxId);
      console.log('[chat] - isEdit:', conversationContext.appliedCode.length > 0);

      const response = await fetch('/api/generate-ai-code-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: message,
          model: aiModel,
          context: fullContext,
          isEdit: conversationContext.appliedCode.length > 0
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let generatedCode = '';
      let explanation = '';
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          console.log('[chat] Received chunk:', chunk.length, 'bytes');
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'status') {
                  setGenerationProgress(prev => ({ ...prev, status: data.message }));
                } else if (data.type === 'tool-call') {
                  // Handle tool call events
                  const toolIcons: Record<string, string> = {
                    writeFile: '📝',
                    installPackages: '📦'
                  };
                  const toolIcon = toolIcons[data.tool] || '🔧';
                  
                  let toolMessage = '';
                  if (data.tool === 'writeFile') {
                    toolMessage = `Writing file: ${data.args.path}`;
                  } else if (data.tool === 'installPackages') {
                    toolMessage = `Installing packages: ${data.args.packages.join(', ')}`;
                  } else {
                    toolMessage = `${data.tool}(${JSON.stringify(data.args)})`;
                  }
                  
                  addChatMessage(
                    `${toolIcon} ${toolMessage}`,
                    'system',
                    { 
                      toolName: data.tool, 
                      args: data.args,
                      result: data.result 
                    }
                  );
                } else if (data.type === 'thinking') {
                  setGenerationProgress(prev => ({
                    ...prev,
                    isThinking: true,
                    thinkingText: (prev.thinkingText || '') + data.text
                  }));
                } else if (data.type === 'thinking_complete') {
                  setGenerationProgress(prev => ({
                    ...prev,
                    isThinking: false,
                    thinkingDuration: data.duration
                  }));
                } else if (data.type === 'conversation') {
                  let text = data.text || '';
                  text = text.replace(/<package>[^<]*<\/package>/g, '');
                  text = text.replace(/<packages>[^<]*<\/packages>/g, '');

                  if (!text.includes('<file') && !text.includes('</file>') &&
                      !text.includes('<package') && !text.includes('</package') &&
                      !text.includes('<explanation') && !text.includes('</explanation') &&
                      !text.includes('import React') &&
                      !text.includes('export default') && !text.includes('className=') &&
                      text.trim().length > 0) {
                    addChatMessage(text.trim(), 'ai');
                  }
                } else if (data.type === 'stream' && data.raw) {
                  setGenerationProgress(prev => {
                    const newStreamedCode = prev.streamedCode + data.text;

                    const updatedState = {
                      ...prev,
                      streamedCode: newStreamedCode,
                      isStreaming: true,
                      isThinking: false,
                      status: 'Generating code...'
                    };

                    // Process complete files from the accumulated stream
                    const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
                    let match;
                    const processedFiles = new Set(prev.files.map(f => f.path));

                    while ((match = fileRegex.exec(newStreamedCode)) !== null) {
                      const filePath = match[1];
                      const fileContent = match[2];

                      if (!processedFiles.has(filePath)) {
                        const fileExt = filePath.split('.').pop() || '';
                        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                        fileExt === 'css' ? 'css' :
                                        fileExt === 'json' ? 'json' :
                                        fileExt === 'html' ? 'html' : 'text';

                        const existingFileIndex = updatedState.files.findIndex(f => f.path === filePath);

                        if (existingFileIndex >= 0) {
                          updatedState.files = [
                            ...updatedState.files.slice(0, existingFileIndex),
                            {
                              ...updatedState.files[existingFileIndex],
                              content: fileContent.trim(),
                              type: fileType,
                              completed: true,
                              edited: true
                            },
                            ...updatedState.files.slice(existingFileIndex + 1)
                          ];
                        } else {
                          updatedState.files = [...updatedState.files, {
                            path: filePath,
                            content: fileContent.trim(),
                            type: fileType,
                            completed: true,
                            edited: false
                          }];
                        }

                        if (!prev.isEdit) {
                          updatedState.status = `Completed ${filePath}`;
                        }
                        processedFiles.add(filePath);
                      }
                    }

                    // Check for current file being generated
                    const lastFileMatch = newStreamedCode.match(/<file path="([^"]+)">([^]*?)$/);
                    if (lastFileMatch && !lastFileMatch[0].includes('</file>')) {
                      const filePath = lastFileMatch[1];
                      const partialContent = lastFileMatch[2];

                      if (!processedFiles.has(filePath)) {
                        const fileExt = filePath.split('.').pop() || '';
                        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                        fileExt === 'css' ? 'css' :
                                        fileExt === 'json' ? 'json' :
                                        fileExt === 'html' ? 'html' : 'text';

                        updatedState.currentFile = {
                          path: filePath,
                          content: partialContent,
                          type: fileType
                        };
                        if (!prev.isEdit) {
                          updatedState.status = `Generating ${filePath}`;
                        }
                      }
                    } else {
                      updatedState.currentFile = undefined;
                    }

                    return updatedState;
                  });
                } else if (data.type === 'app') {
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: 'Generated App.jsx structure'
                  }));
                } else if (data.type === 'component') {
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: `Generated ${data.name}`,
                    components: [...prev.components, {
                      name: data.name,
                      path: data.path,
                      completed: true
                    }],
                    currentComponent: data.index
                  }));
                } else if (data.type === 'package') {
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: data.message || `Installing ${data.name}`
                  }));
                } else if (data.type === 'complete') {
                  generatedCode = data.generatedCode;
                  explanation = data.explanation;

                  setConversationContext(prev => ({
                    ...prev,
                    lastGeneratedCode: generatedCode
                  }));

                  setGenerationProgress(prev => ({
                    ...prev,
                    isThinking: false,
                    thinkingText: undefined,
                    thinkingDuration: undefined
                  }));

                  if (data.packagesToInstall && data.packagesToInstall.length > 0) {
                    console.log('[generate-code] Packages to install from tools:', data.packagesToInstall);
                    (window as any).pendingPackages = data.packagesToInstall;
                  }

                  // Parse all files from the completed code
                  const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
                  const parsedFiles: Array<{path: string; content: string; type: string; completed: boolean}> = [];
                  let fileMatch;

                  while ((fileMatch = fileRegex.exec(data.generatedCode)) !== null) {
                    const filePath = fileMatch[1];
                    const fileContent = fileMatch[2];
                    const fileExt = filePath.split('.').pop() || '';
                    const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                    fileExt === 'css' ? 'css' :
                                    fileExt === 'json' ? 'json' :
                                    fileExt === 'html' ? 'html' : 'text';

                    parsedFiles.push({
                      path: filePath,
                      content: fileContent.trim(),
                      type: fileType,
                      completed: true
                    });
                  }

                  setGenerationProgress(prev => {
                    const fileCount = data.files || parsedFiles.length || prev.files.length;
                    return {
                      ...prev,
                      status: `Generated ${fileCount} file${fileCount !== 1 ? 's' : ''}!`,
                      isGenerating: false,
                      isStreaming: false,
                      isEdit: prev.isEdit,
                      files: prev.files.length > 0 ? prev.files : parsedFiles
                    };
                  });
                } else if (data.type === 'error') {
                  throw new Error(data.error);
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
      }

      if (generatedCode) {
        // Parse files from generated code for metadata
        const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
        const generatedFiles = [];
        let match;
        while ((match = fileRegex.exec(generatedCode)) !== null) {
          generatedFiles.push(match[1]);
        }

        // Get file count from generation progress or parsed files
        // (tool calling mode may not have XML files in generatedCode)
        const fileCount = generationProgress?.files?.length || generatedFiles.length;

        // Show appropriate message based on edit mode
        if (isEdit) {
          addChatMessage(
            `Edit generated! Applying ${fileCount} file changes...`,
            'ai',
            { generatedCode }
          );
        } else {
          addChatMessage(
            `Code generated! Applying ${fileCount} files to your sandbox...`,
            'ai',
            { generatedCode }
          );
        }

        // Wait for sandbox if it was being created
        if (sandboxPromise) {
          addChatMessage('Waiting for sandbox to be ready...', 'system');
          await sandboxPromise;
        }

        // Apply the generated code
        await applyGeneratedCode(generatedCode, isEdit);

        // Show completion status briefly then switch to preview
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          isStreaming: false,
          status: 'Generation complete!',
          isEdit: prev.isEdit,
          // Clear thinking state on completion
          isThinking: false,
          thinkingText: undefined,
          thinkingDuration: undefined
        }));

        setTimeout(() => {
          // Switch to preview but keep files for display
          setActiveTab('preview');
        }, 1000);
      }

    } catch (error: any) {
      console.error('[sendChatMessage] Error:', error);
      addChatMessage(`Error: ${error.message}`, 'error');
      setGenerationProgress(prev => ({
        ...prev,
        isGenerating: false,
        isStreaming: false,
        isThinking: false,
        status: 'Generation failed'
      }));
      // Switch back to preview on error
      setActiveTab('preview');
    }
  }, [
    aiChatInput,
    aiEnabled,
    aiModel,
    sandboxData,
    chatMessages,
    conversationContext,
    structureContent,
    promptInput,
    addChatMessage,
    setAiChatInput,
    setGenerationProgress,
    setConversationContext,
    setActiveTab,
    setSelectedFile,
    createSandbox,
    applyGeneratedCode,
    checkAndInstallPackages
  ]);

  const handleAIChatSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    sendChatMessage();
  }, [sendChatMessage]);

  return {
    // State
    chatMessages,
    aiChatInput,
    conversationContext,
    chatMessagesRef,

    // Actions
    addChatMessage,
    clearChatMessages,
    sendChatMessage,
    handleAIChatSubmit,
    setAiChatInput,
    setConversationContext,
  };
}
