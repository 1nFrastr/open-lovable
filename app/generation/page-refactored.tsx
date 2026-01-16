'use client';

import { Suspense, useRef, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';

import { appConfig } from '@/config/app.config';
import HeroInput from '@/components/HeroInput';
import SidebarInput from '@/components/app/generation/SidebarInput';
import HeaderBrandKit from '@/components/shared/header/BrandKit/BrandKit';
import { HeaderProvider } from '@/components/shared/header/HeaderContext';
import { CodeMirrorEditor } from '@/components/editor/codemirror/CodeMirrorEditor';
import CodeApplicationProgress from '@/components/CodeApplicationProgress';

// Import atoms
import {
  sandboxDataAtom,
  sandboxLoadingAtom,
} from './atoms/sandbox';
import {
  chatMessagesAtom,
  aiChatInputAtom,
  conversationContextAtom,
} from './atoms/chat';
import {
  generationProgressAtom,
  codeApplicationStateAtom,
  hasInitialSubmissionAtom,
  urlScreenshotAtom,
  isCapturingScreenshotAtom,
  isPreparingDesignAtom,
  loadingStageAtom,
  isStartingNewGenerationAtom,
  screenshotErrorAtom,
  isScreenshotLoadedAtom,
  targetUrlAtom,
  showLoadingBackgroundAtom,
} from './atoms/generation';
import {
  activeTabAtom,
  homeUrlInputAtom,
  homeContextInputAtom,
  showHomeScreenAtom,
  homeScreenFadingAtom,
  selectedFileAtom,
  aiModelAtom,
  urlInputAtom,
  urlStatusAtom,
  promptInputAtom,
} from './atoms/ui';

// Import hooks
import { useSandbox } from './hooks/useSandbox';
import { useCodeGeneration } from './hooks/useCodeGeneration';
import { useChatMessages } from './hooks/useChatMessages';
import { useInitialization } from './hooks/useInitialization';

// Import components
import { PreviewPane, FileTreePanel, CodeEditorPanel, ChatPanel } from './components';

// Dynamic import for Terminal component
const Terminal = dynamic(() => import('@/components/Terminal'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-[#1a1a1a]">
      <div className="text-gray-400">Loading terminal...</div>
    </div>
  )
});

function GenerationPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Atoms
  const [sandboxData] = useAtom(sandboxDataAtom);
  const [loading] = useAtom(sandboxLoadingAtom);
  const [chatMessages] = useAtom(chatMessagesAtom);
  const [aiChatInput, setAiChatInput] = useAtom(aiChatInputAtom);
  const [conversationContext, setConversationContext] = useAtom(conversationContextAtom);
  const [generationProgress, setGenerationProgress] = useAtom(generationProgressAtom);
  const [codeApplicationState] = useAtom(codeApplicationStateAtom);
  const [hasInitialSubmission, setHasInitialSubmission] = useAtom(hasInitialSubmissionAtom);
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [homeUrlInput, setHomeUrlInput] = useAtom(homeUrlInputAtom);
  const [homeContextInput, setHomeContextInput] = useAtom(homeContextInputAtom);
  const [showHomeScreen, setShowHomeScreen] = useAtom(showHomeScreenAtom);
  const [aiModel, setAiModel] = useAtom(aiModelAtom);
  const [selectedFile, setSelectedFile] = useAtom(selectedFileAtom);
  const [urlScreenshot, setUrlScreenshot] = useAtom(urlScreenshotAtom);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useAtom(isCapturingScreenshotAtom);
  const [isPreparingDesign, setIsPreparingDesign] = useAtom(isPreparingDesignAtom);
  const [loadingStage, setLoadingStage] = useAtom(loadingStageAtom);
  const [isStartingNewGeneration, setIsStartingNewGeneration] = useAtom(isStartingNewGenerationAtom);
  const setShowLoadingBackground = useSetAtom(showLoadingBackgroundAtom);
  const setUrlInput = useSetAtom(urlInputAtom);
  const setUrlStatus = useSetAtom(urlStatusAtom);
  const setPromptInput = useSetAtom(promptInputAtom);
  const setIsScreenshotLoaded = useSetAtom(isScreenshotLoadedAtom);
  const setTargetUrl = useSetAtom(targetUrlAtom);
  const setScreenshotError = useSetAtom(screenshotErrorAtom);

  // Hooks
  const {
    createSandbox,
    fetchSandboxFiles,
    addChatMessage,
  } = useSandbox();

  const {
    applyGeneratedCode,
    captureUrlScreenshot,
    resetGenerationState,
  } = useCodeGeneration();

  const {
    sendChatMessage,
  } = useChatMessages({
    createSandbox,
    applyGeneratedCode,
  });

  // Initialize page (handles URL params, sessionStorage, template mode, etc.)
  useInitialization({
    createSandbox,
    fetchSandboxFiles,
    captureUrlScreenshot,
    startGeneration,
    sendChatMessage,
    handleTemplateSetup: async (templateName, projectTitle, userPrompt, sandboxData) => {
      // TODO: Implement template setup logic
      console.log('Template setup:', templateName, projectTitle, userPrompt);
    },
  });

  // Start generation from URL
  const startGeneration = useCallback(async () => {
    if (!homeUrlInput.trim()) return;

    setIsStartingNewGeneration(true);
    setLoadingStage('gathering');
    setActiveTab('preview');
    setShowLoadingBackground(true);

    // Clear messages
    const displayUrl = homeUrlInput.trim().match(/^https?:\/\//i)
      ? homeUrlInput.trim()
      : 'https://' + homeUrlInput.trim();
    const cleanUrl = displayUrl.replace(/^https?:\/\//i, '');

    addChatMessage(`Starting to clone ${cleanUrl}...`, 'system');

    // Start sandbox creation if needed
    const sandboxPromise = !sandboxData ? createSandbox(true) : Promise.resolve(null);

    // Capture screenshot
    captureUrlScreenshot(displayUrl);

    setTimeout(async () => {
      setShowHomeScreen(false);

      setTimeout(() => {
        setIsStartingNewGeneration(false);
      }, 1000);

      await sandboxPromise;

      // Now handle the actual generation...
      // (This would integrate with the full startGeneration logic from the original)
    }, 500);
  }, [
    homeUrlInput,
    sandboxData,
    setIsStartingNewGeneration,
    setLoadingStage,
    setActiveTab,
    setShowLoadingBackground,
    setShowHomeScreen,
    addChatMessage,
    createSandbox,
    captureUrlScreenshot,
  ]);

  // Reapply last generation
  const reapplyLastGeneration = useCallback(async () => {
    if (!conversationContext.lastGeneratedCode || !sandboxData) return;
    await applyGeneratedCode(conversationContext.lastGeneratedCode, false);
  }, [conversationContext.lastGeneratedCode, sandboxData, applyGeneratedCode]);

  // Download zip
  const downloadZip = useCallback(async () => {
    if (!sandboxData) return;
    try {
      const response = await fetch('/api/create-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandboxId: sandboxData.sandboxId })
      });

      if (!response.ok) throw new Error('Failed to create zip');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error: any) {
      addChatMessage(`Failed to download: ${error.message}`, 'error');
    }
  }, [sandboxData, addChatMessage]);

  // Render main content based on active tab
  const renderMainContent = () => {
    if (activeTab === 'generation') {
      return (
        <div className="h-full flex">
          {/* File Tree */}
          <div className="w-64 border-r border-gray-200 overflow-y-auto bg-white">
            <FileTreePanel />
          </div>
          {/* Code Editor */}
          <div className="flex-1">
            <CodeEditorPanel />
          </div>
        </div>
      );
    }

    if (activeTab === 'terminal') {
      return <Terminal sandboxId={sandboxData?.sandboxId} />;
    }

    // Preview tab
    return <PreviewPane onScreenshotLoaded={() => setIsScreenshotLoaded(true)} />;
  };

  return (
    <HeaderProvider>
      <div className="font-sans bg-background text-foreground h-screen flex flex-col">
        {/* Header */}
        <div className="bg-white py-[15px] border-b border-border-faint flex items-center justify-between shadow-sm">
          <HeaderBrandKit />
          <div className="flex items-center gap-2">
            {/* Model Selector */}
            <select
              value={aiModel}
              onChange={(e) => {
                const newModel = e.target.value;
                setAiModel(newModel);
                const params = new URLSearchParams(searchParams.toString());
                params.set('model', newModel);
                if (sandboxData?.sandboxId) {
                  params.set('sandbox', sandboxData.sandboxId);
                }
                router.push(`/generation?${params.toString()}`);
              }}
              className="px-3 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 transition-colors"
            >
              {appConfig.ai.availableModels.map(model => (
                <option key={model} value={model}>
                  {appConfig.ai.modelDisplayNames?.[model] || model}
                </option>
              ))}
            </select>

            {/* Action buttons */}
            <button
              onClick={() => createSandbox()}
              className="p-8 rounded-lg transition-colors bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100"
              title="Create new sandbox"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={reapplyLastGeneration}
              className="p-8 rounded-lg transition-colors bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Re-apply last generation"
              disabled={!conversationContext.lastGeneratedCode || !sandboxData}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={downloadZip}
              disabled={!sandboxData}
              className="p-8 rounded-lg transition-colors bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download your Vite app as ZIP"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Chat */}
          <div className="flex-1 max-w-[400px] flex flex-col border-r border-border bg-background">
            {/* Sidebar Input */}
            {!hasInitialSubmission && (
              <div className="p-4 border-b border-border">
                <SidebarInput
                  onSubmit={(url, style, model, instructions) => {
                    setHasInitialSubmission(true);
                    sessionStorage.setItem('targetUrl', url);
                    sessionStorage.setItem('selectedStyle', style);
                    sessionStorage.setItem('selectedModel', model);
                    if (instructions) {
                      sessionStorage.setItem('additionalInstructions', instructions);
                    }
                    sessionStorage.setItem('autoStart', 'true');
                    setHomeUrlInput(url);
                    setHomeContextInput(instructions || '');
                    startGeneration();
                  }}
                  disabled={loading || generationProgress.isGenerating}
                />
              </div>
            )}

            {/* Chat Panel */}
            <ChatPanel
              onSendMessage={sendChatMessage}
              aiChatInput={aiChatInput}
              setAiChatInput={setAiChatInput}
              isGenerating={generationProgress.isGenerating}
              isLoading={loading}
            />
          </div>

          {/* Right Panel - Preview/Code */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab Bar */}
            <div className="px-3 pt-4 pb-4 bg-white border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="inline-flex bg-gray-100 border border-gray-200 rounded-md p-0.5">
                  <TabButton
                    active={activeTab === 'generation'}
                    onClick={() => setActiveTab('generation')}
                    icon={<CodeIcon />}
                    label="Code"
                  />
                  <TabButton
                    active={activeTab === 'preview'}
                    onClick={() => setActiveTab('preview')}
                    icon={<EyeIcon />}
                    label="View"
                  />
                  <TabButton
                    active={activeTab === 'terminal'}
                    onClick={() => setActiveTab('terminal')}
                    icon={<TerminalIcon />}
                    label="Terminal"
                  />
                </div>
              </div>

              <div className="flex gap-2 items-center">
                {activeTab === 'generation' && generationProgress.files.length > 0 && (
                  <div className="text-gray-500 text-xs font-medium">
                    {generationProgress.files.length} files generated
                  </div>
                )}

                {sandboxData && (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-md text-xs font-medium text-gray-700">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      Sandbox active
                    </div>
                    <a
                      href={sandboxData.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in new tab"
                      className="p-1.5 rounded-md transition-all text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative overflow-hidden">
              {renderMainContent()}
            </div>
          </div>
        </div>
      </div>
    </HeaderProvider>
  );
}

// Tab button component
function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded transition-all text-xs font-medium ${
        active
          ? 'bg-white text-gray-900 shadow-sm'
          : 'bg-transparent text-gray-600 hover:text-gray-900'
      }`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span>{label}</span>
      </div>
    </button>
  );
}

// Icon components
function CodeIcon() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <GenerationPageContent />
    </Suspense>
  );
}
