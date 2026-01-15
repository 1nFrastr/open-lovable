// Global types for sandbox file management
import type { SandboxProvider } from '@/lib/sandbox/types';

export interface SandboxFile {
  content: string;
  lastModified: number;
}

export interface SandboxFileCache {
  files: Record<string, SandboxFile>;
  lastSync: number;
  sandboxId: string;
  manifest?: any; // FileManifest type from file-manifest.ts
}

export interface SandboxState {
  fileCache: SandboxFileCache | null;
  sandbox: any; // E2B sandbox instance
  sandboxData: {
    sandboxId: string;
    url: string;
  } | null;
}

// Declare global types
declare global {
  var activeSandboxProvider: SandboxProvider | null;
  var sandboxState: SandboxState;
  var existingFiles: Set<string>;
}

export {};