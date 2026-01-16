'use client';

import { useCallback } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { appConfig } from '@/config/app.config';
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
  sandboxLoadingAtom,
  responseAreaAtom,
  structureContentAtom,
  type SandboxData,
} from '../atoms/sandbox';
import { conversationContextAtom, chatMessagesAtom, type ChatMessage } from '../atoms/chat';

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
  const [, setLoading] = useAtom(sandboxLoadingAtom);
  const [, setConversationContext] = useAtom(conversationContextAtom);
  const [chatMessages, setChatMessages] = useAtom(chatMessagesAtom);
  const [, setResponseArea] = useAtom(responseAreaAtom);
  const setStructureContent = useSetAtom(structureContentAtom);

  const displayStructure = useCallback((structure: any) => {
    if (typeof structure === 'object') {
      setStructureContent(JSON.stringify(structure, null, 2));
    } else {
      setStructureContent(structure || 'No structure available');
    }
  }, [setStructureContent]);

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
    overrideSandboxData?: SandboxData,
    iframeRef?: React.RefObject<HTMLIFrameElement | null>
  ) => {
    setLoading(true);
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
                  setLoading(false);
                  break;

                case 'error':
                  addChatMessage(`Error: ${data.message || data.error || 'Unknown error'}`, 'system');
                  setLoading(false);
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

            // Force refresh the iframe after files are created
            if (effectiveSandboxData?.sandboxId && results.filesCreated.length > 0 && iframeRef?.current) {
              setTimeout(() => {
                if (iframeRef.current) {
                  iframeRef.current.src = iframeRef.current.src;
                }
              }, 1000);
            }
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

          if (resultData.structure) {
            displayStructure(resultData.structure);
          }

          if (resultData.explanation) {
            log(resultData.explanation);
          }

          if (resultData.autoCompleted) {
            log('Auto-generating missing components...', 'command');
            if (resultData.autoCompletedComponents) {
              setTimeout(() => {
                log('Auto-generated missing components:', 'info');
                resultData.autoCompletedComponents.forEach((comp: string) => {
                  log(`  ${comp}`, 'command');
                });
              }, 1000);
            }
          } else if (resultData.warning) {
            log(resultData.warning, 'error');
            if (resultData.missingImports && resultData.missingImports.length > 0) {
              const missingList = resultData.missingImports.join(', ');
              addChatMessage(
                `Ask me to "create the missing components: ${missingList}" to fix these import errors.`,
                'system'
              );
            }
          }

          log('Code applied successfully!');

          // Show file list
          if (results.filesCreated?.length > 0) {
            setConversationContext(prev => ({
              ...prev,
              appliedCode: [...prev.appliedCode, {
                files: results.filesCreated,
                timestamp: new Date()
              }]
            }));

            if (isEdit) {
              addChatMessage(`Edit applied successfully!`, 'system');
            } else {
              const recentMessages = chatMessages.slice(-5);
              const isPartOfGeneration = recentMessages.some(m =>
                m.content.includes('AI recreation generated') ||
                m.content.includes('Code generated')
              );

              if (isPartOfGeneration) {
                addChatMessage(`Applied ${results.filesCreated.length} files successfully!`, 'system');
              } else {
                addChatMessage(`Applied ${results.filesCreated.length} files successfully!`, 'system', {
                  appliedFiles: results.filesCreated
                });
              }
            }

            if (results.packagesFailed?.length > 0) {
              addChatMessage(`Some packages failed to install. Check the error banner above for details.`, 'system');
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
                    filePath !== 'index.html' &&
                    !configFiles.includes(filePath.split('/').pop() || '')) {
                  filePath = 'src/' + filePath;
                }

                // Apply content transformations
                if (filePath.endsWith('.jsx') || filePath.endsWith('.js') || filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
                  fileContent = fileContent.replace(/import\s+['"]\.\/[^'"]+\.css['"];?\s*\n?/g, '');
                }
                if (filePath.endsWith('.css')) {
                  fileContent = fileContent.replace(/shadow-3xl/g, 'shadow-2xl');
                  fileContent = fileContent.replace(/shadow-4xl/g, 'shadow-2xl');
                  fileContent = fileContent.replace(/shadow-5xl/g, 'shadow-2xl');
                }

                parsedFiles[filePath] = fileContent;
              }

              // Update sandboxFiles with parsed content
              const updatedSandboxFiles: Record<string, string> = { ...sandboxFiles, ...parsedFiles };

              // If packages were installed, fetch updated package.json from container
              const packagesInstalled = results?.packagesInstalled?.length > 0;
              if (packagesInstalled) {
                console.log('[applyGeneratedCode] Packages installed, fetching updated package.json from container...');
                try {
                  const pkgResponse = await fetch('/api/read-sandbox-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: 'package.json' })
                  });
                  const pkgData = await pkgResponse.json();
                  if (pkgData.success && pkgData.content) {
                    updatedSandboxFiles['package.json'] = pkgData.content;
                    console.log('[applyGeneratedCode] Updated package.json from container');
                  }
                } catch (err) {
                  console.warn('[applyGeneratedCode] Could not fetch package.json:', err);
                }
              }

              setSandboxFiles(updatedSandboxFiles);
              console.log('[applyGeneratedCode] Updated sandboxFiles:', Object.keys(parsedFiles).length, 'new files');

              // Update generationProgress.files
              const progressFiles = Object.entries(updatedSandboxFiles).map(([path, content]) => {
                const ext = path.split('.').pop()?.toLowerCase() || '';
                let type = 'utility';
                if (['tsx', 'jsx'].includes(ext)) type = 'component';
                else if (ext === 'css') type = 'style';
                else if (ext === 'json') type = 'config';

                return { path, content, type, completed: true };
              });

              setGenerationProgress(prev => ({
                ...prev,
                files: progressFiles,
                status: 'Files applied from local cache'
              }));
            }

            // Force iframe refresh after applying code
            if (iframeRef?.current && effectiveSandboxData?.url) {
              const packagesInstalled = results?.packagesInstalled?.length > 0;
              const refreshDelay = packagesInstalled
                ? appConfig.codeApplication.packageInstallRefreshDelay
                : appConfig.codeApplication.defaultRefreshDelay;

              setTimeout(() => {
                if (iframeRef.current && effectiveSandboxData?.url) {
                  console.log('[applyGeneratedCode] Refreshing iframe...');
                  const urlWithTimestamp = `${effectiveSandboxData.url}?t=${Date.now()}&force=true`;
                  iframeRef.current.src = urlWithTimestamp;
                }
              }, refreshDelay);
            }
          }
        } else {
          throw new Error(finalData?.error || 'Failed to apply code');
        }
      } else {
        addChatMessage('Code application may have partially succeeded. Check the preview.', 'system');
      }
    } catch (error: any) {
      log(`Failed to apply code: ${error.message}`, 'error');
      addChatMessage(`Failed to apply code: ${error.message}`, 'error');
      setCodeApplicationState({ stage: null });
    } finally {
      setLoading(false);
      setGenerationProgress(prev => ({
        ...prev,
        isEdit: false
      }));
    }
  }, [
    sandboxData,
    sandboxFiles,
    chatMessages,
    log,
    addChatMessage,
    displayStructure,
    setLoading,
    setCodeApplicationState,
    setConversationContext,
    setSandboxFiles,
    setGenerationProgress
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
