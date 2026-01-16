import { useAtom } from 'jotai';
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
} from '../atoms/generation';

/**
 * Hook for managing all generation-related state
 * Consolidates 15 generation atoms into a single hook
 */
export function useGenerationState() {
  const [generationProgress, setGenerationProgress] = useAtom(generationProgressAtom);
  const [codeApplicationState, setCodeApplicationState] = useAtom(codeApplicationStateAtom);
  const [urlScreenshot, setUrlScreenshot] = useAtom(urlScreenshotAtom);
  const [isScreenshotLoaded, setIsScreenshotLoaded] = useAtom(isScreenshotLoadedAtom);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useAtom(isCapturingScreenshotAtom);
  const [screenshotError, setScreenshotError] = useAtom(screenshotErrorAtom);
  const [screenshotCollapsed, setScreenshotCollapsed] = useAtom(screenshotCollapsedAtom);
  const [isPreparingDesign, setIsPreparingDesign] = useAtom(isPreparingDesignAtom);
  const [targetUrl, setTargetUrl] = useAtom(targetUrlAtom);
  const [loadingStage, setLoadingStage] = useAtom(loadingStageAtom);
  const [isStartingNewGeneration, setIsStartingNewGeneration] = useAtom(isStartingNewGenerationAtom);
  const [showLoadingBackground, setShowLoadingBackground] = useAtom(showLoadingBackgroundAtom);
  const [shouldAutoGenerate, setShouldAutoGenerate] = useAtom(shouldAutoGenerateAtom);
  const [pendingAutoSendMessage, setPendingAutoSendMessage] = useAtom(pendingAutoSendMessageAtom);
  const [hasInitialSubmission, setHasInitialSubmission] = useAtom(hasInitialSubmissionAtom);

  return {
    // Generation progress
    generationProgress,
    setGenerationProgress,
    
    // Code application
    codeApplicationState,
    setCodeApplicationState,
    
    // Screenshot
    urlScreenshot,
    setUrlScreenshot,
    isScreenshotLoaded,
    setIsScreenshotLoaded,
    isCapturingScreenshot,
    setIsCapturingScreenshot,
    screenshotError,
    setScreenshotError,
    screenshotCollapsed,
    setScreenshotCollapsed,
    
    // Design preparation
    isPreparingDesign,
    setIsPreparingDesign,
    targetUrl,
    setTargetUrl,
    
    // Loading and generation control
    loadingStage,
    setLoadingStage,
    isStartingNewGeneration,
    setIsStartingNewGeneration,
    showLoadingBackground,
    setShowLoadingBackground,
    
    // Auto-generation
    shouldAutoGenerate,
    setShouldAutoGenerate,
    pendingAutoSendMessage,
    setPendingAutoSendMessage,
    hasInitialSubmission,
    setHasInitialSubmission
  };
}
