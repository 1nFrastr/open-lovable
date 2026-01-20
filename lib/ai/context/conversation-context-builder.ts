import type { ConversationState, ConversationMessage } from '@/types/conversation';

/**
 * Conversation Context Builder Module
 * 
 * Manages conversation state and builds context summaries for AI prompts.
 * Analyzes user preferences and tracks project evolution.
 */

export interface UserPreferences {
  commonPatterns: string[];
  preferredEditStyle: 'targeted' | 'comprehensive';
}

/**
 * Initialize a new conversation state
 */
export function initConversationState(): ConversationState {
  return {
    conversationId: `conv-${Date.now()}`,
    startedAt: Date.now(),
    lastUpdated: Date.now(),
    context: {
      messages: [],
      edits: [],
      projectEvolution: { majorChanges: [] },
      userPreferences: {}
    }
  };
}

/**
 * Analyze user preferences from conversation history
 * 
 * @param messages - Array of conversation messages
 * @returns User preferences including common patterns and edit style
 */
export function analyzeUserPreferences(messages: ConversationMessage[]): UserPreferences {
  const userMessages = messages.filter(m => m.role === 'user');
  const patterns: string[] = [];
  
  // Count edit-related keywords
  let targetedEditCount = 0;
  let comprehensiveEditCount = 0;
  
  userMessages.forEach(msg => {
    const content = msg.content.toLowerCase();
    
    // Check for targeted edit patterns
    if (content.match(/\b(update|change|fix|modify|edit|remove|delete)\s+(\w+\s+)?(\w+)\b/)) {
      targetedEditCount++;
    }
    
    // Check for comprehensive edit patterns
    if (content.match(/\b(rebuild|recreate|redesign|overhaul|refactor)\b/)) {
      comprehensiveEditCount++;
    }
    
    // Extract common request patterns
    if (content.includes('hero')) patterns.push('hero section edits');
    if (content.includes('header')) patterns.push('header modifications');
    if (content.includes('color') || content.includes('style')) patterns.push('styling changes');
    if (content.includes('button')) patterns.push('button updates');
    if (content.includes('animation')) patterns.push('animation requests');
  });
  
  return {
    commonPatterns: [...new Set(patterns)].slice(0, 3), // Top 3 unique patterns
    preferredEditStyle: targetedEditCount > comprehensiveEditCount ? 'targeted' : 'comprehensive'
  };
}

/**
 * Build conversation context string for system prompt
 * 
 * @param state - Current conversation state
 * @returns Formatted context string for AI prompt
 */
export function buildConversationContext(state: ConversationState): string {
  if (!state || state.context.messages.length <= 1) {
    return '';
  }
  
  console.log('[buildConversationContext] Building conversation context');
  console.log('[buildConversationContext] Total messages:', state.context.messages.length);
  console.log('[buildConversationContext] Total edits:', state.context.edits.length);
  
  let context = '\n\n## Conversation History (Recent)\n';
  
  // Include only the last 3 edits to save context
  const recentEdits = state.context.edits.slice(-3);
  if (recentEdits.length > 0) {
    console.log('[buildConversationContext] Including', recentEdits.length, 'recent edits in context');
    context += '\n### Recent Edits:\n';
    recentEdits.forEach(edit => {
      context += `- "${edit.userRequest}" → ${edit.editType} (${edit.targetFiles.map(f => f.split('/').pop()).join(', ')})\n`;
    });
  }
  
  // Include recently created files - CRITICAL for preventing duplicates
  const recentMsgs = state.context.messages.slice(-5);
  const recentlyCreatedFiles: string[] = [];
  recentMsgs.forEach(msg => {
    if (msg.metadata?.editedFiles) {
      recentlyCreatedFiles.push(...msg.metadata.editedFiles);
    }
  });
  
  if (recentlyCreatedFiles.length > 0) {
    const uniqueFiles = [...new Set(recentlyCreatedFiles)];
    context += '\n### 🚨 RECENTLY CREATED/EDITED FILES (DO NOT RECREATE THESE):\n';
    uniqueFiles.forEach(file => {
      context += `- ${file}\n`;
    });
    context += '\nIf the user mentions any of these components, UPDATE the existing file!\n';
  }
  
  // Include only last 5 messages for context (reduced from 10)
  const recentMessages = recentMsgs;
  if (recentMessages.length > 2) { // More than just current message
    context += '\n### Recent Messages:\n';
    recentMessages.slice(0, -1).forEach(msg => { // Exclude current message
      if (msg.role === 'user') {
        const truncatedContent = msg.content.length > 100 
          ? msg.content.substring(0, 100) + '...' 
          : msg.content;
        context += `- "${truncatedContent}"\n`;
      }
    });
  }
  
  // Include only last 2 major changes
  const majorChanges = state.context.projectEvolution.majorChanges.slice(-2);
  if (majorChanges.length > 0) {
    context += '\n### Recent Changes:\n';
    majorChanges.forEach(change => {
      context += `- ${change.description}\n`;
    });
  }
  
  // Keep user preferences - they're concise
  const userPrefs = analyzeUserPreferences(state.context.messages);
  if (userPrefs.commonPatterns.length > 0) {
    context += '\n### User Preferences:\n';
    context += `- Edit style: ${userPrefs.preferredEditStyle}\n`;
  }
  
  // Limit total conversation context length
  if (context.length > 2000) {
    context = context.substring(0, 2000) + '\n[Context truncated to prevent length errors]';
  }
  
  return context;
}

/**
 * Clean up old messages to prevent unbounded growth
 * 
 * @param state - Conversation state to clean
 * @param maxMessages - Maximum number of messages to keep (default: 15)
 * @param maxEdits - Maximum number of edits to keep (default: 8)
 */
export function cleanupConversationState(
  state: ConversationState,
  maxMessages: number = 15,
  maxEdits: number = 8
): void {
  if (state.context.messages.length > 20) {
    // Keep only the last N messages
    state.context.messages = state.context.messages.slice(-maxMessages);
    console.log('[cleanupConversationState] Trimmed conversation history to prevent context overflow');
  }
  
  // Clean up old edits
  if (state.context.edits.length > 10) {
    state.context.edits = state.context.edits.slice(-maxEdits);
  }
}

/**
 * Add a user message to conversation state
 * 
 * @param state - Conversation state
 * @param content - Message content
 * @param metadata - Optional metadata (sandboxId, editedFiles, etc.)
 */
export function addUserMessage(
  state: ConversationState,
  content: string,
  metadata?: Record<string, any>
): void {
  const userMessage: ConversationMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: Date.now(),
    metadata: metadata || {}
  };
  
  state.context.messages.push(userMessage);
  state.lastUpdated = Date.now();
  
  // Auto-cleanup after adding message
  cleanupConversationState(state);
}

/**
 * Get message history for LLM in a format it can consume
 * 
 * @param state - Conversation state
 * @returns Array of messages in LLM format
 */
export function getMessageHistoryForLLM(
  state: ConversationState
): Array<{ role: string; content: string }> {
  if (!state || !state.context.messages) {
    return [];
  }

  // Only return last 5 messages (lightweight, avoid too many tokens)
  const recentMessages = state.context.messages.slice(-5);

  return recentMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Get all modified files from message history
 * 
 * @param state - Conversation state
 * @returns Array of file paths
 */
export function getAllModifiedFiles(state: ConversationState): string[] {
  if (!state || !state.context.messages) {
    return [];
  }

  const files = new Set<string>();

  state.context.messages.forEach((msg) => {
    if (msg.metadata?.editedFiles) {
      msg.metadata.editedFiles.forEach((f) => files.add(f));
    }
  });

  return Array.from(files);
}

/**
 * Record assistant's response message
 * 
 * @param state - Conversation state
 * @param content - Message content
 * @param editedFiles - List of files that were edited
 */
export function addAssistantMessage(
  state: ConversationState,
  content: string,
  editedFiles: string[]
): void {
  const message: ConversationMessage = {
    id: `msg-${Date.now()}-assistant`,
    role: 'assistant',
    content: content.substring(0, 500), // Limit length to avoid storing too much
    timestamp: Date.now(),
    metadata: {
      editedFiles,
    },
  };

  state.context.messages.push(message);
  state.lastUpdated = Date.now();

  // Auto-cleanup (keep last 5 messages)
  cleanupConversationState(state, 5);
  
  console.log('[addAssistantMessage] Recorded:', {
    filesCount: editedFiles.length,
    totalMessages: state.context.messages.length
  });
}
