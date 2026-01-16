import { atom } from 'jotai';
import type { CodeApplicationState } from '@/components/CodeApplicationProgress';

// Types
export interface GenerationFile {
  path: string;
  content: string;
  type: string;
  completed: boolean;
  edited?: boolean;
}

export interface GenerationProgress {
  isGenerating: boolean;
  status: string;
  components: Array<{ name: string; path: string; completed: boolean }>;
  currentComponent: number;
  streamedCode: string;
  isStreaming: boolean;
  isThinking: boolean;
  thinkingText?: string;
  thinkingDuration?: number;
  currentFile?: { path: string; content: string; type: string };
  files: GenerationFile[];
  lastProcessedPosition: number;
  isEdit?: boolean;
}

export interface ScrapeData {
  success: boolean;
  content?: string;
  url?: string;
  title?: string;
  source?: string;
  screenshot?: string;
  structured?: any;
  metadata?: any;
  message?: string;
  error?: string;
}

// Generation progress atom
export const generationProgressAtom = atom<GenerationProgress>({
  isGenerating: false,
  status: '',
  components: [],
  currentComponent: 0,
  streamedCode: '',
  isStreaming: false,
  isThinking: false,
  files: [],
  lastProcessedPosition: 0,
});

// Code application state (for progress overlay)
export const codeApplicationStateAtom = atom<CodeApplicationState>({
  stage: null,
});

// Screenshot state for URL cloning
export const urlScreenshotAtom = atom<string | null>(null);
export const isScreenshotLoadedAtom = atom(false);
export const isCapturingScreenshotAtom = atom(false);
export const screenshotErrorAtom = atom<string | null>(null);
export const screenshotCollapsedAtom = atom(false);

// Design preparation state
export const isPreparingDesignAtom = atom(false);
export const targetUrlAtom = atom<string>('');

// Loading stages
export const loadingStageAtom = atom<'gathering' | 'planning' | 'generating' | null>(null);
export const isStartingNewGenerationAtom = atom(false);
export const showLoadingBackgroundAtom = atom(false);

// Auto-generation triggers
export const shouldAutoGenerateAtom = atom(false);
export const pendingAutoSendMessageAtom = atom<string | null>(null);
export const hasInitialSubmissionAtom = atom(false);

// Reset generation progress
export const resetGenerationProgressAtom = atom(null, (_get, set) => {
  set(generationProgressAtom, {
    isGenerating: false,
    status: '',
    components: [],
    currentComponent: 0,
    streamedCode: '',
    isStreaming: false,
    isThinking: false,
    files: [],
    lastProcessedPosition: 0,
  });
});
