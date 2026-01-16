/**
 * Style patterns used for filtering context
 * These patterns are used to detect and filter out default style names
 */
export const STYLE_PATTERNS = [
  'Glassmorphism style design',
  'Neumorphism style design',
  'Brutalism style design',
  'Minimalist style design',
  'Dark Mode style design',
  'Gradient Rich style design',
  '3D Depth style design',
  'Retro Wave style design',
  'Modern clean and minimalist style design',
  'Fun colorful and playful style design',
  'Corporate professional and sleek style design',
  'Creative artistic and unique style design'
];

/**
 * File type mapping for CodeMirror editor
 */
export const FILE_TYPE_MAP: Record<string, string> = {
  jsx: 'javascript',
  js: 'javascript',
  tsx: 'javascript',
  ts: 'javascript',
  css: 'css',
  json: 'json',
  html: 'html',
  md: 'markdown',
  txt: 'text'
};

/**
 * Get file type for CodeMirror based on extension
 */
export function getFileType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return FILE_TYPE_MAP[ext] || 'text';
}

/**
 * Get component type based on file extension
 */
export function getComponentType(path: string): 'component' | 'style' | 'config' | 'utility' {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  
  if (['tsx', 'jsx'].includes(ext)) return 'component';
  if (ext === 'css') return 'style';
  if (ext === 'json') return 'config';
  return 'utility';
}
