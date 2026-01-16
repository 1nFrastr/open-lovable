'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import { HeaderProvider } from '@/components/shared/header/HeaderContext';
import { BsFolderFill } from '@/lib/icons';
import dynamic from 'next/dynamic';

// Import state hooks
import { useSandboxState } from './hooks/useSandboxState';
import { useChatState } from './hooks/useChatState';
import { useGenerationState } from './hooks/useGenerationState';
import { useUIState } from './hooks/useUIState';

// Import business logic hooks
import { useSandbox } from './hooks/useSandbox';
import { useCodeGeneration } from './hooks/useCodeGeneration';
import { useChatMessages } from './hooks/useChatMessages';
import { useInitialization } from './hooks/useInitialization';
import { useTemplateSetup } from './hooks/useTemplateSetup';
import { useStartGeneration } from './hooks/useStartGeneration';
import { useGenerationUtils } from './hooks/useGenerationUtils';

// Import UI components
import { GenerationHeader } from './components/GenerationHeader';
import { GenerationSidebar } from './components/GenerationSidebar';
import { GenerationStatusBar } from './components/GenerationStatusBar';
import { PreviewPane, type PreviewPaneRef } from './components/PreviewPane';
import { ChatPanel } from './components/ChatPanel';
import { FileTreePanel } from './components/FileTreePanel';
import { CodeEditorPanel } from './components/CodeEditorPanel';

// Import utils
import { getFileIcon } from './utils/fileIcons';

// Dynamic import for Terminal component (requires browser APIs)
const Terminal = dynamic(() => import('@/components/Terminal'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-[#1a1a1a]">
      <div className="text-gray-400">Loading terminal...</div>
    </div>
  )
});

interface SandboxData {
  sandboxId: string;
  url: string;
  template?: string;
  templateSource?: 'bundled' | 'github' | 'fallback' | 'e2b-template';
  skipTemplateSetup?: boolean;
  [key: string]: any;
}

function AISandboxPage() {
  const searchParams = useSearchParams();

  // State management hooks
  const sandboxState = useSandboxState();
  const chatState = useChatState();
  const generationState = useGenerationState();
  const uiState = useUIState();

  // Refs
  const previewPaneRef = useRef<PreviewPaneRef>(null);
  const codeDisplayRef = useRef<HTMLDivElement>(null);
  const isNewSessionRef = useRef(false);

  // Initialize AI model from URL params
  useEffect(() => {
    const modelParam = searchParams.get('model');
    const initialModel = appConfig.ai.availableModels.includes(modelParam || '') 
      ? modelParam! 
      : appConfig.ai.defaultModel;
    uiState.setAiModel(initialModel);
  }, [searchParams, uiState.setAiModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear chat messages for new sessions
  if (!isNewSessionRef.current && typeof window !== 'undefined') {
    const autoStart = sessionStorage.getItem('autoStart');
    if (autoStart === 'true') {
      isNewSessionRef.current = true;
      chatState.setChatMessages([]);
      console.log('[generation] Cleared chat messages for new session (pre-render)');
    }
  }

  // Business logic hooks
  const sandboxHook = useSandbox();
  const codeGenerationHook = useCodeGeneration();
  
  // Chat messages hook with dependencies
  const chatMessagesHook = useChatMessages({
    createSandbox: sandboxHook.createSandbox,
    applyGeneratedCode: codeGenerationHook.applyGeneratedCode,
  });

  // Template setup hook
  const { handleTemplateSetup } = useTemplateSetup({
    previewPaneRef,
    fetchSandboxFiles: sandboxHook.fetchSandboxFiles
  });

  // Wrap applyGeneratedCode for compatibility
  const applyGeneratedCode = async (code: string, isEdit: boolean = false, overrideSandboxData?: SandboxData) => {
    return codeGenerationHook.applyGeneratedCode(code, isEdit, overrideSandboxData);
  };

  // Start generation hook
  const { startGeneration } = useStartGeneration({
    createSandbox: sandboxHook.createSandbox,
    captureUrlScreenshot: codeGenerationHook.captureUrlScreenshot,
    applyGeneratedCode
  });

  // Utils hook
  const { downloadZip, reapplyLastGeneration } = useGenerationUtils(applyGeneratedCode);

  // Auto-start generation if flagged
  useEffect(() => {
    const autoStart = sessionStorage.getItem('autoStart');
    if (autoStart === 'true' && !uiState.showHomeScreen && uiState.homeUrlInput) {
      sessionStorage.removeItem('autoStart');
      setTimeout(() => {
        console.log('[generation] Auto-starting generation for URL:', uiState.homeUrlInput);
        startGeneration();
      }, 1000);
    }
  }, [uiState.showHomeScreen, uiState.homeUrlInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check sandbox status on mount if needed
  useEffect(() => {
    const autoStart = sessionStorage.getItem('autoStart');
    if (!sandboxState.sandboxData && autoStart !== 'true') {
      sandboxHook.checkSandboxStatus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll chat messages
  useEffect(() => {
    if (chatMessagesHook.chatMessagesRef.current) {
      chatMessagesHook.chatMessagesRef.current.scrollTop = chatMessagesHook.chatMessagesRef.current.scrollHeight;
    }
  }, [chatState.chatMessages, chatMessagesHook.chatMessagesRef]);

  // Auto-scroll code display when streaming
  useEffect(() => {
    if (codeDisplayRef.current && generationState.generationProgress.isStreaming) {
      codeDisplayRef.current.scrollTop = codeDisplayRef.current.scrollHeight;
    }
  }, [generationState.generationProgress.files.length, generationState.generationProgress.isStreaming]);

  // Initialize page with all startup logic
  useInitialization({
    createSandbox: sandboxHook.createSandbox,
    fetchSandboxFiles: sandboxHook.fetchSandboxFiles,
    captureUrlScreenshot: codeGenerationHook.captureUrlScreenshot,
    startGeneration,
    sendChatMessage: chatMessagesHook.sendChatMessage,
    handleTemplateSetup,
  });

  // Handle sidebar input submission
  const handleSidebarSubmit = (url: string, style: string, model: string, instructions?: string) => {
    generationState.setHasInitialSubmission(true);
    
    sessionStorage.setItem('targetUrl', url);
    sessionStorage.setItem('selectedStyle', style);
    sessionStorage.setItem('selectedModel', model);
    if (instructions) {
      sessionStorage.setItem('additionalInstructions', instructions);
    }
    sessionStorage.setItem('autoStart', 'true');
    
    uiState.setHomeUrlInput(url);
    uiState.setHomeContextInput(instructions || '');
    startGeneration();
  };

  // Handle file sync from container
  const handleSyncFiles = async () => {
    console.log('[syncFromContainer] Starting sync...');
    console.log('[syncFromContainer] Current files:', generationState.generationProgress.files.map(f => f.path));
    
    try {
      const response = await fetch('/api/get-sandbox-files');
      const data = await response.json();
      if (data.success && data.files) {
        const files = data.files;
        console.log('[syncFromContainer] Fetched files from container:', Object.keys(files));
        
        sandboxState.setSandboxFiles(files);
        
        const progressFiles = Object.entries(files).map(([path, content]) => {
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
        
        generationState.setGenerationProgress(prev => ({
          ...prev,
          files: progressFiles,
          status: 'Synced from container'
        }));
        
        console.log('[syncFromContainer] Updated files:', progressFiles.map(f => f.path));
        
        if (!uiState.selectedFile) {
          const firstSourceFile = progressFiles.find(f => 
            f.path.endsWith('.tsx') || f.path.endsWith('.jsx')
          );
          if (firstSourceFile) {
            uiState.setSelectedFile(firstSourceFile.path);
          }
        }
      }
    } catch (error) {
      console.error('[syncFromContainer] Error:', error);
    }
  };

  // Render main content based on active tab
  const renderMainContent = () => {
    const { activeTab } = uiState;
    const { generationProgress } = generationState;

    if (activeTab === 'generation' && (generationProgress.isGenerating || generationProgress.files.length > 0)) {
      return (
        <div className="absolute inset-0 flex overflow-hidden">
          {/* File Explorer - Hide during edits */}
          {!generationProgress.isEdit && (
            <div className="w-[250px] border-r border-gray-200 bg-gray-50 flex flex-col flex-shrink-0">
              <div className="p-4 bg-gray-100 text-gray-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BsFolderFill style={{ width: '16px', height: '16px' }} />
                  <span className="text-sm font-medium">Explorer</span>
                </div>
                <button
                  onClick={handleSyncFiles}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                  title="Sync files from container"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                <FileTreePanel />
              </div>
            </div>
          )}
          
          {/* Code Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Thinking Mode Display */}
            {generationProgress.isGenerating && (generationProgress.isThinking || generationProgress.thinkingText) && (
              <div className="px-6 pb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-purple-600 font-medium flex items-center gap-2">
                    {generationProgress.isThinking ? (
                      <>
                        <div className="w-3 h-3 bg-purple-600 rounded-full animate-pulse" />
                        AI is thinking...
                      </>
                    ) : (
                      <>
                        <span className="text-purple-600">✓</span>
                        Thought for {generationProgress.thinkingDuration || 0} seconds
                      </>
                    )}
                  </div>
                </div>
                {generationProgress.thinkingText && (
                  <div className="bg-purple-950 border border-purple-700 rounded-lg p-4 max-h-48 overflow-y-auto scrollbar-hide">
                    <pre className="text-xs font-mono text-purple-300 whitespace-pre-wrap">
                      {generationProgress.thinkingText}
                    </pre>
                  </div>
                )}
              </div>
            )}
            
            {/* Code Editor Panel */}
            <div className="flex-1 rounded-lg p-6 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide" ref={codeDisplayRef}>
                <CodeEditorPanel />
              </div>
            </div>
            
            {/* Progress indicator */}
            {generationProgress.components.length > 0 && (
              <div className="mx-6 mb-6">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-300"
                    style={{
                      width: `${(generationProgress.currentComponent / Math.max(generationProgress.components.length, 1)) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      );
    } else if (activeTab === 'preview') {
      return <PreviewPane ref={previewPaneRef} onScreenshotLoaded={() => generationState.setIsScreenshotLoaded(true)} />;
    } else if (activeTab === 'terminal') {
      return (
        <div className="absolute inset-0 flex flex-col overflow-hidden">
          <Terminal sandboxId={sandboxState.sandboxData?.sandboxId} />
        </div>
      );
    }
    return null;
  };

  return (
    <HeaderProvider>
      <div className="font-sans bg-background text-foreground h-screen flex flex-col">
        {/* Header */}
        <GenerationHeader
          aiModel={uiState.aiModel}
          setAiModel={uiState.setAiModel}
          sandboxData={sandboxState.sandboxData}
          hasLastGeneration={!!chatState.conversationContext.lastGeneratedCode}
          onCreateSandbox={() => sandboxHook.createSandbox()}
          onReapplyLastGeneration={reapplyLastGeneration}
          onDownloadZip={downloadZip}
        />

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <GenerationSidebar
            hasInitialSubmission={generationState.hasInitialSubmission}
            isDisabled={sandboxState.loading || generationState.generationProgress.isGenerating}
            scrapedWebsites={chatState.conversationContext.scrapedWebsites}
            onSubmit={handleSidebarSubmit}
          >
            <ChatPanel
              onSendMessage={chatMessagesHook.sendChatMessage}
              aiChatInput={chatState.aiChatInput}
              setAiChatInput={chatState.setAiChatInput}
              isGenerating={generationState.generationProgress.isGenerating}
              isLoading={sandboxState.loading}
            />
          </GenerationSidebar>

          {/* Right Panel - Preview or Generation */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <GenerationStatusBar
              activeTab={uiState.activeTab}
              onTabChange={uiState.setActiveTab}
              sandboxData={sandboxState.sandboxData}
              isGenerating={generationState.generationProgress.isGenerating}
              isEdit={generationState.generationProgress.isEdit}
              filesCount={generationState.generationProgress.files.length}
            />
            <div className="flex-1 relative overflow-hidden">
              {renderMainContent()}
            </div>
          </div>
        </div>
      </div>
    </HeaderProvider>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <AISandboxPage />
    </Suspense>
  );
}
