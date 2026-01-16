'use client';

import React, { useRef, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { BrandingDisplay } from './BrandingDisplay';
import { chatMessagesAtom, type ChatMessage } from '../atoms/chat';

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
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat messages
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSendMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 scrollbar-hide"
        ref={chatMessagesRef}
      >
        {chatMessages.map((msg, idx) => (
          <ChatMessageItem key={idx} message={msg} />
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border">
        <div className="relative">
          <textarea
            value={aiChatInput}
            onChange={(e) => setAiChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build..."
            className="w-full px-4 py-3 pr-12 text-sm bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-gray-300 focus:ring-1 focus:ring-gray-300"
            rows={3}
            disabled={isGenerating || isLoading}
          />
          <button
            type="submit"
            disabled={!aiChatInput.trim() || isGenerating || isLoading}
            className="absolute bottom-3 right-3 p-2 bg-[#36322F] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#4a4541] transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}

function ChatMessageItem({ message }: { message: ChatMessage }) {
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
            <AppliedFilesList files={message.metadata.appliedFiles} />
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

function AppliedFilesList({ files }: { files: string[] }) {
  const displayFiles = files.slice(0, 5);
  const remainingCount = files.length - displayFiles.length;

  return (
    <div className="mt-2 text-xs text-gray-400">
      <div className="font-medium mb-1">Files applied:</div>
      <ul className="list-disc list-inside">
        {displayFiles.map((file, idx) => (
          <li key={idx} className="truncate">
            {file}
          </li>
        ))}
        {remainingCount > 0 && <li className="text-gray-500">...and {remainingCount} more</li>}
      </ul>
    </div>
  );
}

export default ChatPanel;
