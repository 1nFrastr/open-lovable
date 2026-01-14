/**
 * Template Configuration
 * 
 * This file contains the list of available starter templates for Open Lovable.
 * Templates are GitHub repositories that serve as starting points for new projects.
 */

import type { Template } from '@/types/template';

/**
 * Available starter templates
 * 
 * Note: These use the same template repositories as bolt.diy where applicable.
 * Some templates may use different repos based on Open Lovable's requirements.
 */
export const STARTER_TEMPLATES: Template[] = [
  {
    name: 'react-vite',
    label: 'React + Vite',
    description: 'React starter template powered by Vite for fast development experience. Includes TypeScript, Tailwind CSS, and modern React 18 features.',
    githubRepo: 'xKevIsDev/bolt-vite-react-ts-template',
    tags: ['react', 'vite', 'typescript', 'tailwind', 'frontend', 'website', 'app', 'spa'],
    icon: '⚛️',
  },
  {
    name: 'nextjs',
    label: 'Next.js App Router',
    description: 'Next.js starter template with App Router for building full-stack React applications. Includes TypeScript and Tailwind CSS.',
    githubRepo: 'xKevIsDev/bolt-nextjs-shadcn-template',
    tags: ['nextjs', 'react', 'typescript', 'fullstack', 'ssr', 'app-router', 'tailwind'],
    icon: '▲',
  },
  {
    name: 'vue',
    label: 'Vue.js 3',
    description: 'Vue.js 3 starter template with modern tooling and Composition API. Includes TypeScript and Vite.',
    githubRepo: 'xKevIsDev/bolt-vue-template',
    tags: ['vue', 'vue3', 'typescript', 'vite', 'frontend', 'composition-api'],
    icon: '💚',
  },
  {
    name: 'astro',
    label: 'Astro',
    description: 'Lightweight Astro starter template for building fast static websites and blogs. Great for content-focused sites with optimal performance.',
    githubRepo: 'xKevIsDev/bolt-astro-basic-template',
    tags: ['astro', 'static', 'blog', 'performance', 'ssg', 'content'],
    icon: '🚀',
  },
  {
    name: 'remix',
    label: 'Remix',
    description: 'Remix framework starter with TypeScript for full-stack web applications. Features server-side rendering and progressive enhancement.',
    githubRepo: 'xKevIsDev/bolt-remix-ts-template',
    tags: ['remix', 'typescript', 'fullstack', 'react', 'ssr'],
    icon: '💿',
  },
  {
    name: 'svelte',
    label: 'SvelteKit',
    description: 'SvelteKit starter template for building fast, efficient web applications with Svelte.',
    githubRepo: 'bolt-sveltekit-template',
    tags: ['svelte', 'sveltekit', 'typescript', 'frontend'],
    icon: '🔥',
  },
  {
    name: 'vanilla-vite',
    label: 'Vanilla + Vite',
    description: 'Minimal Vite starter template for vanilla JavaScript projects. Lightweight and fast with no framework overhead.',
    githubRepo: 'xKevIsDev/vanilla-vite-template',
    tags: ['vite', 'vanilla', 'javascript', 'minimal', 'lightweight'],
    icon: '📦',
  },
  {
    name: 'blank',
    label: 'Blank Project',
    description: 'Empty starter for simple scripts and trivial tasks that don\'t require a full template setup. Best for quick experiments or minimal projects.',
    githubRepo: '',
    tags: ['blank', 'empty', 'script', 'minimal', 'basic'],
    icon: '📄',
  },
];

/**
 * Default template to use when AI cannot determine intent
 */
export const DEFAULT_TEMPLATE = 'react-vite';

/**
 * Get template by name
 */
export function getTemplateByName(name: string): Template | undefined {
  return STARTER_TEMPLATES.find(t => t.name === name);
}

/**
 * Get templates filtered by tags
 */
export function getTemplatesByTags(tags: string[]): Template[] {
  return STARTER_TEMPLATES.filter(template => 
    template.tags?.some(tag => tags.includes(tag))
  );
}

/**
 * Templates to display in the UI (excluding blank)
 */
export const UI_TEMPLATES = STARTER_TEMPLATES.filter(t => t.name !== 'blank');

/**
 * Templates available for AI selection (all templates)
 */
export const AI_TEMPLATES = STARTER_TEMPLATES;
