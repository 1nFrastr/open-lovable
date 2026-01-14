/**
 * Template Project Utilities
 * 
 * Functions for downloading and processing template files from GitHub.
 */

import type { Template, TemplateFile } from '@/types/template';
import { STARTER_TEMPLATES, DEFAULT_TEMPLATE, getTemplateByName } from '@/config/templates';

/**
 * Files and directories to exclude from template downloads
 */
const EXCLUDED_PATTERNS = [
  '.git',
  '.git/',
  '.bolt',
  '.bolt/',
  'node_modules',
  'node_modules/',
  '.DS_Store',
];

/**
 * Lock files that should be included even if large
 */
const LOCK_FILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
];

/**
 * Maximum file size in bytes (100KB for non-lock files)
 */
const MAX_FILE_SIZE = 100 * 1024;

/**
 * Build the prompt for template selection
 */
export function buildTemplateSelectionPrompt(templates: Template[]): string {
  const templateList = templates
    .map(template => `
<template>
  <name>${template.name}</name>
  <description>${template.description}</description>
  ${template.tags ? `<tags>${template.tags.join(', ')}</tags>` : ''}
</template>`)
    .join('\n');

  return `You are an experienced developer who helps people choose the best starter template for their projects.

IMPORTANT RULES:
1. Vite-based templates are preferred for speed
2. Only choose nextjs if the user explicitly needs SSR or full-stack features
3. For simple scripts or trivial tasks, always choose "blank"
4. Match the user's requirements to the most appropriate template

Available templates:
${templateList}

Response Format (you MUST use this exact XML format):
<selection>
  <templateName>{selected template name}</templateName>
  <title>{a proper title for the project}</title>
</selection>

Examples:

<example>
User: I need to build a todo app
Response:
<selection>
  <templateName>react-vite</templateName>
  <title>Simple React Todo Application</title>
</selection>
</example>

<example>
User: Create a blog website
Response:
<selection>
  <templateName>astro</templateName>
  <title>Personal Blog</title>
</selection>
</example>

<example>
User: Write a script to generate numbers
Response:
<selection>
  <templateName>blank</templateName>
  <title>Number Generator Script</title>
</selection>
</example>

<example>
User: Build an e-commerce store with authentication
Response:
<selection>
  <templateName>nextjs</templateName>
  <title>E-Commerce Store</title>
</selection>
</example>

Instructions:
1. Analyze the user's request carefully
2. Consider what framework/tools best fit their needs
3. Respond with ONLY the selection XML tags
4. Do NOT include any additional text or explanation

CRITICAL: Respond immediately with your selection. Do not think out loud.`;
}

/**
 * Parse the template selection response from LLM
 */
export function parseTemplateSelection(llmResponse: string): { template: string; title: string } | null {
  try {
    const templateMatch = llmResponse.match(/<templateName>([\s\S]*?)<\/templateName>/);
    const titleMatch = llmResponse.match(/<title>([\s\S]*?)<\/title>/);

    if (!templateMatch) {
      console.error('[parseTemplateSelection] No templateName found in response');
      return null;
    }

    const templateName = templateMatch[1].trim();
    const title = titleMatch?.[1]?.trim() || 'Untitled Project';

    // Validate template exists
    const template = getTemplateByName(templateName);
    if (!template && templateName !== 'blank') {
      console.warn(`[parseTemplateSelection] Unknown template: ${templateName}, falling back to default`);
      return { template: DEFAULT_TEMPLATE, title };
    }

    return { template: templateName, title };
  } catch (error) {
    console.error('[parseTemplateSelection] Error parsing response:', error);
    return null;
  }
}

/**
 * Check if a file path should be excluded
 */
export function shouldExcludeFile(path: string): boolean {
  return EXCLUDED_PATTERNS.some(pattern => 
    path.startsWith(pattern) || path.includes(`/${pattern}`)
  );
}

/**
 * Check if a file is a lock file
 */
export function isLockFile(path: string): boolean {
  const fileName = path.split('/').pop() || '';
  return LOCK_FILES.includes(fileName);
}

/**
 * Format template files as Open Lovable file tags
 */
export function formatAsOpenLovable(files: TemplateFile[], projectTitle?: string): string {
  const fileBlocks = files
    .map(file => `<file path="${file.path}">\n${file.content}\n</file>`)
    .join('\n\n');

  const explanation = projectTitle
    ? `<explanation>Initializing project "${projectTitle}" with template files. The project structure is ready for development.</explanation>`
    : `<explanation>Initializing project with template files. The project structure is ready for development.</explanation>`;

  return `${explanation}\n\n${fileBlocks}`;
}

/**
 * Build user context message for AI after template import
 */
export function buildPostImportMessage(template: Template, title: string, userPrompt: string): string {
  return `Template "${template.label}" has been imported successfully.

Project: ${title}

The template files have been set up and are ready for development.

User's original request: "${userPrompt}"

Please continue with the user's request by:
1. Analyzing what modifications are needed to the template
2. Making the necessary changes to fulfill the user's request
3. DO NOT recreate files that already exist unless they need modification
4. Focus on implementing the user's specific requirements

IMPORTANT: Run \`npm install && npm run dev\` if not already running to start the development server.`;
}

/**
 * Get all templates suitable for UI display
 */
export function getUITemplates(): Template[] {
  return STARTER_TEMPLATES.filter(t => t.name !== 'blank');
}

/**
 * Get all templates suitable for AI selection
 */
export function getAITemplates(): Template[] {
  return STARTER_TEMPLATES;
}
