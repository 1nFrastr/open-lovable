import { useAtom } from 'jotai';
import {
  chatMessagesAtom,
  aiChatInputAtom,
  aiEnabledAtom,
  conversationContextAtom
} from '../atoms/chat';

/**
 * Hook for managing all chat-related state
 * Consolidates 4 chat atoms into a single hook
 */
export function useChatState() {
  const [chatMessages, setChatMessages] = useAtom(chatMessagesAtom);
  const [aiChatInput, setAiChatInput] = useAtom(aiChatInputAtom);
  const [aiEnabled] = useAtom(aiEnabledAtom);
  const [conversationContext, setConversationContext] = useAtom(conversationContextAtom);

  return {
    // Chat messages
    chatMessages,
    setChatMessages,
    
    // Chat input
    aiChatInput,
    setAiChatInput,
    
    // AI enabled
    aiEnabled,
    
    // Conversation context
    conversationContext,
    setConversationContext
  };
}
