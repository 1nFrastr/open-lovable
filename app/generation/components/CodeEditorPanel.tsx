'use client';

import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { CodeMirrorEditor } from '@/components/editor/codemirror/CodeMirrorEditor';
import type { EditorDocument } from '@/components/editor/codemirror/CodeMirrorEditor';
import { selectedFileAtom } from '../atoms/ui';
import { generationProgressAtom } from '../atoms/generation';

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
    if (generationProgress.streamedCode) {
      return {
        filePath: 'Generated Code',
        content: generationProgress.streamedCode,
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
    return (
      <div className="h-full flex flex-col bg-gray-900">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <span className="text-sm text-gray-300">{streamingContent.filePath}</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-gray-500">Generating...</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
            {streamingContent.content}
          </pre>
        </div>
      </div>
    );
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

export default CodeEditorPanel;
