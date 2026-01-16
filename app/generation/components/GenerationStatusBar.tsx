'use client';

import { ReactNode } from 'react';

interface SandboxData {
  sandboxId: string;
  url: string;
  [key: string]: any;
}

interface GenerationStatusBarProps {
  activeTab: 'generation' | 'preview' | 'terminal';
  onTabChange: (tab: 'generation' | 'preview' | 'terminal') => void;
  sandboxData: SandboxData | null;
  isGenerating: boolean;
  isEdit: boolean;
  filesCount: number;
}

/**
 * Status bar with tab switcher and status indicators
 */
export function GenerationStatusBar({
  activeTab,
  onTabChange,
  sandboxData,
  isGenerating,
  isEdit,
  filesCount
}: GenerationStatusBarProps) {
  return (
    <div className="px-3 pt-4 pb-4 bg-white border-b border-gray-200 flex justify-between items-center">
      <div className="flex items-center gap-2">
        {/* Toggle-style Code/View switcher */}
        <div className="inline-flex bg-gray-100 border border-gray-200 rounded-md p-0.5">
          <TabButton
            active={activeTab === 'generation'}
            onClick={() => onTabChange('generation')}
            icon={<CodeIcon />}
            label="Code"
          />
          <TabButton
            active={activeTab === 'preview'}
            onClick={() => onTabChange('preview')}
            icon={<PreviewIcon />}
            label="View"
          />
          <TabButton
            active={activeTab === 'terminal'}
            onClick={() => onTabChange('terminal')}
            icon={<TerminalIcon />}
            label="Terminal"
          />
        </div>
      </div>
      <div className="flex gap-2 items-center">
        {/* Files generated count */}
        {activeTab === 'generation' && !isEdit && filesCount > 0 && (
          <div className="text-gray-500 text-xs font-medium">
            {filesCount} files generated
          </div>
        )}
        
        {/* Live Code Generation Status */}
        {activeTab === 'generation' && isGenerating && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-md text-xs font-medium text-gray-700">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            {isEdit ? 'Editing code' : 'Live generation'}
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
  );
}

// Tab Button Component
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
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

// Icon Components
function CodeIcon() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function PreviewIcon() {
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
