'use client';

import React, { useRef, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import HeroInput from '@/components/HeroInput';
import CodeApplicationProgress from '@/components/CodeApplicationProgress';
import { BrandingDisplay } from './BrandingDisplay';
import { chatMessagesAtom, type ChatMessage } from '../atoms/chat';
import { generationProgressAtom, codeApplicationStateAtom } from '../atoms/generation';
import { CodeMirrorEditor } from '@/components/editor/codemirror/CodeMirrorEditor';
import { motion } from 'framer-motion';

interface ChatPanelProps {
  onSendMessage: (message?: string) => void;
  aiChatInput: string;
  setAiChatInput: (value: string) => void;
  isGenerating: boolean;
  isLoading: boolean;
}

export function ChatPanel({
  onSendMessage,
  aiChatInput,
  setAiChatInput,
  isGenerating,
  isLoading,
}: ChatPanelProps) {
  const chatMessages = useAtomValue(chatMessagesAtom);
  const generationProgress = useAtomValue(generationProgressAtom);
  const codeApplicationState = useAtomValue(codeApplicationStateAtom);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat messages
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 scrollbar-hide"
        ref={chatMessagesRef}
      >
        {chatMessages.map((msg, idx) => {
          // Check if this message is from a successful generation
          const isGenerationComplete =
            msg.content.includes('Successfully recreated') ||
            msg.content.includes('AI recreation generated!') ||
            msg.content.includes('Code generated!');

          return (
            <ChatMessageItem
              key={idx}
              message={msg}
              isGenerationComplete={isGenerationComplete}
              isLastMessage={idx === chatMessages.length - 1}
              generationFiles={generationProgress.files}
              hasAppliedFilesInChat={chatMessages.some((m) => m.metadata?.appliedFiles)}
            />
          );
        })}

        {/* Code application progress */}
        {codeApplicationState.stage && (
          <CodeApplicationProgress state={codeApplicationState} />
        )}

        {/* File generation progress - inline display (during generation) */}
        {generationProgress.isGenerating && (
          <FileGenerationProgress
            status={generationProgress.status}
            files={generationProgress.files}
            currentFile={generationProgress.currentFile}
            streamedCode={generationProgress.streamedCode}
          />
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-background-base">
        <HeroInput
          value={aiChatInput}
          onChange={setAiChatInput}
          onSubmit={onSendMessage}
          placeholder="Describe what you want to build..."
          showSearchFeatures={false}
        />
      </div>
    </div>
  );
}

interface ChatMessageItemProps {
  message: ChatMessage;
  isGenerationComplete: boolean;
  isLastMessage: boolean;
  generationFiles: Array<{ path: string; type: string }>;
  hasAppliedFilesInChat: boolean;
}

function ChatMessageItem({
  message,
  isGenerationComplete,
  isLastMessage,
  generationFiles,
  hasAppliedFilesInChat,
}: ChatMessageItemProps) {
  return (
    <div className="block">
      <div className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className="block">
          <div
            className={`block rounded-[10px] px-14 py-8 ${
              message.type === 'user'
                ? 'bg-[#36322F] text-white ml-auto max-w-[80%]'
                : message.type === 'ai'
                ? 'bg-gray-100 text-gray-900 mr-auto max-w-[80%]'
                : message.type === 'system'
                ? 'bg-[#36322F] text-white text-sm'
                : message.type === 'command'
                ? 'bg-[#36322F] text-white font-mono text-sm'
                : message.type === 'error'
                ? 'bg-red-900 text-red-100 text-sm border border-red-700'
                : 'bg-[#36322F] text-white text-sm'
            }`}
          >
            {message.type === 'command' ? (
              <CommandMessage message={message} />
            ) : message.type === 'error' ? (
              <ErrorMessage message={message} />
            ) : (
              <span className="text-sm">{message.content}</span>
            )}
          </div>

          {/* Show branding data if this is a brand extraction message */}
          {message.metadata?.brandingData && message.metadata?.sourceUrl && (
            <BrandingDisplay
              brandingData={message.metadata.brandingData}
              sourceUrl={message.metadata.sourceUrl}
            />
          )}

          {/* Show applied files if this is an apply success message */}
          {message.metadata?.appliedFiles && message.metadata.appliedFiles.length > 0 && (
            <AppliedFilesList
              files={message.metadata.appliedFiles}
              title={message.content.includes('Applied') ? 'Files Updated:' : 'Generated Files:'}
            />
          )}

          {/* Show generated files for completion messages - but only if no appliedFiles already shown */}
          {isGenerationComplete &&
            generationFiles.length > 0 &&
            isLastMessage &&
            !message.metadata?.appliedFiles &&
            !hasAppliedFilesInChat && (
              <div className="mt-2 inline-block bg-gray-100 rounded-[10px] p-3">
                <div className="text-xs font-medium mb-1 text-gray-700">Generated Files:</div>
                <div className="flex flex-wrap items-start gap-1">
                  {generationFiles.map((file, fileIdx) => (
                    <div
                      key={`complete-${fileIdx}`}
                      className="inline-flex items-center gap-1.5 px-6 py-1.5 bg-[#36322F] text-white rounded-[10px] text-xs animate-fade-in-up"
                      style={{ animationDelay: `${fileIdx * 30}ms` }}
                    >
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          file.type === 'css'
                            ? 'bg-blue-400'
                            : file.type === 'javascript'
                            ? 'bg-yellow-400'
                            : file.type === 'json'
                            ? 'bg-green-400'
                            : 'bg-gray-400'
                        }`}
                      />
                      {file.path.split('/').pop()}
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function CommandMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`text-xs ${
          message.metadata?.commandType === 'input'
            ? 'text-blue-400'
            : message.metadata?.commandType === 'error'
            ? 'text-red-400'
            : message.metadata?.commandType === 'success'
            ? 'text-green-400'
            : 'text-gray-400'
        }`}
      >
        {message.metadata?.commandType === 'input' ? '$' : '>'}
      </span>
      <span className="flex-1 whitespace-pre-wrap text-white">{message.content}</span>
    </div>
  );
}

function ErrorMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 bg-red-800 rounded-full flex items-center justify-center">
          <svg
            className="w-6 h-6 text-red-200"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
      </div>
      <div className="flex-1">
        <div className="font-semibold mb-1">Build Errors Detected</div>
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        <div className="mt-2 text-xs opacity-70">
          Press &apos;F&apos; or click the Fix button above to resolve
        </div>
      </div>
    </div>
  );
}

function AppliedFilesList({ files, title }: { files: string[]; title: string }) {
  return (
    <div className="mt-3 inline-block bg-gray-100 rounded-[10px] p-5">
      <div className="text-sm font-medium mb-3 text-gray-700">{title}</div>
      <div className="flex flex-wrap items-start gap-2">
        {files.map((filePath, fileIdx) => {
          const fileName = filePath.split('/').pop() || filePath;
          const fileExt = fileName.split('.').pop() || '';
          const fileType =
            fileExt === 'jsx' || fileExt === 'js'
              ? 'javascript'
              : fileExt === 'css'
              ? 'css'
              : fileExt === 'json'
              ? 'json'
              : 'text';

          return (
            <div
              key={`applied-${fileIdx}`}
              className="inline-flex items-center gap-1.5 px-6 py-1.5 bg-[#36322F] text-white rounded-[10px] text-sm animate-fade-in-up"
              style={{ animationDelay: `${fileIdx * 30}ms` }}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  fileType === 'css'
                    ? 'bg-blue-400'
                    : fileType === 'javascript'
                    ? 'bg-yellow-400'
                    : fileType === 'json'
                    ? 'bg-green-400'
                    : 'bg-gray-400'
                }`}
              />
              {fileName}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FileGenerationProgress({
  status,
  files,
  currentFile,
  streamedCode,
}: {
  status: string;
  files: Array<{ path: string; type: string }>;
  currentFile?: { path: string; type: string };
  streamedCode?: string;
}) {
  return (
    <div className="inline-block bg-gray-100 rounded-lg p-3">
      <div className="text-sm font-medium mb-2 text-gray-700">{status}</div>
      <div className="flex flex-wrap items-start gap-1">
        {/* Show completed files */}
        {files.map((file, idx) => (
          <div
            key={`file-${idx}`}
            className="inline-flex items-center gap-1.5 px-6 py-1.5 bg-[#36322F] text-white rounded-[10px] text-xs animate-fade-in-up"
            style={{ animationDelay: `${idx * 30}ms` }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
            {file.path.split('/').pop()}
          </div>
        ))}

        {/* Show current file being generated */}
        {currentFile && (
          <div
            className="flex items-center gap-1 px-2 py-1 bg-[#36322F]/70 text-white rounded-[10px] text-sm animate-pulse"
            style={{ animationDelay: `${files.length * 30}ms` }}
          >
            <div className="w-16 h-16 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {currentFile.path.split('/').pop()}
          </div>
        )}
      </div>

      {/* Live streaming response display */}
      {streamedCode && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-3 border-t border-gray-300 pt-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-gray-600">AI Response Stream</span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-gray-300 to-transparent" />
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded h-32 relative">
            <CodeMirrorEditor
              theme="dark"
              editable={false}
              doc={{
                value: (() => {
                  const lastContent = streamedCode.slice(-1000);
                  // Show the last part of the stream, starting from a complete tag if possible
                  const startIndex = lastContent.indexOf('<');
                  return startIndex !== -1 ? lastContent.slice(startIndex) : lastContent;
                })(),
                filePath: 'progress.jsx',
              }}
              settings={{
                fontSize: '11px',
                tabSize: 2,
              }}
            />
            <span className="absolute bottom-3 right-3 w-3 h-4 bg-orange-400 animate-pulse" />
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default ChatPanel;
