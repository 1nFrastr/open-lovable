/**
 * Template type definitions for Open Lovable
 * 
 * Templates are starter projects that can be downloaded from GitHub
 * and used as a base for AI-assisted development.
 */

export interface Template {
  /** Unique identifier for the template (e.g., 'react-vite') */
  name: string;
  
  /** Display name for the template (e.g., 'React + Vite') */
  label: string;
  
  /** Detailed description for AI matching and user display */
  description: string;
  
  /** GitHub repository in 'owner/repo' format */
  githubRepo: string;
  
  /** Optional tags for categorization and AI matching */
  tags?: string[];
  
  /** Optional emoji icon for display */
  icon?: string;
}

export interface TemplateFile {
  /** File name (e.g., 'App.tsx') */
  name: string;
  
  /** Full file path (e.g., 'src/App.tsx') */
  path: string;
  
  /** File content */
  content: string;
}

export interface DetectIntentRequest {
  /** User's project description message */
  message: string;
  
  /** Optional AI model to use */
  model?: string;
}

export interface DetectIntentResponse {
  /** Selected template name */
  template: string;
  
  /** Suggested project title */
  title: string;
  
  /** Optional error message */
  error?: string;
}

export interface DownloadTemplateResponse {
  /** Array of template files */
  files: TemplateFile[];
  
  /** Optional error message */
  error?: string;
}

/**
 * Format template files as Open Lovable file tags
 * This is the format expected by /api/apply-ai-code
 */
export function formatFilesAsOpenLovable(files: TemplateFile[], projectTitle?: string): string {
  const fileBlocks = files
    .map(file => `<file path="${file.path}">\n${file.content}\n</file>`)
    .join('\n\n');
  
  const explanation = projectTitle 
    ? `<explanation>Initializing project "${projectTitle}" with template files.</explanation>`
    : `<explanation>Initializing project with template files.</explanation>`;
  
  return `${explanation}\n\n${fileBlocks}`;
}
