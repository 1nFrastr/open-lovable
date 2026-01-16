'use client';

import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { CodeMirrorEditor } from '@/components/editor/codemirror/CodeMirrorEditor';
import type { EditorDocument } from '@/components/editor/codemirror/CodeMirrorEditor';
import { selectedFileAtom } from '../atoms/ui';
import { generationProgressAtom } from '../atoms/generation';

// Helper function to extract file path from streamed content
function extractFilePathFromStream(streamedCode: string): string | null {
  // Try to find the last <file path="..."> tag
  const matches = streamedCode.match(/<file\s+path=["']([^"']+)["']/g);
  if (matches && matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const pathMatch = lastMatch.match(/path=["']([^"']+)["']/);
    if (pathMatch) {
      return pathMatch[1];
    }
  }
  return null;
}

// Helper function to get file extension for syntax highlighting
function getFileExtension(filePath: string | null): string {
  if (!filePath) return '.tsx';
  const ext = filePath.split('.').pop()?.toLowerCase();
  return `.${ext || 'tsx'}`;
}

export function CodeEditorPanel() {
  const selectedFile = useAtomValue(selectedFileAtom);
  const generationProgress = useAtomValue(generationProgressAtom);

  // Get the selected file content
  const selectedFileData = useMemo(() => {
    if (!selectedFile) return null;
    return generationProgress.files.find((f) => f.path === selectedFile);
  }, [selectedFile, generationProgress.files]);

  // Create editor document
  const editorDocument: EditorDocument | null = useMemo(() => {
    if (!selectedFileData) return null;

    return {
      filePath: selectedFileData.path,
      value: selectedFileData.content,
    };
  }, [selectedFileData]);

  // Show streaming content if no file is selected but streaming
  const streamingContent = useMemo(() => {
    if (selectedFile || !generationProgress.isStreaming) return null;

    // Show current file being generated or last file
    if (generationProgress.currentFile) {
      return {
        filePath: generationProgress.currentFile.path,
        content: generationProgress.currentFile.content,
      };
    }

    // Or show the raw streamed code
    // Try to extract real file path from stream, otherwise use generic .tsx
    if (generationProgress.streamedCode) {
      const extractedPath = extractFilePathFromStream(generationProgress.streamedCode);
      const filePath = extractedPath || `streaming${getFileExtension(extractedPath)}`;
      
      return {
        filePath,
        content: generationProgress.streamedCode,
        isRawStream: !extractedPath, // Flag to show "Generated Code" label
      };
    }

    return null;
  }, [selectedFile, generationProgress]);

  // Show thinking state
  if (generationProgress.isThinking && generationProgress.thinkingText) {
    return (
      <div className="h-full flex flex-col bg-gray-900">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <span className="text-sm text-gray-300">AI Thinking...</span>
          {generationProgress.thinkingDuration && (
            <span className="text-xs text-gray-500">
              {(generationProgress.thinkingDuration / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <div className="flex-1 p-4 overflow-auto">
          <div className="text-gray-300 text-sm whitespace-pre-wrap font-mono">
            {generationProgress.thinkingText}
          </div>
        </div>
      </div>
    );
  }

  // Show selected file content
  if (editorDocument) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
          <span className="text-sm text-gray-700 font-medium">{selectedFileData?.path}</span>
          {selectedFileData?.edited && (
            <span className="text-xs text-orange-600 font-medium">Modified</span>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <CodeMirrorEditor doc={editorDocument} editable={false} />
        </div>
      </div>
    );
  }

  // Show streaming content
  if (streamingContent) {
    return <StreamingCodeView content={streamingContent} />;
  }

  // Empty state
  return (
    <div className="h-full flex items-center justify-center bg-gray-50 text-gray-500">
      <div className="text-center">
        <svg
          className="w-12 h-12 mx-auto mb-3 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
        <p className="text-sm">Select a file to view its contents</p>
      </div>
    </div>
  );
}

// Streaming code view component with syntax highlighting and auto-scroll
function StreamingCodeView({ 
  content 
}: { 
  content: { filePath: string; content: string; isRawStream?: boolean } 
}) {
  // Create editor document for streaming content
  // CodeMirrorEditor has built-in auto-scroll when editable=false
  const streamingDoc: EditorDocument = useMemo(() => ({
    filePath: content.filePath,
    value: content.content || '// Generating code...',
  }), [content.filePath, content.content]);

  // Get display name: use "Generated Code" for raw streams, otherwise show file name
  const displayName = content.isRawStream ? 'Generated Code' : content.filePath;

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-sm text-gray-300">
          {displayName}
        </span>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-xs text-gray-500">Generating...</span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <CodeMirrorEditor 
          doc={streamingDoc} 
          editable={false}
          theme="dark"
        />
        {/* Cursor indicator at the end */}
        <div className="absolute bottom-2 right-2 w-2 h-4 bg-green-400 animate-pulse" />
      </div>
    </div>
  );
}

export default CodeEditorPanel;
