'use client';

import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { useAtomValue } from 'jotai';
import { appConfig } from '@/config/app.config';
import IframeBlankDetector from '@/components/IframeBlankDetector';
import { LoadingOverlay } from './LoadingOverlay';
import {
  sandboxDataAtom,
} from '../atoms/sandbox';
import {
  generationProgressAtom,
  codeApplicationStateAtom,
  urlScreenshotAtom,
  isScreenshotLoadedAtom,
  isCapturingScreenshotAtom,
  screenshotErrorAtom,
  isPreparingDesignAtom,
  loadingStageAtom,
  isStartingNewGenerationAtom,
  hasInitialSubmissionAtom,
} from '../atoms/generation';

export interface PreviewPaneRef {
  refreshIframe: () => void;
}

interface PreviewPaneProps {
  onScreenshotLoaded?: () => void;
}

export const PreviewPane = forwardRef<PreviewPaneRef, PreviewPaneProps>(
  function PreviewPane({ onScreenshotLoaded }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const sandboxData = useAtomValue(sandboxDataAtom);
    const generationProgress = useAtomValue(generationProgressAtom);
    const codeApplicationState = useAtomValue(codeApplicationStateAtom);
    const urlScreenshot = useAtomValue(urlScreenshotAtom);
    const isScreenshotLoaded = useAtomValue(isScreenshotLoadedAtom);
    const isCapturingScreenshot = useAtomValue(isCapturingScreenshotAtom);
    const screenshotError = useAtomValue(screenshotErrorAtom);
    const isPreparingDesign = useAtomValue(isPreparingDesignAtom);
    const loadingStage = useAtomValue(loadingStageAtom);
    const isStartingNewGeneration = useAtomValue(isStartingNewGenerationAtom);
    const hasInitialSubmission = useAtomValue(hasInitialSubmissionAtom);

    useImperativeHandle(ref, () => ({
      refreshIframe: () => {
        if (iframeRef.current && sandboxData?.url) {
          const newSrc = `${sandboxData.url}?t=${Date.now()}&manual=true`;
          iframeRef.current.src = newSrc;
        }
      },
    }));

    // Calculate if loading overlay should show
    const isInitialGeneration = isCapturingScreenshot || isPreparingDesign ||
      (generationProgress.isGenerating && !generationProgress.isEdit);
    const isNewGenerationWithSandbox = isStartingNewGeneration ||
      (loadingStage !== null && hasInitialSubmission);

    const shouldShowLoadingOverlay =
      (isCapturingScreenshot || isPreparingDesign || generationProgress.isGenerating) &&
      (!sandboxData || isNewGenerationWithSandbox);

    // Show loading state during initial generation
    if (isInitialGeneration || isNewGenerationWithSandbox) {
      return (
        <div className="relative w-full h-full bg-gray-900">
          {/* Screenshot as background when available */}
          {urlScreenshot && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={urlScreenshot}
              alt="Website preview"
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
              style={{
                opacity: isScreenshotLoaded ? 1 : 0,
                willChange: 'opacity',
              }}
              onLoad={onScreenshotLoaded}
              loading="eager"
            />
          )}

          {/* Loading overlay */}
          {shouldShowLoadingOverlay && (
            <LoadingOverlay
              stage={loadingStage}
              isCapturingScreenshot={isCapturingScreenshot}
              isPreparingDesign={isPreparingDesign}
              isGenerating={generationProgress.isGenerating}
            />
          )}
        </div>
      );
    }

    // Show sandbox iframe
    if (sandboxData?.url) {
      return (
        <div className="relative w-full h-full">
          <iframe
            ref={iframeRef}
            src={sandboxData.url}
            className="w-full h-full border-none"
            title="Open Lovable Sandbox"
            allow="clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />

          {/* Auto-detect blank iframe and refresh */}
          <IframeBlankDetector
            iframeRef={iframeRef as React.RefObject<HTMLIFrameElement>}
            sandboxUrl={sandboxData.url}
            enabled={
              appConfig.codeApplication.blankDetection.enabled &&
              !generationProgress.isGenerating &&
              !codeApplicationState.stage
            }
            maxRetries={appConfig.codeApplication.blankDetection.maxRetries}
            retryDelay={appConfig.codeApplication.blankDetection.retryDelay}
            checkDelay={appConfig.codeApplication.blankDetection.checkDelay}
            onRetry={(attempt) => {
              console.log(
                `[IframeBlankDetector] Auto-refresh attempt ${attempt}/${appConfig.codeApplication.blankDetection.maxRetries}`
              );
            }}
          />

          {/* Package installation overlay */}
          {codeApplicationState.stage && codeApplicationState.stage !== 'complete' && (
            <CodeApplicationOverlay codeApplicationState={codeApplicationState} />
          )}

          {/* Code generation indicator */}
          {generationProgress.isGenerating && generationProgress.isEdit && !codeApplicationState.stage && (
            <div className="absolute top-4 right-4 inline-flex items-center gap-2 px-3 py-1.5 bg-black/80 backdrop-blur-sm rounded-lg">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-white text-xs font-medium">Generating code...</span>
            </div>
          )}

          {/* Refresh button */}
          <button
            onClick={() => {
              if (iframeRef.current && sandboxData?.url) {
                const newSrc = `${sandboxData.url}?t=${Date.now()}&manual=true`;
                iframeRef.current.src = newSrc;
              }
            }}
            className="absolute bottom-4 right-4 bg-white/90 hover:bg-white text-gray-700 p-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105"
            title="Refresh sandbox"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      );
    }

    // Default state when no sandbox
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 text-gray-600 text-lg">
        {screenshotError ? (
          <div className="text-center">
            <p className="mb-2">Failed to capture screenshot</p>
            <p className="text-sm text-gray-500">{screenshotError}</p>
          </div>
        ) : sandboxData ? (
          <div className="text-gray-500">
            <div className="w-16 h-16 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading preview...</p>
          </div>
        ) : (
          <div className="text-gray-500 text-center">
            <p className="text-sm">Start chatting to create your first app</p>
          </div>
        )}
      </div>
    );
  }
);

// Code application overlay component
function CodeApplicationOverlay({
  codeApplicationState,
}: {
  codeApplicationState: any;
}) {
  return (
    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-10">
      <div className="text-center max-w-md">
        <div className="mb-6">
          {codeApplicationState.stage === 'installing' ? (
            <div className="w-16 h-16 mx-auto">
              <svg className="w-full h-full animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          ) : null}
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {codeApplicationState.stage === 'analyzing' && 'Analyzing code...'}
          {codeApplicationState.stage === 'installing' && 'Installing packages...'}
          {codeApplicationState.stage === 'applying' && 'Applying changes...'}
        </h3>

        {/* Package list during installation */}
        {codeApplicationState.stage === 'installing' && codeApplicationState.packages && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2 justify-center">
              {codeApplicationState.packages.map((pkg: string, index: number) => (
                <span
                  key={index}
                  className={`px-2 py-1 text-xs rounded-full transition-all ${
                    codeApplicationState.installedPackages?.includes(pkg)
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {pkg}
                  {codeApplicationState.installedPackages?.includes(pkg) && (
                    <span className="ml-1">✓</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Files being generated */}
        {codeApplicationState.stage === 'applying' && codeApplicationState.filesGenerated && (
          <div className="text-sm text-gray-600">
            Creating {codeApplicationState.filesGenerated.length} files...
          </div>
        )}

        <p className="text-sm text-gray-500 mt-2">
          {codeApplicationState.stage === 'analyzing' &&
            'Parsing generated code and detecting dependencies...'}
          {codeApplicationState.stage === 'installing' &&
            'This may take a moment while npm installs the required packages...'}
          {codeApplicationState.stage === 'applying' &&
            'Writing files to your sandbox environment...'}
        </p>
      </div>
    </div>
  );
}

export default PreviewPane;
