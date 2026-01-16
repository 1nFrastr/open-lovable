import { atom } from 'jotai';

// Tab state
export type ActiveTab = 'generation' | 'preview' | 'terminal';
export const activeTabAtom = atom<ActiveTab>('preview');

// Home screen state
export const showHomeScreenAtom = atom(true);
export const homeScreenFadingAtom = atom(false);

// Home screen inputs
export const homeUrlInputAtom = atom('');
export const homeContextInputAtom = atom('');

// URL overlay state
export const urlOverlayVisibleAtom = atom(false);
export const urlInputAtom = atom('');
export const urlStatusAtom = atom<string[]>([]);

// File tree state
export const selectedFileAtom = atom<string | null>(null);
export const expandedFoldersAtom = atom<Set<string>>(new Set(['app', 'src', 'src/components']));

// Sidebar state
export const sidebarScrolledAtom = atom(false);

// Style selector
export const showStyleSelectorAtom = atom(false);
export const selectedStyleAtom = atom<string | null>(null);

// Prompt input (for code display)
export const promptInputAtom = atom('');

// AI Model selection
export const aiModelAtom = atom<string>('');

// Toggle expanded folder
export const toggleExpandedFolderAtom = atom(
  null,
  (get, set, folderPath: string) => {
    const expanded = get(expandedFoldersAtom);
    const newExpanded = new Set(expanded);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    set(expandedFoldersAtom, newExpanded);
  }
);
