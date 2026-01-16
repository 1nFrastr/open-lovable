'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAtom } from 'jotai';
import { appConfig } from '@/config/app.config';
import HeroInput from '@/components/HeroInput';
import SidebarInput from '@/components/app/generation/SidebarInput';
import HeaderBrandKit from '@/components/shared/header/BrandKit/BrandKit';
import { HeaderProvider } from '@/components/shared/header/HeaderContext';
import { CodeMirrorEditor } from '@/components/editor/codemirror/CodeMirrorEditor';
import type { EditorDocument } from '@/components/editor/codemirror/CodeMirrorEditor';
// Import icons from centralized module to avoid Turbopack chunk issues
import { 
  FiFile, 
  FiChevronRight, 
  FiChevronDown,
  FiGithub,
  BsFolderFill, 
  BsFolder2Open,
  SiJavascript, 
  SiReact, 
  SiCss3, 
  SiJson 
} from '@/lib/icons';
import { motion } from 'framer-motion';
import CodeApplicationProgress, { type CodeApplicationState } from '@/components/CodeApplicationProgress';
import IframeBlankDetector from '@/components/IframeBlankDetector';
import dynamic from 'next/dynamic';

// TEMP: Import sandbox atoms for Step 1.1 verification
import { 
  sandboxDataAtom, 
  sandboxFilesAtom, 
  sandboxLoadingAtom, 
  sandboxStatusAtom,
  fileStructureAtom,
  structureContentAtom,
  responseAreaAtom
} from './atoms/sandbox';

// TEMP: Import chat atoms for Step 1.2 verification
import {
  chatMessagesAtom,
  aiChatInputAtom,
  aiEnabledAtom,
  conversationContextAtom,
  addChatMessageAtom
} from './atoms/chat';

// TEMP: Import generation atoms for Step 1.3 verification
import {
  generationProgressAtom,
  codeApplicationStateAtom,
  urlScreenshotAtom,
  isScreenshotLoadedAtom,
  isCapturingScreenshotAtom,
  screenshotErrorAtom,
  screenshotCollapsedAtom,
  isPreparingDesignAtom,
  targetUrlAtom,
  loadingStageAtom,
  isStartingNewGenerationAtom,
  showLoadingBackgroundAtom,
  shouldAutoGenerateAtom,
  pendingAutoSendMessageAtom,
  hasInitialSubmissionAtom
} from './atoms/generation';

// TEMP: Import UI atoms for Step 1.4 verification
import {
  activeTabAtom,
  showHomeScreenAtom,
  homeScreenFadingAtom,
  homeUrlInputAtom,
  homeContextInputAtom,
  urlOverlayVisibleAtom,
  urlInputAtom,
  urlStatusAtom,
  selectedFileAtom,
  expandedFoldersAtom,
  sidebarScrolledAtom,
  showStyleSelectorAtom,
  selectedStyleAtom,
  promptInputAtom,
  aiModelAtom
} from './atoms/ui';

// TEMP: Step 2.1 - Import useSandbox hook for verification
import { useSandbox } from './hooks/useSandbox';

// TEMP: Step 2.2 - Import useCodeGeneration hook for verification
import { useCodeGeneration } from './hooks/useCodeGeneration';

// TEMP: Step 2.3 - Import useChatMessages hook for verification
import { useChatMessages } from './hooks/useChatMessages';

// TEMP: Step 2.4 - Import useInitialization hook for verification
import { useInitialization } from './hooks/useInitialization';

// TEMP: Step 3.1 - Import PreviewPane component for verification
import { PreviewPane, type PreviewPaneRef } from './components/PreviewPane';

// TEMP: Step 3.2 - Import ChatPanel component for verification
import { ChatPanel } from './components/ChatPanel';

// TEMP: Step 3.3 - Import FileTreePanel component for verification
import { FileTreePanel } from './components/FileTreePanel';

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

interface ChatMessage {
  content: string;
  type: 'user' | 'ai' | 'system' | 'file-update' | 'command' | 'error';
  timestamp: Date;
  metadata?: {
    scrapedUrl?: string;
    scrapedContent?: any;
    generatedCode?: string;
    appliedFiles?: string[];
    commandType?: 'input' | 'output' | 'error' | 'success';
    brandingData?: any;
    sourceUrl?: string;
  };
}

interface ScrapeData {
  success: boolean;
  content?: string;
  url?: string;
  title?: string;
  source?: string;
  screenshot?: string;
  structured?: any;
  metadata?: any;
  message?: string;
  error?: string;
}

function AISandboxPage() {
  // TEMP: Step 1.1 - Replace sandbox useState with Jotai atoms
  const [sandboxData, setSandboxData] = useAtom(sandboxDataAtom);
  const [loading, setLoading] = useAtom(sandboxLoadingAtom);
  const [status, setStatus] = useAtom(sandboxStatusAtom);
  const [responseArea, setResponseArea] = useAtom(responseAreaAtom);
  const [structureContent, setStructureContent] = useAtom(structureContentAtom);
  
  // TEMP: Step 1.4 - Replace UI useState with Jotai atoms
  const [promptInput, setPromptInput] = useAtom(promptInputAtom);
  
  // TEMP: Step 1.2 - Replace chat useState with Jotai atoms
  const [chatMessages, setChatMessages] = useAtom(chatMessagesAtom);
  const [aiChatInput, setAiChatInput] = useAtom(aiChatInputAtom);
  const [aiEnabled] = useAtom(aiEnabledAtom);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // TEMP: Step 1.4 - Replace aiModel with atom (with initialization from searchParams)
  const [aiModel, setAiModel] = useAtom(aiModelAtom);

  // IMPORTANT: Clear chat messages immediately if this is a new session from home page
  // This prevents showing old messages during the initial render
  // We check for autoStart flag which indicates a fresh navigation from home page
  const isNewSessionRef = useRef(false);
  if (!isNewSessionRef.current && typeof window !== 'undefined') {
    const autoStart = sessionStorage.getItem('autoStart');
    if (autoStart === 'true') {
      isNewSessionRef.current = true;
      // Clear chat messages synchronously before first render
      setChatMessages([]);
      console.log('[generation] Cleared chat messages for new session (pre-render)');
    }
  }

  const [urlOverlayVisible, setUrlOverlayVisible] = useAtom(urlOverlayVisibleAtom);
  const [urlInput, setUrlInput] = useAtom(urlInputAtom);
  const [urlStatus, setUrlStatus] = useAtom(urlStatusAtom);
  const [showHomeScreen, setShowHomeScreen] = useAtom(showHomeScreenAtom);
  const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersAtom);
  const [selectedFile, setSelectedFile] = useAtom(selectedFileAtom);
  const [homeScreenFading, setHomeScreenFading] = useAtom(homeScreenFadingAtom);
  const [homeUrlInput, setHomeUrlInput] = useAtom(homeUrlInputAtom);
  const [homeContextInput, setHomeContextInput] = useAtom(homeContextInputAtom);
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [showStyleSelector, setShowStyleSelector] = useAtom(showStyleSelectorAtom);
  const [selectedStyle, setSelectedStyle] = useAtom(selectedStyleAtom);
  
  // TEMP: Step 1.3 - Replace generation useState with Jotai atoms
  const [showLoadingBackground, setShowLoadingBackground] = useAtom(showLoadingBackgroundAtom);
  const [urlScreenshot, setUrlScreenshot] = useAtom(urlScreenshotAtom);
  const [isScreenshotLoaded, setIsScreenshotLoaded] = useAtom(isScreenshotLoadedAtom);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useAtom(isCapturingScreenshotAtom);
  const [screenshotError, setScreenshotError] = useAtom(screenshotErrorAtom);
  const [isPreparingDesign, setIsPreparingDesign] = useAtom(isPreparingDesignAtom);
  const [targetUrl, setTargetUrl] = useAtom(targetUrlAtom);
  
  // TEMP: Step 1.4 - Replace sidebarScrolled with atom
  const [sidebarScrolled, setSidebarScrolled] = useAtom(sidebarScrolledAtom);
  const [screenshotCollapsed, setScreenshotCollapsed] = useAtom(screenshotCollapsedAtom);
  const [loadingStage, setLoadingStage] = useAtom(loadingStageAtom);
  const [isStartingNewGeneration, setIsStartingNewGeneration] = useAtom(isStartingNewGenerationAtom);
  
  // TEMP: Step 1.1 - Replace sandboxFiles and fileStructure with atoms
  const [sandboxFiles, setSandboxFiles] = useAtom(sandboxFilesAtom);
  const [hasInitialSubmission, setHasInitialSubmission] = useAtom(hasInitialSubmissionAtom);
  const [fileStructure, setFileStructure] = useAtom(fileStructureAtom);
  
  // TEMP: Step 1.2 - Replace conversationContext with Jotai atom
  const [conversationContext, setConversationContext] = useAtom(conversationContextAtom);

  // TEMP: Step 3.1 - Changed to PreviewPaneRef for component usage
  const previewPaneRef = useRef<PreviewPaneRef>(null);
  // TEMP: Step 2.3 - Removed local chatMessagesRef, now using hook's ref
  // const chatMessagesRef = useRef<HTMLDivElement>(null);
  const codeDisplayRef = useRef<HTMLDivElement>(null);
  const autoSendTriggeredRef = useRef<boolean>(false);
  
  // TEMP: Step 2.1 - Use useSandbox hook
  const sandboxHook = useSandbox();
  // Note: sandboxHook provides: createSandbox, checkSandboxStatus, fetchSandboxFiles,
  // refreshIframe, updateStatus, log, addChatMessage, displayStructure

  // TEMP: Step 2.2 - Use useCodeGeneration hook
  const codeGenerationHook = useCodeGeneration();
  // Note: codeGenerationHook provides: applyGeneratedCode, captureUrlScreenshot, resetGenerationState,
  // and various setters for generation-related state

  // TEMP: Step 2.3 - Use useChatMessages hook
  const chatMessagesHook = useChatMessages({
    createSandbox: sandboxHook.createSandbox,
    applyGeneratedCode: codeGenerationHook.applyGeneratedCode,
  });
  // Note: chatMessagesHook provides: sendChatMessage, handleAIChatSubmit,
  // addChatMessage, clearChatMessages, chatMessagesRef, and state setters

  const {
    sendChatMessage,
    handleAIChatSubmit,
    chatMessagesRef,
    // Note: chatMessages, aiChatInput already come from atoms, no need to extract
  } = chatMessagesHook;

  // TEMP: Step 1.3 - Replace codeApplicationState and generationProgress with atoms
  const [codeApplicationState, setCodeApplicationState] = useAtom(codeApplicationStateAtom);
  const [generationProgress, setGenerationProgress] = useAtom(generationProgressAtom);

  // TEMP: Step 1.3 - Replace auto-generation flags with atoms
  const [shouldAutoGenerate, setShouldAutoGenerate] = useAtom(shouldAutoGenerateAtom);
  const [pendingAutoSendMessage, setPendingAutoSendMessage] = useAtom(pendingAutoSendMessageAtom);
  // Auto-start generation if flagged
  useEffect(() => {
    const autoStart = sessionStorage.getItem('autoStart');
    if (autoStart === 'true' && !showHomeScreen && homeUrlInput) {
      sessionStorage.removeItem('autoStart');
      // Small delay to ensure everything is ready
      setTimeout(() => {
        console.log('[generation] Auto-starting generation for URL:', homeUrlInput);
        startGeneration();
      }, 1000);
    }
  }, [showHomeScreen, homeUrlInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // TEMP: Step 2.4 - Keep this: Sandbox status check (not in useInitialization)
  useEffect(() => {
    // Only check sandbox status on mount if we don't already have sandboxData
    // AND we're not auto-starting a new generation (which would create a new sandbox)
    const autoStart = sessionStorage.getItem('autoStart');
    if (!sandboxData && autoStart !== 'true') {
      checkSandboxStatus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Extract functions from hooks for use in the component  // Use functions from useSandbox hook
  const { updateStatus, log, addChatMessage, displayStructure, checkSandboxStatus, createSandbox, fetchSandboxFiles, refreshIframe } = sandboxHook;
  
  const handleSurfaceError = (_errors: any[]) => {
    // Function kept for compatibility but Vite errors are now handled by template
    
    // Focus the input
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
    }
  };
  
  const installPackages = async (packages: string[]) => {
    if (!sandboxData) {
      addChatMessage('No active sandbox. Create a sandbox first!', 'system');
      return;
    }
    
    try {
      const response = await fetch('/api/install-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to install packages: ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
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
                case 'command':
                  // Don't show npm install commands - they're handled by info messages
                  if (!data.command.includes('npm install')) {
                    addChatMessage(data.command, 'command', { commandType: 'input' });
                  }
                  break;
                case 'output':
                  addChatMessage(data.message, 'command', { commandType: 'output' });
                  break;
                case 'error':
                  if (data.message && data.message !== 'undefined') {
                    addChatMessage(data.message, 'command', { commandType: 'error' });
                  }
                  break;
                case 'warning':
                  addChatMessage(data.message, 'command', { commandType: 'output' });
                  break;
                case 'success':
                  addChatMessage(`${data.message}`, 'system');
                  break;
                case 'status':
                  addChatMessage(data.message, 'system');
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error: any) {
      addChatMessage(`Failed to install packages: ${error.message}`, 'system');
    }
  };

  // Handle template setup - downloads template files and applies them to sandbox
  const handleTemplateSetup = async (templateName: string, projectTitle: string, userPrompt: string, newSandboxData?: SandboxData | null) => {
    console.log('[handleTemplateSetup] Starting template setup:', templateName);
    console.log('[handleTemplateSetup] Sandbox data:', newSandboxData?.sandboxId, newSandboxData?.url);
    
    try {
      // Get template config
      const { getTemplateByName } = await import('@/config/templates');
      const template = getTemplateByName(templateName);
      
      if (!template || !template.githubRepo) {
        throw new Error(`Template "${templateName}" not found or has no GitHub repo`);
      }
      
      addChatMessage(`Initializing "${projectTitle}" with ${template.label} template...`, 'system');
      
      // Download template files
      console.log('[handleTemplateSetup] Downloading template files from:', template.githubRepo);
      const downloadResponse = await fetch(`/api/download-template?repo=${encodeURIComponent(template.githubRepo)}`);
      
      if (!downloadResponse.ok) {
        throw new Error(`Failed to download template: ${downloadResponse.statusText}`);
      }
      
      const templateFiles = await downloadResponse.json();
      
      if (templateFiles.error) {
        throw new Error(templateFiles.error);
      }
      
      console.log(`[handleTemplateSetup] Downloaded ${templateFiles.length} files`);
      
      // Format files as Open Lovable format
      const { formatAsOpenLovable } = await import('@/lib/template-project');
      const formattedCode = formatAsOpenLovable(templateFiles, projectTitle);
      
      // Wait a moment for sandbox to be fully ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Apply the template files to sandbox
      console.log('[handleTemplateSetup] Applying template files to sandbox...');
      console.log('[handleTemplateSetup] Formatted code preview:', formattedCode.substring(0, 500));
      
      const applyResponse = await fetch('/api/apply-ai-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: formattedCode,
          isEdit: false,
          isTemplateImport: true  // Preserve exact paths from template
        })
      });
      
      const applyResult = await applyResponse.json();
      console.log('[handleTemplateSetup] Apply result:', JSON.stringify(applyResult, null, 2));
      
      if (!applyResult.success) {
        console.error('[handleTemplateSetup] Apply error:', applyResult);
        throw new Error(applyResult.error || applyResult.message || 'Failed to apply template files');
      }
      
      // Check if files were actually written to sandbox
      if (applyResult.message?.includes('Create a sandbox to apply them')) {
        console.error('[handleTemplateSetup] Sandbox not ready for file writes');
        throw new Error('Sandbox not ready. Please try again.');
      }
      
      console.log('[handleTemplateSetup] Template applied successfully');
      console.log('[handleTemplateSetup] Files created:', applyResult.results?.filesCreated);
      
      // Use the passed sandbox data or fall back to state
      const activeSandboxData = newSandboxData || sandboxData;
      
      // Refresh iframe with the correct URL
      const sandboxUrl = activeSandboxData?.url;
      if (previewPaneRef.current && sandboxUrl) {
        console.log('[handleTemplateSetup] Refreshing iframe with URL:', sandboxUrl);
        setTimeout(() => {
          if (previewPaneRef.current) {
            previewPaneRef.current.refreshIframe();
          }
        }, 3000);
      } else {
        console.log('[handleTemplateSetup] Cannot refresh iframe - no URL available');
      }
      
      // Build file list for display
      const fileList = applyResult.results?.filesCreated?.slice(0, 10).join('\n- ') || 
                       templateFiles.slice(0, 10).map((f: any) => f.path).join('\n- ');
      const totalFiles = applyResult.results?.filesCreated?.length || templateFiles.length;
      const moreFiles = totalFiles > 10 ? `\n... and ${totalFiles - 10} more files` : '';
      
      addChatMessage(
        `✅ Template "${template.label}" has been set up successfully!\n\n` +
        `**Project:** ${projectTitle}\n` +
        `**Files created (${totalFiles}):**\n- ${fileList}${moreFiles}\n\n` +
        `The project is ready! You can now describe what you want me to build or modify.`,
        'system'
      );
      
      // Set conversation context to indicate we have an existing project
      setConversationContext(prev => ({
        ...prev,
        currentProject: projectTitle,
        appliedCode: [{
          files: templateFiles.map((f: any) => f.path),
          timestamp: new Date()
        }]
      }));
      
      // Wait for files to sync, then start AI generation
      console.log('[handleTemplateSetup] Template setup complete. Waiting for files to sync...');
      
      // Build the message based on the user's prompt
      const messageToSend = userPrompt && !userPrompt.toLowerCase().includes('create a react') && 
          !userPrompt.toLowerCase().includes('create a vue') &&
          !userPrompt.toLowerCase().includes('create a next')
        ? `Based on the ${template.label} template, ${userPrompt}`
        : userPrompt;
      
      // Sync files, switch to generation tab, and start AI
      setTimeout(async () => {
        console.log('[handleTemplateSetup] Syncing sandbox files before AI generation...');
        await fetchSandboxFiles();
        console.log('[handleTemplateSetup] Files synced, switching to generation tab and starting AI');
        setActiveTab('generation');
        setPendingAutoSendMessage(messageToSend);
      }, 2000);
      
    } catch (error: any) {
      console.error('[handleTemplateSetup] Error:', error);
      addChatMessage(
        `❌ Failed to set up template: ${error.message}\n\n` +
        `The sandbox is ready but the template files could not be loaded.\n` +
        `You can describe what you want to build and I'll create it from scratch.`,
        'error'
      );
      // Pre-fill with user's request so they can easily continue
      setAiChatInput(userPrompt);
    }
  };

  // TEMP: Step 2.2 - Use applyGeneratedCode from useCodeGeneration hook
  // TEMP: Step 3.1 - Removed iframeRef parameter since PreviewPane handles iframe internally
  // The PreviewPane component manages its own iframe and refresh logic
  const applyGeneratedCode = async (code: string, isEdit: boolean = false, overrideSandboxData?: SandboxData) => {
    return codeGenerationHook.applyGeneratedCode(code, isEdit, overrideSandboxData);
  };

  const renderMainContent = () => {
    if (activeTab === 'generation' && (generationProgress.isGenerating || generationProgress.files.length > 0)) {
      return (
        /* Generation Tab Content */
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
                onClick={async () => {
                  console.log('[syncFromContainer] Starting sync...');
                  console.log('[syncFromContainer] Current generationProgress.files:', generationProgress.files.map(f => f.path));
                  
                  // Force fetch files from container and update generationProgress
                  try {
                    const response = await fetch('/api/get-sandbox-files');
                    const data = await response.json();
                    if (data.success && data.files) {
                      const files = data.files;
                      console.log('[syncFromContainer] Fetched files from container:', Object.keys(files));
                      
                      // Update sandboxFiles state
                      setSandboxFiles(files);
                      
                      // Force update generationProgress.files with fresh content
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
                      
                      setGenerationProgress(prev => ({
                        ...prev,
                        files: progressFiles,
                        status: 'Synced from container'
                      }));
                      
                      console.log('[syncFromContainer] Updated generationProgress.files:', progressFiles.map(f => f.path));
                      
                      // Auto-select first source file if none selected
                      if (!selectedFile) {
                        const firstSourceFile = progressFiles.find(f => 
                          f.path.endsWith('.tsx') || f.path.endsWith('.jsx')
                        );
                        if (firstSourceFile) {
                          setSelectedFile(firstSourceFile.path);
                        }
                      }
                    }
                  } catch (error) {
                    console.error('[syncFromContainer] Error:', error);
                  }
                }}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
                title="Sync files from container"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            
            {/* File Tree - TEMP: Step 3.3 - Use FileTreePanel component */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              <FileTreePanel />
            </div>
          </div>
          )}
          
          {/* Code Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Thinking Mode Display - Only show during active generation */}
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
            
            {/* Live Code Display */}
            <div className="flex-1 rounded-lg p-6 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide" ref={codeDisplayRef}>
                {/* Show selected file if one is selected */}
                {selectedFile ? (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="bg-black border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                      <div className="px-4 py-2 bg-[#36322F] text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getFileIcon(selectedFile)}
                          <span className="font-mono text-sm">{selectedFile}</span>
                        </div>
                        <button
                          onClick={() => setSelectedFile(null)}
                          className="hover:bg-black/20 p-1 rounded transition-colors"
                        >
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="bg-gray-900 border border-gray-700 rounded h-[600px]">
                        <CodeMirrorEditor
                          theme="dark"
                          editable={false}
                          doc={{
                            value: (() => {
                              // Find the file content from generated files
                              const file = generationProgress.files.find(f => f.path === selectedFile);
                              return file?.content || '// File content will appear here';
                            })(),
                            filePath: selectedFile,
                          }}
                          settings={{
                            fontSize: '14px',
                            tabSize: 2,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : /* If no files parsed yet, show loading or raw stream */
                generationProgress.files.length === 0 && !generationProgress.currentFile ? (
                  generationProgress.isThinking ? (
                    // Beautiful loading state while thinking
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="mb-8 relative">
                          <div className="w-48 h-48 mx-auto">
                            <div className="absolute inset-0 border-8 border-gray-800 rounded-full"></div>
                            <div className="absolute inset-0 border-8 border-green-500 rounded-full animate-spin border-t-transparent"></div>
                          </div>
                        </div>
                        <h3 className="text-xl font-medium text-white mb-2">AI is analyzing your request</h3>
                        <p className="text-gray-400 text-sm">{generationProgress.status || 'Preparing to generate code...'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-black border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-2 bg-gray-100 text-gray-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-16 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                          <span className="font-mono text-sm">Streaming code...</span>
                        </div>
                      </div>
                      <div className="p-4 bg-gray-900 rounded h-[500px] relative">
                        <CodeMirrorEditor
                          theme="dark"
                          editable={false}
                          doc={{
                            value: generationProgress.streamedCode || 'Starting code generation...',
                            filePath: 'streaming.jsx',
                          }}
                          settings={{
                            fontSize: '14px',
                            tabSize: 2,
                          }}
                        />
                        <span className="absolute bottom-2 right-2 w-3 h-5 bg-orange-400 animate-pulse" />
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    {/* Show current file being generated */}
                    {generationProgress.currentFile && (
                      <div className="bg-black border-2 border-gray-400 rounded-lg overflow-hidden shadow-sm">
                        <div className="px-4 py-2 bg-[#36322F] text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-16 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span className="font-mono text-sm">{generationProgress.currentFile.path}</span>
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              generationProgress.currentFile.type === 'css' ? 'bg-blue-600 text-white' :
                              generationProgress.currentFile.type === 'javascript' ? 'bg-yellow-600 text-white' :
                              generationProgress.currentFile.type === 'json' ? 'bg-green-600 text-white' :
                              'bg-gray-200 text-gray-700'
                            }`}>
                              {generationProgress.currentFile.type === 'javascript' ? 'JSX' : generationProgress.currentFile.type.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded h-[500px] relative">
                          <CodeMirrorEditor
                            theme="dark"
                            editable={false}
                            doc={{
                              value: generationProgress.currentFile.content,
                              filePath: generationProgress.currentFile.path,
                            }}
                            settings={{
                              fontSize: '12px',
                              tabSize: 2,
                            }}
                          />
                          <span className="absolute bottom-2 right-2 w-3 h-4 bg-orange-400 animate-pulse" />
                        </div>
                      </div>
                    )}
                    
                    {/* Show completed files */}
                    {generationProgress.files.map((file, idx) => (
                      <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-[#36322F] text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-green-500">✓</span>
                            <span className="font-mono text-sm">{file.path}</span>
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            file.type === 'css' ? 'bg-blue-600 text-white' :
                            file.type === 'javascript' ? 'bg-yellow-600 text-white' :
                            file.type === 'json' ? 'bg-green-600 text-white' :
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {file.type === 'javascript' ? 'JSX' : file.type.toUpperCase()}
                          </span>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 h-48">
                          <CodeMirrorEditor
                            theme="dark"
                            editable={false}
                            doc={{
                              value: file.content,
                              filePath: file.path,
                            }}
                            settings={{
                              fontSize: '12px',
                              tabSize: 2,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    
                    {/* Show remaining raw stream if there's content after the last file */}
                    {!generationProgress.currentFile && generationProgress.streamedCode.length > 0 && (
                      <div className="bg-black border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-[#36322F] text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-16 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            <span className="font-mono text-sm">Processing...</span>
                          </div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded h-[400px]">
                          <CodeMirrorEditor
                            theme="dark"
                            editable={false}
                            doc={{
                              value: (() => {
                                // Show only the tail of the stream after the last file
                                const lastFileEnd = generationProgress.files.length > 0 
                                  ? generationProgress.streamedCode.lastIndexOf('</file>') + 7
                                  : 0;
                                let remainingContent = generationProgress.streamedCode.slice(lastFileEnd).trim();
                                
                                // Remove explanation tags and content
                                remainingContent = remainingContent.replace(/<explanation>[\s\S]*?<\/explanation>/g, '').trim();

                                // If only whitespace or nothing left, show loading message
                                // Use "Loading sandbox..." instead of "Waiting for next file..." for better UX
                                return remainingContent || 'Loading sandbox...';
                              })(),
                              filePath: 'processing.jsx',
                            }}
                            settings={{
                              fontSize: '12px',
                              tabSize: 2,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
      // TEMP: Step 3.1 - Use PreviewPane component
      return <PreviewPane ref={previewPaneRef} onScreenshotLoaded={() => setIsScreenshotLoaded(true)} />;
    } else if (activeTab === 'terminal') {
      // Terminal Tab Content
      return (
        <div className="absolute inset-0 flex flex-col overflow-hidden">
          <Terminal sandboxId={sandboxData?.sandboxId} />
        </div>
      );
    }
    return null;
  };

  const downloadZip = async () => {
    if (!sandboxData) {
      addChatMessage('Please wait for the sandbox to be created before downloading.', 'system');
      return;
    }
    
    setLoading(true);
    log('Creating zip file...');
    addChatMessage('Creating ZIP file of your Vite app...', 'system');
    
    try {
      const response = await fetch('/api/create-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        log('Zip file created!');
        addChatMessage('ZIP file created! Download starting...', 'system');
        
        const link = document.createElement('a');
        link.href = data.dataUrl;
        link.download = data.fileName || 'e2b-project.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        addChatMessage(
          'Your Vite app has been downloaded! To run it locally:\n' +
          '1. Unzip the file\n' +
          '2. Run: npm install\n' +
          '3. Run: npm run dev\n' +
          '4. Open http://localhost:5173',
          'system'
        );
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      log(`Failed to create zip: ${error.message}`, 'error');
      addChatMessage(`Failed to create ZIP: ${error.message}`, 'system');
    } finally {
      setLoading(false);
    }
  };

  const reapplyLastGeneration = async () => {
    if (!conversationContext.lastGeneratedCode) {
      addChatMessage('No previous generation to re-apply', 'system');
      return;
    }
    
    if (!sandboxData) {
      addChatMessage('Please create a sandbox first', 'system');
      return;
    }
    
    addChatMessage('Re-applying last generation...', 'system');
    const isEdit = conversationContext.appliedCode.length > 0;
    await applyGeneratedCode(conversationContext.lastGeneratedCode, isEdit);
  };

  // Auto-scroll code display to bottom when streaming
  // This scrolls the outer container to show the latest card
  useEffect(() => {
    if (codeDisplayRef.current && generationProgress.isStreaming) {
      codeDisplayRef.current.scrollTop = codeDisplayRef.current.scrollHeight;
    }
  }, [generationProgress.files.length, generationProgress.isStreaming]);
  
  // Note: Individual CodeMirror editors handle their own internal scrolling
  // via the autoScroll prop when content changes

  // TEMP: Keep getFileIcon for code editor header display (line 649)
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    if (ext === 'jsx' || ext === 'js') {
      return <SiJavascript style={{ width: '16px', height: '16px' }} className="text-yellow-500" />;
    } else if (ext === 'tsx' || ext === 'ts') {
      return <SiReact style={{ width: '16px', height: '16px' }} className="text-blue-500" />;
    } else if (ext === 'css') {
      return <SiCss3 style={{ width: '16px', height: '16px' }} className="text-blue-500" />;
    } else if (ext === 'json') {
      return <SiJson style={{ width: '16px', height: '16px' }} className="text-gray-600" />;
    } else {
      return <FiFile style={{ width: '16px', height: '16px' }} className="text-gray-600" />;
    }
  };

  const captureUrlScreenshot = codeGenerationHook.captureUrlScreenshot;

  const handleHomeScreenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await startGeneration();
  };

  const startGeneration = async () => {
    if (!homeUrlInput.trim()) return;
    
    setHomeScreenFading(true);
    
    // Set immediate loading state for better UX
    setIsStartingNewGeneration(true);
    setLoadingStage('gathering');
    
    // Immediately switch to preview tab to show loading
    setActiveTab('preview');
    
    // Set loading background to ensure proper visual feedback
    setShowLoadingBackground(true);
    
    // Clear messages and immediately show the initial message
    setChatMessages([]);
    let displayUrl = homeUrlInput.trim();
    if (!displayUrl.match(/^https?:\/\//i)) {
      displayUrl = 'https://' + displayUrl;
    }
    // Remove protocol for cleaner display
    const cleanUrl = displayUrl.replace(/^https?:\/\//i, '');

    // Check if we're in brand extension mode
    const brandExtensionMode = sessionStorage.getItem('brandExtensionMode') === 'true';

    addChatMessage(
      brandExtensionMode
        ? `Analyzing brand from ${cleanUrl}...`
        : `Starting to clone ${cleanUrl}...`,
      'system'
    );
    
    // Start creating sandbox and capturing screenshot immediately in parallel
    const sandboxPromise = !sandboxData ? createSandbox(true) : Promise.resolve(null);
    
    // Set loading stage immediately before hiding home screen
    setLoadingStage('gathering');
    // Also ensure we're on preview tab to show the loading overlay
    setActiveTab('preview');
    
    // Always capture screenshot for new URLs, even if sandbox exists
    // This ensures the loading screen shows properly
    captureUrlScreenshot(displayUrl);
    
    setTimeout(async () => {
      setShowHomeScreen(false);
      setHomeScreenFading(false);
      
      // Clear the starting flag after transition
      setTimeout(() => {
        setIsStartingNewGeneration(false);
      }, 1000);
      
      // Wait for sandbox to be ready (if it's still creating)
      const createdSandbox = await sandboxPromise;
      
      // Now start the clone process which will stream the generation
      setUrlInput(homeUrlInput);
      setUrlOverlayVisible(false); // Make sure overlay is closed
      setUrlStatus(['Scraping website content...']);
      
      try {
        // Scrape the website
        let url = homeUrlInput.trim();
        if (!url.match(/^https?:\/\//i)) {
          url = 'https://' + url;
        }

        // Check if we're in brand extension mode
        const brandExtensionMode = sessionStorage.getItem('brandExtensionMode') === 'true';
        const brandExtensionPrompt = sessionStorage.getItem('brandExtensionPrompt') || '';

        // Screenshot is already being captured in parallel above

        let scrapeData: ScrapeData | undefined;
        let brandGuidelines: any;

        if (brandExtensionMode) {
          // === BRAND EXTENSION MODE ===
          addChatMessage('Extracting brand styles from the website...', 'system');

          // Call the brand extraction endpoint
          const extractResponse = await fetch('/api/extract-brand-styles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url,
              prompt: brandExtensionPrompt
            })
          });

          if (!extractResponse.ok) {
            throw new Error('Failed to extract brand styles');
          }

          brandGuidelines = await extractResponse.json();

          if (!brandGuidelines.success) {
            throw new Error(brandGuidelines.error || 'Failed to extract brand styles');
          }

          // Display branding summary with visual UI
          addChatMessage(`Acquired branding format from ${cleanUrl}`, 'system', {
            brandingData: brandGuidelines.guidelines,
            sourceUrl: cleanUrl
          });
          addChatMessage(`Building your custom component using these brand guidelines...`, 'system');

          // Clear the flags after use
          sessionStorage.removeItem('brandExtensionMode');
          sessionStorage.removeItem('brandExtensionPrompt');

        } else {
          // === NORMAL CLONE MODE ===
          // Check if we have pre-scraped markdown content from search results
          const storedMarkdown = sessionStorage.getItem('siteMarkdown');
        if (storedMarkdown) {
          // Use the pre-scraped content
          scrapeData = {
            success: true,
            content: storedMarkdown,
            title: new URL(url).hostname,
            source: 'search-result'
          };
          sessionStorage.removeItem('siteMarkdown'); // Clear after use
          addChatMessage('Using cached content from search results...', 'system');
        } else {
          // Perform fresh scraping
          const scrapeResponse = await fetch('/api/scrape-url-enhanced', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
          
          if (!scrapeResponse.ok) {
            throw new Error('Failed to scrape website');
          }
          
          scrapeData = await scrapeResponse.json() as ScrapeData;
          
          if (!scrapeData.success) {
            throw new Error(scrapeData.error || 'Failed to scrape website');
          }
        }
        }

        setUrlStatus(brandExtensionMode ? ['Brand styles extracted!', 'Building your component...'] : ['Website scraped successfully!', 'Generating React app...']);

        // Clear preparing design state and switch to generation tab
        setIsPreparingDesign(false);
        setIsScreenshotLoaded(false); // Reset loaded state
        setUrlScreenshot(null); // Clear screenshot when starting generation
        setTargetUrl(''); // Clear target URL

        // Update loading stage to planning
        setLoadingStage('planning');

        // Brief pause before switching to generation tab
        setTimeout(() => {
          setLoadingStage('generating');
          setActiveTab('generation');
        }, 1500);

        // Build the appropriate prompt based on mode
        let prompt;

        if (brandExtensionMode && brandGuidelines) {
          // === BRAND EXTENSION PROMPT ===
          // Store brand guidelines in conversation context
          setConversationContext(prev => ({
            ...prev,
            scrapedWebsites: [...prev.scrapedWebsites, {
              url: url,
              content: { brandGuidelines },
              timestamp: new Date()
            }],
            currentProject: `Custom build using ${url} brand`
          }));

          // Extract comprehensive brand data
          const branding = brandGuidelines.guidelines;

          // Build detailed brand instruction string
          const brandInstructions = `
BRAND GUIDELINES FROM ${url}:

COLOR SYSTEM:
- Color Scheme: ${branding.colorScheme || 'light'} mode
- Primary Color: ${branding.colors?.primary || 'not specified'}
- Accent Color: ${branding.colors?.accent || 'not specified'}
- Background: ${branding.colors?.background || 'not specified'}
- Text Primary: ${branding.colors?.textPrimary || 'not specified'}
- Link Color: ${branding.colors?.link || 'not specified'}

TYPOGRAPHY:
- Primary Font: ${branding.typography?.fontFamilies?.primary || 'system default'}
- Heading Font: ${branding.typography?.fontFamilies?.heading || 'system default'}
- Font Stack (Body): ${branding.typography?.fontStacks?.body?.join(', ') || 'system-ui, sans-serif'}
- Font Stack (Heading): ${branding.typography?.fontStacks?.heading?.join(', ') || 'system-ui, sans-serif'}
- H1 Size: ${branding.typography?.fontSizes?.h1 || '36px'}
- H2 Size: ${branding.typography?.fontSizes?.h2 || '30px'}
- Body Size: ${branding.typography?.fontSizes?.body || '16px'}

SPACING & LAYOUT:
- Base Spacing Unit: ${branding.spacing?.baseUnit || '4'}px
- Border Radius: ${branding.spacing?.borderRadius || '6px'}

BUTTON STYLES:
Primary Button:
  - Background: ${branding.components?.buttonPrimary?.background || branding.colors?.primary}
  - Text Color: ${branding.components?.buttonPrimary?.textColor || '#FFFFFF'}
  - Border Radius: ${branding.components?.buttonPrimary?.borderRadius || branding.spacing?.borderRadius || '8px'}
  - Shadow: ${branding.components?.buttonPrimary?.shadow || 'none'}

Secondary Button:
  - Background: ${branding.components?.buttonSecondary?.background || '#F9F9F9'}
  - Text Color: ${branding.components?.buttonSecondary?.textColor || branding.colors?.textPrimary}
  - Border Radius: ${branding.components?.buttonSecondary?.borderRadius || branding.spacing?.borderRadius || '8px'}
  - Shadow: ${branding.components?.buttonSecondary?.shadow || 'none'}

INPUT FIELDS:
- Border Color: ${branding.components?.input?.borderColor || '#CCCCCC'}
- Border Radius: ${branding.components?.input?.borderRadius || branding.spacing?.borderRadius || '6px'}

BRAND PERSONALITY:
- Tone: ${branding.personality?.tone || 'professional'}
- Energy: ${branding.personality?.energy || 'medium'}
- Target Audience: ${branding.personality?.targetAudience || 'general'}

DESIGN SYSTEM:
- Framework: ${branding.designSystem?.framework || 'tailwind'}
- Component Library: ${branding.designSystem?.componentLibrary || 'custom'}

ASSETS:
${branding.images?.logo ? `- Logo Available: Yes (use carefully if needed)` : '- Logo: Not available'}
${branding.images?.favicon ? `- Favicon: ${branding.images.favicon}` : ''}`;

          prompt = `I want you to build a NEW React component/application based on these brand guidelines and the user's requirements.

<branding-format source="${url}">
${brandInstructions}

RAW BRAND DATA (for reference):
${JSON.stringify(branding, null, 2)}
</branding-format>

USER'S REQUEST:
${brandExtensionPrompt || 'Build a modern web component using these brand guidelines'}

IMPORTANT: The content above in the <branding-format> tags contains the extracted brand guidelines from ${url}.
Use these guidelines (colors, fonts, spacing, design patterns) to build what the user requested.

CRITICAL REQUIREMENTS:
- DO NOT recreate the original website at ${url}
- DO create a COMPLETELY NEW component that fulfills the user's request
- The user wants: "${brandExtensionPrompt}"
- Build ONLY what the user requested - nothing more
- App.jsx should render ONLY the requested component - no extra Header/Footer/Hero unless specifically requested
- Make it a minimal, focused implementation of the user's request

STYLING REQUIREMENTS:
- Apply the EXACT colors from the brand palette (primary, accent, background, text colors)
- Use the EXACT typography (font families, font sizes for h1, h2, body)
- Apply the spacing system (base unit: ${branding.spacing?.baseUnit || '4'}px)
- Use the specified border radius (${branding.spacing?.borderRadius || '6px'}) consistently
- Implement button styles EXACTLY as specified (colors, shadows, border radius)
- Style input fields with the exact border color and border radius
- Match the brand's ${branding.colorScheme || 'light'} color scheme
- Apply the brand personality: ${branding.personality?.tone || 'professional'} tone with ${branding.personality?.energy || 'medium'} energy
- Use Tailwind CSS with inline color values matching the brand palette EXACTLY
- If fonts need to be imported, add @import or @font-face rules to index.css
- Create custom CSS classes in index.css for complex shadows/effects that can't be done with Tailwind

FONT SETUP:
${branding.typography?.fontFamilies?.primary ? `
- Add font family "${branding.typography.fontFamilies.primary}" to your CSS
- Use font stack: ${branding.typography?.fontStacks?.body?.join(', ') || 'system-ui, sans-serif'}
- Set body font size to ${branding.typography?.fontSizes?.body || '16px'}` : '- Use system fonts'}

COMPONENT STRUCTURE:
- src/index.css - Include brand fonts, custom shadows/effects, and base styling
- src/App.jsx - Should ONLY render the requested component (e.g., just <PricingPage /> if user wants pricing)
- src/components/[RequestedComponent].jsx - The actual component fulfilling the user's request

TECHNICAL REQUIREMENTS:
- Create a WORKING, self-contained application
- DO NOT import components that don't exist
- Make sure the app renders immediately with visible content
- All colors must match the brand palette EXACTLY
- All spacing must use the ${branding.spacing?.baseUnit || '4'}px base unit
- Buttons must have the exact styling specified in the guidelines

Focus on building something NEW, minimal, and functional that perfectly matches the ${brandGuidelines.styleName || 'brand'} aesthetic and design system.`;

        } else {
          // === NORMAL CLONE MODE PROMPT ===
          // Store scraped data in conversation context
          if (!scrapeData) {
            throw new Error('Scrape data is missing');
          }
          setConversationContext(prev => ({
            ...prev,
            scrapedWebsites: [...prev.scrapedWebsites, {
              url: url,
              content: scrapeData,
              timestamp: new Date()
            }],
            currentProject: `${url} Clone`
          }));

          // Filter out style-related context when using screenshot/URL-based generation
          // Only keep user's explicit instructions, not inherited styles
          let filteredContext = homeContextInput;
          if (homeUrlInput && homeContextInput) {
            // Check if the context contains default style names that shouldn't be inherited
            const stylePatterns = [
              'Glassmorphism style design',
              'Neumorphism style design',
              'Brutalism style design',
              'Minimalist style design',
              'Dark Mode style design',
              'Gradient Rich style design',
              '3D Depth style design',
              'Retro Wave style design',
              'Modern clean and minimalist style design',
              'Fun colorful and playful style design',
              'Corporate professional and sleek style design',
              'Creative artistic and unique style design'
            ];

            // If the context exactly matches or starts with a style pattern, filter it out
            const startsWithStyle = stylePatterns.some(pattern =>
              homeContextInput.trim().startsWith(pattern)
            );

            if (startsWithStyle) {
              // Extract only the additional instructions part after the style
              const additionalMatch = homeContextInput.match(/\. (.+)$/);
              filteredContext = additionalMatch ? additionalMatch[1] : '';
            }
          }

          prompt = `I want to recreate the ${url} website as a complete React application based on the scraped content below.

${JSON.stringify(scrapeData, null, 2)}

${filteredContext ? `ADDITIONAL CONTEXT/REQUIREMENTS FROM USER:
${filteredContext}

Please incorporate these requirements into the design and implementation.` : ''}

IMPORTANT INSTRUCTIONS:
- Create a COMPLETE, working React application
- Implement ALL sections and features from the original site
- Use Tailwind CSS for all styling (no custom CSS files)
- Make it responsive and modern
- Ensure all text content matches the original
- Create proper component structure
- Make sure the app actually renders visible content
- Create ALL components that you reference in imports
${filteredContext ? '- Apply the user\'s context/theme requirements throughout the application' : ''}

Focus on the key sections and content, making it clean and modern.`;
        }

        setGenerationProgress(prev => ({
          isGenerating: true,
          status: 'Initializing AI...',
          components: [],
          currentComponent: 0,
          streamedCode: '',
          isStreaming: true,
          isThinking: false,
          thinkingText: undefined,
          thinkingDuration: undefined,
          // Keep previous files until new ones are generated
          files: prev.files || [],
          currentFile: undefined,
          lastProcessedPosition: 0
        }));
        
        const aiResponse = await fetch('/api/generate-ai-code-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt,
            model: aiModel,
            context: {
              sandboxId: sandboxData?.sandboxId,
              structure: structureContent,
              conversationContext: conversationContext
            }
          })
        });
        
        if (!aiResponse.ok || !aiResponse.body) {
          throw new Error('Failed to generate code');
        }
        
        const reader = aiResponse.body.getReader();
        const decoder = new TextDecoder();
        let generatedCode = '';
        let explanation = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'status') {
                  setGenerationProgress(prev => ({ ...prev, status: data.message }));
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
                  // Add conversational text to chat only if it's not code
                  let text = data.text || '';
                  
                  // Remove package tags from the text
                  text = text.replace(/<package>[^<]*<\/package>/g, '');
                  text = text.replace(/<packages>[^<]*<\/packages>/g, '');
                  
                  // Filter out any XML tags and file content that slipped through
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
                    
                    // Tab is already switched after scraping
                    
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
                      
                      // Only add if we haven't processed this file yet
                      if (!processedFiles.has(filePath)) {
                        const fileExt = filePath.split('.').pop() || '';
                        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                        fileExt === 'css' ? 'css' :
                                        fileExt === 'json' ? 'json' :
                                        fileExt === 'html' ? 'html' : 'text';
                        
                        // Check if file already exists
                        const existingFileIndex = updatedState.files.findIndex(f => f.path === filePath);
                        
                        if (existingFileIndex >= 0) {
                          // Update existing file and mark as edited
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
                          // Add new file
                          updatedState.files = [...updatedState.files, {
                            path: filePath,
                            content: fileContent.trim(),
                            type: fileType,
                            completed: true,
                            edited: false
                          }];
                        }
                        
                        // Only show file status if not in edit mode
                        if (!prev.isEdit) {
                          updatedState.status = `Completed ${filePath}`;
                        }
                        processedFiles.add(filePath);
                      }
                    }
                    
                    // Check for current file being generated (incomplete file at the end)
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
                        // Only show file status if not in edit mode
                        if (!prev.isEdit) {
                          updatedState.status = `Generating ${filePath}`;
                        }
                      }
                    } else {
                      updatedState.currentFile = undefined;
                    }
                    
                    return updatedState;
                  });
                } else if (data.type === 'complete') {
                  generatedCode = data.generatedCode;
                  explanation = data.explanation;
                  
                  // Save the last generated code
                  setConversationContext(prev => ({
                    ...prev,
                    lastGeneratedCode: generatedCode
                  }));
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
        
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          isStreaming: false,
          status: 'Generation complete!'
        }));
        
        if (generatedCode) {
          addChatMessage('AI recreation generated!', 'system');
          
          // Add the explanation to chat if available
          if (explanation && explanation.trim()) {
            addChatMessage(explanation, 'ai');
          }
          
          setPromptInput(generatedCode);

          // Apply the code (first time is not edit mode)
          await applyGeneratedCode(generatedCode, false);

          addChatMessage(
            brandExtensionMode
              ? `Successfully built your custom component using ${cleanUrl}'s brand guidelines! You can now ask me to modify it or add more features.`
              : `Successfully recreated ${url} as a modern React app${homeContextInput ? ` with your requested context: "${homeContextInput}"` : ''}! The scraped content is now in my context, so you can ask me to modify specific sections or add features based on the original site.`,
            'ai',
            {
              scrapedUrl: url,
              scrapedContent: brandExtensionMode ? { brandGuidelines } : scrapeData,
              generatedCode: generatedCode
            }
          );
          
          setConversationContext(prev => ({
            ...prev,
            generatedComponents: [],
            appliedCode: [...prev.appliedCode, {
              files: [],
              timestamp: new Date()
            }]
          }));
        } else {
          throw new Error('Failed to generate recreation');
        }
        
        setUrlInput('');
        setUrlStatus([]);
        setHomeContextInput('');
        
        // Clear generation progress and all screenshot/design states
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          isStreaming: false,
          status: 'Generation complete!'
        }));
        
        // Clear screenshot and preparing design states to prevent them from showing on next run
        setIsScreenshotLoaded(false); // Reset loaded state
        setUrlScreenshot(null);
        setIsPreparingDesign(false);
        setTargetUrl('');
        setScreenshotError(null);
        setLoadingStage(null); // Clear loading stage
        setIsStartingNewGeneration(false); // Clear new generation flag
        setShowLoadingBackground(false); // Clear loading background
        
        setTimeout(() => {
          // Switch back to preview tab but keep files
          setActiveTab('preview');
        }, 1000); // Show completion briefly then switch
      } catch (error: any) {
        addChatMessage(`Failed to clone website: ${error.message}`, 'system');
        setUrlStatus([]);
        setIsPreparingDesign(false);
        setIsStartingNewGeneration(false); // Clear new generation flag on error
        setLoadingStage(null);
        // Also clear generation progress on error
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          isStreaming: false,
          status: '',
          // Keep files to display in sidebar
          files: prev.files
        }));
      }
    }, 500);
  };

  // TEMP: Step 2.4 - Use useInitialization hook
  // This hook handles all initialization logic including:
  // - AI model initialization from URL params
  // - Template mode detection and setup
  // - URL parameter processing
  // - SessionStorage handling
  // - Auto-generation triggers
  // - Escape key handling
  // - Screenshot capture
  // - Auto-send chat messages
  useInitialization({
    createSandbox: sandboxHook.createSandbox,
    fetchSandboxFiles: sandboxHook.fetchSandboxFiles,
    captureUrlScreenshot: codeGenerationHook.captureUrlScreenshot,
    startGeneration,
    sendChatMessage,
    handleTemplateSetup,
  });

  return (
    <HeaderProvider>
      <div className="font-sans bg-background text-foreground h-screen flex flex-col">
      <div className="bg-white py-[15px] py-[8px] border-b border-border-faint flex items-center justify-between shadow-sm">
        <HeaderBrandKit />
        <div className="flex items-center gap-2">
          {/* Model Selector - Left side */}
          <select
            value={aiModel}
            onChange={(e) => {
              const newModel = e.target.value;
              setAiModel(newModel);
              const params = new URLSearchParams(searchParams);
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

      <div className="flex-1 flex overflow-hidden">
        {/* Center Panel - AI Chat (1/3 of remaining width) */}
        <div className="flex-1 max-w-[400px] flex flex-col border-r border-border bg-background">
          {/* Sidebar Input Component */}
          {!hasInitialSubmission ? (
            <div className="p-4 border-b border-border">
              <SidebarInput
                onSubmit={(url, style, model, instructions) => {
                  // Mark that we've had an initial submission
                  setHasInitialSubmission(true);
                  
                  // Store the configuration in sessionStorage (same as home page)
                  sessionStorage.setItem('targetUrl', url);
                  sessionStorage.setItem('selectedStyle', style);
                  sessionStorage.setItem('selectedModel', model);
                  if (instructions) {
                    sessionStorage.setItem('additionalInstructions', instructions);
                  }
                  sessionStorage.setItem('autoStart', 'true');
                  
                  // Start generation using the existing logic
                  setHomeUrlInput(url);
                  setHomeContextInput(instructions || '');
                  startGeneration();
                }}
                disabled={loading || generationProgress.isGenerating}
              />
            </div>
          ) : null}

          {conversationContext.scrapedWebsites.length > 0 && (
            <div className="p-4 bg-card border-b border-gray-200">
              <div className="flex flex-col gap-4">
                {conversationContext.scrapedWebsites.map((site, idx) => {
                  // Extract favicon and site info from the scraped data
                  const metadata = site.content?.metadata || {};
                  const sourceURL = metadata.sourceURL || site.url;
                  const favicon = metadata.favicon || `https://www.google.com/s2/favicons?domain=${new URL(sourceURL).hostname}&sz=128`;
                  const siteName = metadata.ogSiteName || metadata.title || new URL(sourceURL).hostname;
                  const screenshot = site.content?.screenshot || sessionStorage.getItem('websiteScreenshot');
                  
                  return (
                    <div key={idx} className="flex flex-col gap-3">
                      {/* Site info with favicon */}
                      <div className="flex items-center gap-4 text-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={favicon} 
                          alt={siteName}
                          className="w-16 h-16 rounded"
                          onError={(e) => {
                            e.currentTarget.src = `https://www.google.com/s2/favicons?domain=${new URL(sourceURL).hostname}&sz=128`;
                          }}
                        />
                        <a 
                          href={sourceURL} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-black hover:text-gray-700 truncate max-w-[250px] font-medium"
                          title={sourceURL}
                        >
                          {siteName}
                        </a>
                      </div>
                      
                      {/* Pinned screenshot */}
                      {screenshot && (
                        <div className="w-full">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-600">Screenshot Preview</span>
                            <button
                              onClick={() => setScreenshotCollapsed(!screenshotCollapsed)}
                              className="text-gray-500 hover:text-gray-700 transition-colors p-1"
                              aria-label={screenshotCollapsed ? 'Expand screenshot' : 'Collapse screenshot'}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className={`transition-transform duration-300 ${screenshotCollapsed ? 'rotate-180' : ''}`}
                              >
                                <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          </div>
                          <div
                            className="w-full rounded-lg overflow-hidden border border-gray-200 transition-all duration-300"
                            style={{
                              opacity: screenshotCollapsed ? 0 : 1,
                              transform: screenshotCollapsed ? 'translateY(-20px)' : 'translateY(0)',
                              pointerEvents: screenshotCollapsed ? 'none' : 'auto',
                              maxHeight: screenshotCollapsed ? '0' : '200px'
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={screenshot}
                              alt={`${siteName} preview`}
                              className="w-full h-auto object-cover"
                              style={{ maxHeight: '200px' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TEMP: Step 3.2 - Use ChatPanel component */}
          <ChatPanel
            onSendMessage={sendChatMessage}
            aiChatInput={aiChatInput}
            setAiChatInput={setAiChatInput}
            isGenerating={generationProgress.isGenerating}
            isLoading={loading}
          />

        </div>

        {/* Right Panel - Preview or Generation (2/3 of remaining width) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 pt-4 pb-4 bg-white border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center gap-2">
              {/* Toggle-style Code/View switcher */}
              <div className="inline-flex bg-gray-100 border border-gray-200 rounded-md p-0.5">
                <button
                  onClick={() => setActiveTab('generation')}
                  className={`px-3 py-1 rounded transition-all text-xs font-medium ${
                    activeTab === 'generation' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'bg-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    <span>Code</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-3 py-1 rounded transition-all text-xs font-medium ${
                    activeTab === 'preview' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'bg-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>View</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('terminal')}
                  className={`px-3 py-1 rounded transition-all text-xs font-medium ${
                    activeTab === 'terminal' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'bg-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Terminal</span>
                  </div>
                </button>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {/* Files generated count */}
              {activeTab === 'generation' && !generationProgress.isEdit && generationProgress.files.length > 0 && (
                <div className="text-gray-500 text-xs font-medium">
                  {generationProgress.files.length} files generated
                </div>
              )}
              
              {/* Live Code Generation Status */}
              {activeTab === 'generation' && generationProgress.isGenerating && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-md text-xs font-medium text-gray-700">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  {generationProgress.isEdit ? 'Editing code' : 'Live generation'}
                </div>
              )}
              
              {/* Sandbox Status Indicator */}
              {sandboxData && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-md text-xs font-medium text-gray-700">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                  Sandbox active
                </div>
              )}
              
              {/* Open in new tab button */}
              {sandboxData && (
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
              )}
            </div>
          </div>
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