'use client';

import { ReactNode } from 'react';
import SidebarInput from '@/components/app/generation/SidebarInput';
import { ScrapedWebsitesCard } from './ScrapedWebsitesCard';

interface ScrapedWebsite {
  url: string;
  content: any;
  timestamp: Date;
}

interface GenerationSidebarProps {
  hasInitialSubmission: boolean;
  isDisabled: boolean;
  scrapedWebsites: ScrapedWebsite[];
  onSubmit: (url: string, style: string, model: string, instructions?: string) => void;
  children: ReactNode;
}

/**
 * Sidebar component containing input, scraped websites card, and chat
 */
export function GenerationSidebar({
  hasInitialSubmission,
  isDisabled,
  scrapedWebsites,
  onSubmit,
  children
}: GenerationSidebarProps) {
  return (
    <div className="flex-1 max-w-[400px] flex flex-col border-r border-border bg-background">
      {/* Sidebar Input Component */}
      {!hasInitialSubmission && (
        <div className="p-4 border-b border-border">
          <SidebarInput
            onSubmit={onSubmit}
            disabled={isDisabled}
          />
        </div>
      )}

      {/* Scraped Websites Card */}
      <ScrapedWebsitesCard websites={scrapedWebsites} />

      {/* Chat Panel (passed as children) */}
      {children}
    </div>
  );
}
