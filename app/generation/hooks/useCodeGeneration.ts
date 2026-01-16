'use client';

import { useCallback } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  generationProgressAtom,
  codeApplicationStateAtom,
  urlScreenshotAtom,
  isScreenshotLoadedAtom,
  isCapturingScreenshotAtom,
  screenshotErrorAtom,
  isPreparingDesignAtom,
  targetUrlAtom,
  loadingStageAtom,
  isStartingNewGenerationAtom,
  showLoadingBackgroundAtom,
  hasInitialSubmissionAtom,
  shouldAutoGenerateAtom,
  pendingAutoSendMessageAtom,
} from '../atoms/generation';
import {
  sandboxDataAtom,
  sandboxFilesAtom,
  responseAreaAtom,
  type SandboxData,
} from '../atoms/sandbox';
import { conversationContextAtom, chatMessagesAtom, type ChatMessage } from '../atoms/chat';
import { activeTabAtom } from '../atoms/ui';

export function useCodeGeneration() {
  const [generationProgress, setGenerationProgress] = useAtom(generationProgressAtom);
  const [codeApplicationState, setCodeApplicationState] = useAtom(codeApplicationStateAtom);
  const [urlScreenshot, setUrlScreenshot] = useAtom(urlScreenshotAtom);
  const [isScreenshotLoaded, setIsScreenshotLoaded] = useAtom(isScreenshotLoadedAtom);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useAtom(isCapturingScreenshotAtom);
  const [screenshotError, setScreenshotError] = useAtom(screenshotErrorAtom);
  const [isPreparingDesign, setIsPreparingDesign] = useAtom(isPreparingDesignAtom);
  const [targetUrl, setTargetUrl] = useAtom(targetUrlAtom);
  const [loadingStage, setLoadingStage] = useAtom(loadingStageAtom);
  const [isStartingNewGeneration, setIsStartingNewGeneration] = useAtom(isStartingNewGenerationAtom);
  const setShowLoadingBackground = useSetAtom(showLoadingBackgroundAtom);
  const setHasInitialSubmission = useSetAtom(hasInitialSubmissionAtom);
  const setShouldAutoGenerate = useSetAtom(shouldAutoGenerateAtom);
  const setPendingAutoSendMessage = useSetAtom(pendingAutoSendMessageAtom);
  
  const sandboxData = useAtomValue(sandboxDataAtom);
  const [sandboxFiles, setSandboxFiles] = useAtom(sandboxFilesAtom);
  const [conversationContext, setConversationContext] = useAtom(conversationContextAtom);
  const [chatMessages, setChatMessages] = useAtom(chatMessagesAtom);
  const [responseArea, setResponseArea] = useAtom(responseAreaAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  const log = useCallback((message: string, type: 'info' | 'error' | 'command' = 'info') => {
    setResponseArea(prev => [...prev, `[${type}] ${message}`]);
  }, [setResponseArea]);

  const addChatMessage = useCallback((
    content: string,
    type: ChatMessage['type'],
    metadata?: ChatMessage['metadata']
  ) => {
    setChatMessages(prev => {
      if (type === 'system' && prev.length > 0) {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.type === 'system' && lastMessage.content === content) {
          return prev;
        }
      }
      return [...prev, { content, type, timestamp: new Date(), metadata }];
    });
  }, [setChatMessages]);

  const captureUrlScreenshot = useCallback(async (url: string) => {
    setIsCapturingScreenshot(true);
    setScreenshotError(null);
    try {
      const response = await fetch('/api/scrape-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      if (data.success && data.screenshot) {
        setIsScreenshotLoaded(false);
        setUrlScreenshot(data.screenshot);
        setIsPreparingDesign(true);
        const cleanUrl = url.replace(/^https?:\/\//i, '');
        setTargetUrl(cleanUrl);
      } else {
        setScreenshotError(data.error || 'Failed to capture screenshot');
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      setScreenshotError('Network error while capturing screenshot');
    } finally {
      setIsCapturingScreenshot(false);
    }
  }, [
    setIsCapturingScreenshot,
    setScreenshotError,
    setIsScreenshotLoaded,
    setUrlScreenshot,
    setIsPreparingDesign,
    setTargetUrl
  ]);

  const applyGeneratedCode = useCallback(async (
    code: string,
    isEdit: boolean = false,
    overrideSandboxData?: SandboxData
  ) => {
    log('Applying AI-generated code...');

    try {
      setCodeApplicationState({ stage: 'analyzing' });

      // Get pending packages from tool calls
      const pendingPackages = ((window as any).pendingPackages || []).filter((pkg: any) => pkg && typeof pkg === 'string');
      if (pendingPackages.length > 0) {
        console.log('[applyGeneratedCode] Sending packages from tool calls:', pendingPackages);
        (window as any).pendingPackages = [];
      }

      const effectiveSandboxData = overrideSandboxData || sandboxData;
      const response = await fetch('/api/apply-ai-code-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: code,
          isEdit: isEdit,
          packages: pendingPackages,
          sandboxId: effectiveSandboxData?.sandboxId
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to apply code: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let finalData: any = null;

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'start':
                  setCodeApplicationState({ stage: 'analyzing' });
                  break;

                case 'step':
                  if (data.message.includes('Installing') && data.packages) {
                    setCodeApplicationState({
                      stage: 'installing',
                      packages: data.packages
                    });
                  } else if (data.message.includes('Creating files') || data.message.includes('Applying')) {
                    setCodeApplicationState({
                      stage: 'applying',
                      filesGenerated: []
                    });
                  }
                  break;

                case 'package-progress':
                  if (data.installedPackages) {
                    setCodeApplicationState(prev => ({
                      ...prev,
                      installedPackages: data.installedPackages
                    }));
                  }
                  break;

                case 'command':
                  if (data.command && !data.command.includes('npm install')) {
                    addChatMessage(data.command, 'command', { commandType: 'input' });
                  }
                  break;

                case 'success':
                  if (data.installedPackages) {
                    setCodeApplicationState(prev => ({
                      ...prev,
                      installedPackages: data.installedPackages
                    }));
                  }
                  break;

                case 'command-progress':
                  addChatMessage(`${data.action} command: ${data.command}`, 'command', { commandType: 'input' });
                  break;

                case 'command-output':
                  addChatMessage(data.output, 'command', {
                    commandType: data.stream === 'stderr' ? 'error' : 'output'
                  });
                  break;

                case 'command-complete':
                  if (data.success) {
                    addChatMessage(`Command completed successfully`, 'system');
                  } else {
                    addChatMessage(`Command failed with exit code ${data.exitCode}`, 'system');
                  }
                  break;

                case 'complete':
                  finalData = data;
                  setCodeApplicationState({ stage: 'complete' });
                  setTimeout(() => {
                    setCodeApplicationState({ stage: null });
                  }, 3000);
                  break;

                case 'error':
                  addChatMessage(`Error: ${data.message || data.error || 'Unknown error'}`, 'system');
                  break;

                case 'warning':
                  addChatMessage(`${data.message}`, 'system');
                  break;

                case 'info':
                  if (data.message) {
                    addChatMessage(data.message, 'system');
                  }
                  break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Process final data
      if (finalData && finalData.type === 'complete') {
        const resultData: any = {
          success: true,
          results: finalData.results,
          explanation: finalData.explanation,
          structure: finalData.structure,
          message: finalData.message,
          autoCompleted: finalData.autoCompleted,
          autoCompletedComponents: finalData.autoCompletedComponents,
          warning: finalData.warning,
          missingImports: finalData.missingImports,
          debug: finalData.debug
        };

        if (resultData.success) {
          const { results } = resultData;

          if (results.packagesInstalled?.length > 0) {
            log(`Packages installed: ${results.packagesInstalled.join(', ')}`);
          }

          if (results.filesCreated?.length > 0) {
            log('Files created:');
            results.filesCreated.forEach((file: string) => {
              log(`  ${file}`, 'command');
            });
          }

          if (results.filesUpdated?.length > 0) {
            log('Files updated:');
            results.filesUpdated.forEach((file: string) => {
              log(`  ${file}`, 'command');
            });
          }

          // Update conversation context with applied code
          setConversationContext(prev => ({
            ...prev,
            appliedCode: [...prev.appliedCode, {
              files: [...(results.filesCreated || []), ...(results.filesUpdated || [])],
              timestamp: new Date()
            }]
          }));

          if (results.commandsExecuted?.length > 0) {
            log('Commands executed:');
            results.commandsExecuted.forEach((cmd: string) => {
              log(`  $ ${cmd}`, 'command');
            });
          }

          if (results.errors?.length > 0) {
            results.errors.forEach((err: string) => {
              log(err, 'error');
            });
          }

          if (resultData.explanation) {
            log(resultData.explanation);
          }

          log('Code applied successfully!');

          // Show file list
          if (results.filesCreated?.length > 0) {
            if (isEdit) {
              addChatMessage(`Edit applied successfully!`, 'system');
            } else {
              addChatMessage(`Applied ${results.filesCreated.length} files successfully!`, 'system', {
                appliedFiles: results.filesCreated
              });
            }
          }

          // Update local file cache
          const allAffectedFiles = [...(results.filesCreated || []), ...(results.filesUpdated || [])];
          if (allAffectedFiles.length > 0) {
            const parsedFiles: Record<string, string> = {};
            const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
            let match;
            while ((match = fileRegex.exec(code)) !== null) {
              let filePath = match[1];
              let fileContent = match[2].trim();

              if (filePath.startsWith('/')) {
                filePath = filePath.substring(1);
              }
              const configFiles = ['tailwind.config.js', 'vite.config.js', 'package.json', 'package-lock.json', 'tsconfig.json', 'postcss.config.js'];
              if (!filePath.startsWith('src/') &&
                  !filePath.startsWith('public/') &&
                  !configFiles.includes(filePath)) {
                filePath = `src/${filePath}`;
              }
              parsedFiles[filePath] = fileContent;
            }

            setSandboxFiles(prev => ({ ...prev, ...parsedFiles }));
          }
        }
      }
    } catch (error: any) {
      console.error('[applyGeneratedCode] Error:', error);
      addChatMessage(`Failed to apply code: ${error.message}`, 'error');
      setCodeApplicationState({ stage: null });
    }
  }, [
    sandboxData,
    log,
    addChatMessage,
    setCodeApplicationState,
    setConversationContext,
    setSandboxFiles
  ]);

  const resetGenerationState = useCallback(() => {
    setGenerationProgress({
      isGenerating: false,
      status: '',
      components: [],
      currentComponent: 0,
      streamedCode: '',
      isStreaming: false,
      isThinking: false,
      files: [],
      lastProcessedPosition: 0
    });
    setUrlScreenshot(null);
    setIsPreparingDesign(false);
    setTargetUrl('');
    setScreenshotError(null);
    setLoadingStage(null);
    setShowLoadingBackground(false);
  }, [
    setGenerationProgress,
    setUrlScreenshot,
    setIsPreparingDesign,
    setTargetUrl,
    setScreenshotError,
    setLoadingStage,
    setShowLoadingBackground
  ]);

  return {
    // State
    generationProgress,
    codeApplicationState,
    urlScreenshot,
    isScreenshotLoaded,
    isCapturingScreenshot,
    screenshotError,
    isPreparingDesign,
    targetUrl,
    loadingStage,
    isStartingNewGeneration,

    // Actions
    applyGeneratedCode,
    captureUrlScreenshot,
    resetGenerationState,
    setGenerationProgress,
    setCodeApplicationState,
    setUrlScreenshot,
    setIsScreenshotLoaded,
    setIsCapturingScreenshot,
    setScreenshotError,
    setIsPreparingDesign,
    setTargetUrl,
    setLoadingStage,
    setIsStartingNewGeneration,
    setHasInitialSubmission,
    setShouldAutoGenerate,
    setPendingAutoSendMessage,
  };
}
