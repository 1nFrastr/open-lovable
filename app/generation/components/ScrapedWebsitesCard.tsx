'use client';

import { useState } from 'react';

interface ScrapedWebsite {
  url: string;
  content: any;
  timestamp: Date;
}

interface ScrapedWebsitesCardProps {
  websites: ScrapedWebsite[];
}

/**
 * Card component displaying scraped website information
 * Shows favicon, title, and screenshot with collapse functionality
 */
export function ScrapedWebsitesCard({ websites }: ScrapedWebsitesCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (websites.length === 0) return null;

  return (
    <div className="p-4 bg-card border-b border-gray-200">
      <div className="flex flex-col gap-4">
        {websites.map((site, idx) => {
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
                      onClick={() => setCollapsed(!collapsed)}
                      className="text-gray-500 hover:text-gray-700 transition-colors p-1"
                      aria-label={collapsed ? 'Expand screenshot' : 'Collapse screenshot'}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
                      >
                        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  <div
                    className="w-full rounded-lg overflow-hidden border border-gray-200 transition-all duration-300"
                    style={{
                      opacity: collapsed ? 0 : 1,
                      transform: collapsed ? 'translateY(-20px)' : 'translateY(0)',
                      pointerEvents: collapsed ? 'none' : 'auto',
                      maxHeight: collapsed ? '0' : '200px'
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
  );
}
