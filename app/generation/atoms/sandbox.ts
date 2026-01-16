import { atom } from 'jotai';

// Types
export interface SandboxData {
  sandboxId: string;
  url: string;
  template?: string;
  templateSource?: 'bundled' | 'github' | 'fallback' | 'e2b-template';
  skipTemplateSetup?: boolean;
  [key: string]: any;
}

// Sandbox state atoms
export const sandboxDataAtom = atom<SandboxData | null>(null);
export const sandboxFilesAtom = atom<Record<string, string>>({});
export const sandboxLoadingAtom = atom(false);

// Sandbox status
export const sandboxStatusAtom = atom({ text: 'Not connected', active: false });

// File structure display
export const fileStructureAtom = atom<string>('');
export const structureContentAtom = atom('No sandbox created yet');

// Response area for logging
export const responseAreaAtom = atom<string[]>([]);
