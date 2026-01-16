'use client';

import { useEffect, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { useSearchParams } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import {
  showHomeScreenAtom,
  homeScreenFadingAtom,
  homeUrlInputAtom,
  homeContextInputAtom,
  selectedStyleAtom,
  aiModelAtom,
  activeTabAtom,
} from '../atoms/ui';
import {
  hasInitialSubmissionAtom,
  shouldAutoGenerateAtom,
  pendingAutoSendMessageAtom,
  urlScreenshotAtom,
  isCapturingScreenshotAtom,
} from '../atoms/generation';
import { sandboxDataAtom, type SandboxData } from '../atoms/sandbox';
import { chatMessagesAtom, conversationContextAtom, type ChatMessage } from '../atoms/chat';

interface UseInitializationOptions {
  createSandbox: (fromHomeScreen?: boolean, templateName?: string, skipAutoFetchFiles?: boolean) => Promise<SandboxData | null>;
  fetchSandboxFiles: () => Promise<void>;
  captureUrlScreenshot: (url: string) => Promise<void>;
  startGeneration: () => Promise<void>;
  sendChatMessage: (message?: string) => Promise<void>;
  handleTemplateSetup: (templateName: string, projectTitle: string, userPrompt: string, sandboxData?: SandboxData | null) => Promise<void>;
}

export function useInitialization(options: UseInitializationOptions) {
  const {
    createSandbox,
    fetchSandboxFiles,
    captureUrlScreenshot,
    startGeneration,
    sendChatMessage,
    handleTemplateSetup,
  } = options;

  const searchParams = useSearchParams();
  
  const [showHomeScreen, setShowHomeScreen] = useAtom(showHomeScreenAtom);
  const setHomeScreenFading = useSetAtom(homeScreenFadingAtom);
  const [homeUrlInput, setHomeUrlInput] = useAtom(homeUrlInputAtom);
  const [homeContextInput, setHomeContextInput] = useAtom(homeContextInputAtom);
  const setSelectedStyle = useSetAtom(selectedStyleAtom);
  const [aiModel, setAiModel] = useAtom(aiModelAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  
  const setHasInitialSubmission = useSetAtom(hasInitialSubmissionAtom);
  const [shouldAutoGenerate, setShouldAutoGenerate] = useAtom(shouldAutoGenerateAtom);
  const [pendingAutoSendMessage, setPendingAutoSendMessage] = useAtom(pendingAutoSendMessageAtom);
  const urlScreenshot = useAtomValue(urlScreenshotAtom);
  const isCapturingScreenshot = useAtomValue(isCapturingScreenshotAtom);
  
  const [sandboxData] = useAtom(sandboxDataAtom);
  const setChatMessages = useSetAtom(chatMessagesAtom);
  const setConversationContext = useSetAtom(conversationContextAtom);

  const autoSendTriggeredRef = useRef<boolean>(false);

  // Initialize AI model from URL params
  useEffect(() => {
    const modelParam = searchParams.get('model');
    const initialModel = appConfig.ai.availableModels.includes(modelParam || '') 
      ? modelParam! 
      : appConfig.ai.defaultModel;
    setAiModel(initialModel);
  }, [searchParams, setAiModel]);

  // Main initialization effect
  useEffect(() => {
    let isMounted = true;
    let sandboxCreated = false;

    const initializePage = async () => {
      if (sandboxCreated) return;

      // Check for template mode first
      const isTemplateMode = sessionStorage.getItem('templateMode') === 'true';
      const projectPrompt = sessionStorage.getItem('projectPrompt');
      const selectedTemplate = sessionStorage.getItem('selectedTemplate');
      const projectTitle = sessionStorage.getItem('projectTitle');

      if (isTemplateMode && projectPrompt && selectedTemplate) {
        console.log('[generation] Template mode detected:', selectedTemplate);

        // Clear template mode storage
        sessionStorage.removeItem('templateMode');
        sessionStorage.removeItem('projectPrompt');
        sessionStorage.removeItem('selectedTemplate');
        sessionStorage.removeItem('projectTitle');

        const storedModel = sessionStorage.getItem('selectedModel');
        if (storedModel) {
          setAiModel(storedModel);
          sessionStorage.removeItem('selectedModel');
        }

        setHasInitialSubmission(true);
        setHomeUrlInput('');
        setHomeContextInput(projectPrompt);
        setShowHomeScreen(false);
        setHomeScreenFading(false);

        sandboxCreated = true;
        const newSandboxData = await createSandbox(true, selectedTemplate !== 'blank' ? selectedTemplate : undefined, true);

        const shouldSkipTemplateSetup = newSandboxData?.skipTemplateSetup ||
          newSandboxData?.templateSource === 'bundled' ||
          newSandboxData?.templateSource === 'e2b-template';

        if (selectedTemplate !== 'blank' && !shouldSkipTemplateSetup) {
          console.log('[handleHomeSubmit] Template not pre-installed, downloading from GitHub...');
          await handleTemplateSetup(selectedTemplate, projectTitle || 'New Project', projectPrompt, newSandboxData);
        } else if (selectedTemplate !== 'blank' && shouldSkipTemplateSetup) {
          console.log('[handleHomeSubmit] Using pre-installed template, skipping handleTemplateSetup');

          setTimeout(async () => {
            console.log('[handleHomeSubmit] Syncing sandbox files before AI generation...');
            await fetchSandboxFiles();
            console.log('[handleHomeSubmit] Files synced, starting AI generation');
            setActiveTab('generation');
            setPendingAutoSendMessage(projectPrompt);
          }, 2500);
        } else {
          setTimeout(async () => {
            console.log('[handleHomeSubmit] Blank template ready, starting AI generation');
            await fetchSandboxFiles();
            setActiveTab('generation');
            setPendingAutoSendMessage(projectPrompt);
          }, 2000);
        }

        return;
      }

      // Check URL parameters
      const urlParam = searchParams.get('url');
      const templateParam = searchParams.get('template');
      const detailsParam = searchParams.get('details');

      const storedUrl = urlParam || sessionStorage.getItem('targetUrl');
      const storedStyle = templateParam || sessionStorage.getItem('selectedStyle');
      const storedModel = sessionStorage.getItem('selectedModel');
      const storedInstructions = sessionStorage.getItem('additionalInstructions');

      if (storedUrl) {
        setHasInitialSubmission(true);

        sessionStorage.removeItem('targetUrl');
        sessionStorage.removeItem('selectedStyle');
        sessionStorage.removeItem('selectedModel');
        sessionStorage.removeItem('additionalInstructions');

        setHomeUrlInput(storedUrl);
        setSelectedStyle(storedStyle || 'modern');

        if (detailsParam) {
          setHomeContextInput(detailsParam);
        } else if (storedStyle && !urlParam) {
          const styleNames: Record<string, string> = {
            '1': 'Glassmorphism',
            '2': 'Neumorphism',
            '3': 'Brutalism',
            '4': 'Minimalist',
            '5': 'Dark Mode',
            '6': 'Gradient Rich',
            '7': '3D Depth',
            '8': 'Retro Wave',
            'modern': 'Modern clean and minimalist',
            'playful': 'Fun colorful and playful',
            'professional': 'Corporate professional and sleek',
            'artistic': 'Creative artistic and unique'
          };
          const styleName = styleNames[storedStyle] || storedStyle;
          let contextString = `${styleName} style design`;

          if (storedInstructions) {
            contextString += `. ${storedInstructions}`;
          }

          setHomeContextInput(contextString);
        } else if (storedInstructions && !urlParam) {
          setHomeContextInput(storedInstructions);
        }

        if (storedModel) {
          setAiModel(storedModel);
        }

        setShowHomeScreen(false);
        setHomeScreenFading(false);
        setShouldAutoGenerate(true);
        sessionStorage.setItem('autoStart', 'true');
      }

      // Clear old conversation
      try {
        await fetch('/api/conversation-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear-old' })
        });
        console.log('[home] Cleared old conversation data on mount');
      } catch (error) {
        console.error('[ai-sandbox] Failed to clear old conversation:', error);
      }

      if (!isMounted) return;

      const sandboxIdParam = searchParams.get('sandbox');

      try {
        if (sandboxIdParam) {
          console.log('[home] Attempting to restore sandbox:', sandboxIdParam);
          sandboxCreated = true;
          await createSandbox(true);
        } else {
          console.log('[home] No sandbox in URL, creating new sandbox automatically...');
          sandboxCreated = true;
          await createSandbox(true);
        }

        if (storedUrl && isMounted) {
          sessionStorage.setItem('autoStart', 'true');
        }
      } catch (error) {
        console.error('[ai-sandbox] Failed to create or restore sandbox:', error);
      }
    };

    initializePage();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Escape key for home screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showHomeScreen) {
        setHomeScreenFading(true);
        setTimeout(() => {
          setShowHomeScreen(false);
          setHomeScreenFading(false);
        }, 500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHomeScreen, setHomeScreenFading, setShowHomeScreen]);

  // Start capturing screenshot if URL is provided on mount
  useEffect(() => {
    if (!showHomeScreen && homeUrlInput && !urlScreenshot && !isCapturingScreenshot) {
      let screenshotUrl = homeUrlInput.trim();
      if (!screenshotUrl.match(/^https?:\/\//i)) {
        screenshotUrl = 'https://' + screenshotUrl;
      }
      captureUrlScreenshot(screenshotUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHomeScreen, homeUrlInput]);

  // Auto-start generation if flagged
  useEffect(() => {
    const autoStart = sessionStorage.getItem('autoStart');
    if (autoStart === 'true' && !showHomeScreen && homeUrlInput) {
      sessionStorage.removeItem('autoStart');
      setTimeout(() => {
        console.log('[generation] Auto-starting generation for URL:', homeUrlInput);
        startGeneration();
      }, 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHomeScreen, homeUrlInput]);

  // Auto-trigger generation when flag is set
  useEffect(() => {
    if (shouldAutoGenerate && homeUrlInput && !showHomeScreen) {
      setShouldAutoGenerate(false);

      const timer = setTimeout(() => {
        console.log('[generation] Auto-triggering generation from URL params');
        startGeneration();
      }, 1000);

      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoGenerate, homeUrlInput, showHomeScreen]);

  // Auto-send chat message when sandbox is ready (for template mode)
  useEffect(() => {
    if (pendingAutoSendMessage && sandboxData && !showHomeScreen && !autoSendTriggeredRef.current) {
      const messageToSend = pendingAutoSendMessage;
      autoSendTriggeredRef.current = true;
      setPendingAutoSendMessage(null);

      setTimeout(() => {
        console.log('[generation] Auto-sending chat message after sandbox ready:', messageToSend);
        sendChatMessage(messageToSend);
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoSendMessage, sandboxData, showHomeScreen]);

  return {
    // State
    showHomeScreen,
    homeUrlInput,
    homeContextInput,
    aiModel,

    // Actions
    setShowHomeScreen,
    setHomeScreenFading,
    setHomeUrlInput,
    setHomeContextInput,
    setAiModel,
  };
}
