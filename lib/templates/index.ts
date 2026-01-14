/**
 * Pre-bundled Templates & Caching
 * 
 * Two-tier template system:
 * 1. Bundled templates - hardcoded in codebase, no network needed (fastest)
 * 2. Cached templates - downloaded from GitHub and cached for 24h
 * 
 * This approach avoids GitHub API rate limiting while keeping templates up-to-date.
 */

import { reactViteTemplate } from './react-vite';

// Re-export cache for easy access
export { templateCache } from './cache';

export interface BundledTemplateFile {
  path: string;
  content: string;
}

export interface BundledTemplate {
  name: string;
  label: string;
  description: string;
  /** Template-specific instructions for AI (like .bolt/prompt in bolt.diy) */
  prompt?: string;
  files: BundledTemplateFile[];
}

/**
 * All pre-bundled templates
 */
export const BUNDLED_TEMPLATES: Record<string, BundledTemplate> = {
  'react-vite': reactViteTemplate,
};

/**
 * Get a pre-bundled template by name
 */
export function getBundledTemplate(name: string): BundledTemplate | null {
  return BUNDLED_TEMPLATES[name] || null;
}

/**
 * Check if a template is available as a bundled version
 */
export function hasBundledTemplate(name: string): boolean {
  return name in BUNDLED_TEMPLATES;
}

/**
 * Get all available bundled template names
 */
export function getBundledTemplateNames(): string[] {
  return Object.keys(BUNDLED_TEMPLATES);
}
