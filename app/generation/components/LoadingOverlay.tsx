'use client';

import React from 'react';

interface LoadingOverlayProps {
  stage: 'gathering' | 'planning' | 'generating' | 'preparing' | null;
  isCapturingScreenshot?: boolean;
  isPreparingDesign?: boolean;
  isGenerating?: boolean;
}

export function LoadingOverlay({
  stage,
  isCapturingScreenshot,
  isPreparingDesign,
  isGenerating,
}: LoadingOverlayProps) {
  const getStatusText = () => {
    if (isCapturingScreenshot) return 'Analyzing website...';
    if (isPreparingDesign) return 'Preparing design...';
    if (isGenerating) return 'Generating code...';
    return 'Loading...';
  };

  const getHintText = () => {
    if (isCapturingScreenshot) return 'Taking a screenshot of the site';
    if (isPreparingDesign) return 'Understanding the layout and structure';
    if (isGenerating) return 'Writing React components';
    return 'Please wait...';
  };

  return (
    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="text-center max-w-md">
        {/* Animated skeleton lines */}
        <div className="mb-6 space-y-3">
          <div
            className="h-2 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded animate-pulse"
            style={{ animationDuration: '1.5s', animationDelay: '0s' }}
          />
          <div
            className="h-2 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded animate-pulse w-4/5 mx-auto"
            style={{ animationDuration: '1.5s', animationDelay: '0.2s' }}
          />
          <div
            className="h-2 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded animate-pulse w-3/5 mx-auto"
            style={{ animationDuration: '1.5s', animationDelay: '0.4s' }}
          />
        </div>

        {/* Status text */}
        <p className="text-white text-lg font-medium">{getStatusText()}</p>

        {/* Subtle progress hint */}
        <p className="text-white/60 text-sm mt-2">{getHintText()}</p>
      </div>
    </div>
  );
}

export default LoadingOverlay;
