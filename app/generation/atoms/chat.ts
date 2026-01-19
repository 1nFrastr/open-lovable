import { atom } from 'jotai';

// Types
export interface ChatMessage {
  content: string;
  type: 'user' | 'ai' | 'system' | 'file-update' | 'command' | 'error';
  timestamp: Date;
  metadata?: {
    scrapedUrl?: string;
    scrapedContent?: any;
    generatedCode?: string;
    appliedFiles?: string[];
    commandType?: 'input' | 'output' | 'error' | 'success';
    brandingData?: any;
    sourceUrl?: string;
    // Tool calling metadata
    toolName?: string;
    toolCallId?: string;
    args?: any;
    result?: any;
    // Tool call streaming metadata
    isStarting?: boolean;
    path?: string;
    bytesWritten?: number;
    package?: string;
  };
}

export interface ConversationContext {
  scrapedWebsites: Array<{ url: string; content: any; timestamp: Date }>;
  generatedComponents: Array<{ name: string; path: string; content: string }>;
  appliedCode: Array<{ files: string[]; timestamp: Date }>;
  currentProject: string;
  lastGeneratedCode?: string;
}

// Chat state atoms
export const chatMessagesAtom = atom<ChatMessage[]>([]);
export const aiChatInputAtom = atom('');
export const aiEnabledAtom = atom(true);

// Conversation context for AI memory
export const conversationContextAtom = atom<ConversationContext>({
  scrapedWebsites: [],
  generatedComponents: [],
  appliedCode: [],
  currentProject: '',
  lastGeneratedCode: undefined,
});

// Derived atom to add a message
export const addChatMessageAtom = atom(
  null,
  (get, set, message: { content: string; type: ChatMessage['type']; metadata?: ChatMessage['metadata'] }) => {
    const currentMessages = get(chatMessagesAtom);
    set(chatMessagesAtom, [
      ...currentMessages,
      {
        ...message,
        timestamp: new Date(),
      },
    ]);
  }
);

// Clear chat messages
export const clearChatMessagesAtom = atom(null, (_get, set) => {
  set(chatMessagesAtom, []);
});
