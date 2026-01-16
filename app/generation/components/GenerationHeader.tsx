'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import HeaderBrandKit from '@/components/shared/header/BrandKit/BrandKit';

interface SandboxData {
  sandboxId: string;
  url: string;
  [key: string]: any;
}

interface GenerationHeaderProps {
  aiModel: string;
  setAiModel: (model: string) => void;
  sandboxData: SandboxData | null;
  hasLastGeneration: boolean;
  onCreateSandbox: () => void;
  onReapplyLastGeneration: () => void;
  onDownloadZip: () => void;
}

/**
 * Header component for the generation page
 * Contains model selector and action buttons
 */
export function GenerationHeader({
  aiModel,
  setAiModel,
  sandboxData,
  hasLastGeneration,
  onCreateSandbox,
  onReapplyLastGeneration,
  onDownloadZip
}: GenerationHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleModelChange = (newModel: string) => {
    setAiModel(newModel);
    const params = new URLSearchParams(searchParams);
    params.set('model', newModel);
    if (sandboxData?.sandboxId) {
      params.set('sandbox', sandboxData.sandboxId);
    }
    router.push(`/generation?${params.toString()}`);
  };

  return (
    <div className="bg-white py-[15px] py-[8px] border-b border-border-faint flex items-center justify-between shadow-sm">
      <HeaderBrandKit />
      <div className="flex items-center gap-2">
        {/* Model Selector */}
        <select
          value={aiModel}
          onChange={(e) => handleModelChange(e.target.value)}
          className="px-3 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 transition-colors"
        >
          {appConfig.ai.availableModels.map(model => (
            <option key={model} value={model}>
              {appConfig.ai.modelDisplayNames?.[model] || model}
            </option>
          ))}
        </select>

        {/* Create Sandbox Button */}
        <button 
          onClick={onCreateSandbox}
          className="p-8 rounded-lg transition-colors bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100"
          title="Create new sandbox"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* Reapply Last Generation Button */}
        <button 
          onClick={onReapplyLastGeneration}
          className="p-8 rounded-lg transition-colors bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Re-apply last generation"
          disabled={!hasLastGeneration || !sandboxData}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* Download ZIP Button */}
        <button 
          onClick={onDownloadZip}
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
  );
}
