'use client';

import { useRef, useCallback } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  sandboxDataAtom,
  sandboxFilesAtom,
  sandboxLoadingAtom,
  sandboxStatusAtom,
  responseAreaAtom,
  structureContentAtom,
  fileStructureAtom,
  type SandboxData,
} from '../atoms/sandbox';
import {
  generationProgressAtom,
  showLoadingBackgroundAtom,
  screenshotErrorAtom,
} from '../atoms/generation';
import { selectedFileAtom, aiModelAtom } from '../atoms/ui';
import { chatMessagesAtom, type ChatMessage } from '../atoms/chat';

export function useSandbox() {
  const [sandboxData, setSandboxData] = useAtom(sandboxDataAtom);
  const [sandboxFiles, setSandboxFiles] = useAtom(sandboxFilesAtom);
  const [loading, setLoading] = useAtom(sandboxLoadingAtom);
  const [status, setStatus] = useAtom(sandboxStatusAtom);
  const [responseArea, setResponseArea] = useAtom(responseAreaAtom);
  const setStructureContent = useSetAtom(structureContentAtom);
  const setFileStructure = useSetAtom(fileStructureAtom);
  const setGenerationProgress = useSetAtom(generationProgressAtom);
  const setShowLoadingBackground = useSetAtom(showLoadingBackgroundAtom);
  const setScreenshotError = useSetAtom(screenshotErrorAtom);
  const [selectedFile, setSelectedFile] = useAtom(selectedFileAtom);
  const [aiModel] = useAtom(aiModelAtom);
  const setChatMessages = useSetAtom(chatMessagesAtom);

  const searchParams = useSearchParams();
  const router = useRouter();

  const sandboxCreationRef = useRef<boolean>(false);

  const updateStatus = useCallback((text: string, active: boolean) => {
    setStatus({ text, active });
  }, [setStatus]);

  const log = useCallback((message: string, type: 'info' | 'error' | 'command' = 'info') => {
    setResponseArea(prev => [...prev, `[${type}] ${message}`]);
  }, [setResponseArea]);

  const addChatMessage = useCallback((content: string, type: ChatMessage['type'], metadata?: ChatMessage['metadata']) => {
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

  const displayStructure = useCallback((structure: any) => {
    if (typeof structure === 'object') {
      setStructureContent(JSON.stringify(structure, null, 2));
    } else {
      setStructureContent(structure || 'No structure available');
    }
  }, [setStructureContent]);

  const checkSandboxStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/sandbox-status');
      const data = await response.json();

      if (data.active && data.healthy && data.sandboxData) {
        console.log('[checkSandboxStatus] Setting sandboxData from API:', data.sandboxData);
        setSandboxData(data.sandboxData);
        updateStatus('Sandbox active', true);
      } else if (data.active && !data.healthy) {
        updateStatus('Sandbox not responding', false);
      } else {
        if (!sandboxData) {
          console.log('[checkSandboxStatus] No existing sandboxData, clearing state');
          setSandboxData(null);
          updateStatus('No sandbox', false);
        } else {
          console.log('[checkSandboxStatus] Keeping existing sandboxData, sandbox inactive but data preserved');
          updateStatus('Sandbox status unknown', false);
        }
      }
    } catch (error) {
      console.error('Failed to check sandbox status:', error);
      if (!sandboxData) {
        setSandboxData(null);
        updateStatus('Error', false);
      } else {
        updateStatus('Status check failed', false);
      }
    }
  }, [sandboxData, setSandboxData, updateStatus]);

  const createSandbox = useCallback(async (
    fromHomeScreen = false,
    templateName?: string,
    skipAutoFetchFiles = false
  ): Promise<SandboxData | null> => {
    // Prevent duplicate sandbox creation
    if (sandboxCreationRef.current) {
      console.log('[createSandbox] Sandbox creation already in progress, skipping...');
      return null;
    }

    sandboxCreationRef.current = true;
    console.log('[createSandbox] Starting sandbox creation...', templateName ? `with template: ${templateName}` : '');
    setLoading(true);
    setShowLoadingBackground(true);
    updateStatus('Creating sandbox...', false);
    setResponseArea([]);
    setScreenshotError(null);

    try {
      const response = await fetch('/api/create-ai-sandbox-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: templateName || 'react-vite' })
      });

      const data = await response.json();
      console.log('[createSandbox] Response data:', data);

      if (data.success) {
        sandboxCreationRef.current = false;
        console.log('[createSandbox] Setting sandboxData from creation:', data);
        setSandboxData(data);
        updateStatus('Sandbox active', true);
        log('Sandbox created successfully!');
        log(`Sandbox ID: ${data.sandboxId}`);
        log(`URL: ${data.url}`);

        // Update URL with sandbox ID
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('sandbox', data.sandboxId);
        newParams.set('model', aiModel);
        router.push(`/generation?${newParams.toString()}`, { scroll: false });

        // Fade out loading background after sandbox loads
        setTimeout(() => {
          setShowLoadingBackground(false);
        }, 3000);

        if (data.structure) {
          displayStructure(data.structure);
        }

        // Fetch sandbox files after creation (unless skipped for template mode)
        if (!skipAutoFetchFiles) {
          setTimeout(() => fetchSandboxFiles(), 1000);
        }

        console.log('[createSandbox] Sandbox ready with Vite server running');

        if (!fromHomeScreen) {
          addChatMessage(`Sandbox created! ID: ${data.sandboxId}. I now have context of your sandbox and can help you build your app. Just ask me to create components and I'll automatically apply them!

Tip: I automatically detect and install npm packages from your code imports (like react-router-dom, axios, etc.)`, 'system');
        }

        return data;
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('[createSandbox] Error:', error);
      updateStatus('Error', false);
      log(`Failed to create sandbox: ${error.message}`, 'error');
      addChatMessage(`Failed to create sandbox: ${error.message}`, 'system');
      throw error;
    } finally {
      setLoading(false);
      sandboxCreationRef.current = false;
    }
  }, [
    aiModel,
    searchParams,
    router,
    setSandboxData,
    setLoading,
    setShowLoadingBackground,
    setScreenshotError,
    setResponseArea,
    updateStatus,
    log,
    displayStructure,
    addChatMessage
  ]);

  const fetchSandboxFiles = useCallback(async () => {
    try {
      console.log('[fetchSandboxFiles] Fetching files from sandbox...');
      const response = await fetch('/api/get-sandbox-files', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const files = data.files || {};
          setSandboxFiles(files);
          setFileStructure(data.structure || '');
          console.log('[fetchSandboxFiles] Updated file list:', Object.keys(files).length, 'files');

          const fileEntries = Object.entries(files);
          if (fileEntries.length > 0) {
            const progressFiles = fileEntries.map(([path, content]) => {
              const ext = path.split('.').pop()?.toLowerCase() || '';
              let type = 'utility';
              if (['tsx', 'jsx'].includes(ext)) type = 'component';
              else if (ext === 'css') type = 'style';
              else if (ext === 'json') type = 'config';

              return {
                path,
                content: content as string,
                type,
                completed: true
              };
            });

            setGenerationProgress(prev => {
              if (prev.isGenerating || prev.files.length > 0) {
                console.log('[fetchSandboxFiles] Skipping file population - generation in progress or files already exist');
                return prev;
              }

              console.log('[fetchSandboxFiles] Populating files from sandbox:', progressFiles.length, 'files');

              return {
                ...prev,
                files: progressFiles,
                isGenerating: false,
                status: 'Files loaded from sandbox'
              };
            });

            // Auto-select file outside of setGenerationProgress
            if (!selectedFile) {
              const firstSourceFile = progressFiles.find(f =>
                f.path.endsWith('.tsx') || f.path.endsWith('.jsx') || f.path.endsWith('.ts') || f.path.endsWith('.js')
              );
              if (firstSourceFile) {
                setSelectedFile(firstSourceFile.path);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[fetchSandboxFiles] Error:', error);
    }
  }, [setSandboxFiles, setFileStructure, setGenerationProgress, selectedFile, setSelectedFile]);

  const refreshIframe = useCallback((iframeRef: React.RefObject<HTMLIFrameElement | null>) => {
    if (iframeRef.current && sandboxData?.url) {
      console.log('[Manual Refresh] Forcing iframe reload...');
      const newSrc = `${sandboxData.url}?t=${Date.now()}&manual=true`;
      iframeRef.current.src = newSrc;
    }
  }, [sandboxData]);

  return {
    // State
    sandboxData,
    sandboxFiles,
    loading,
    status,
    responseArea,

    // Actions
    createSandbox,
    checkSandboxStatus,
    fetchSandboxFiles,
    refreshIframe,
    updateStatus,
    log,
    addChatMessage,
    displayStructure,
  };
}
