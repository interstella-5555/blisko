import { create } from 'zustand';
import type { Message, Conversation } from '@meet/shared';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Map<string, Message[]>;
  typingUsers: Map<string, string[]>; // conversationId -> userIds
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  setTypingUsers: (conversationId: string, userIds: string[]) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: new Map(),
  typingUsers: new Map(),

  setConversations: (conversations) => set({ conversations }),

  setActiveConversation: (activeConversationId) =>
    set({ activeConversationId }),

  addMessage: (conversationId, message) =>
    set((state) => {
      const newMessages = new Map(state.messages);
      const existing = newMessages.get(conversationId) || [];
      newMessages.set(conversationId, [...existing, message]);
      return { messages: newMessages };
    }),

  setMessages: (conversationId, messages) =>
    set((state) => {
      const newMessages = new Map(state.messages);
      newMessages.set(conversationId, messages);
      return { messages: newMessages };
    }),

  setTypingUsers: (conversationId, userIds) =>
    set((state) => {
      const newTypingUsers = new Map(state.typingUsers);
      newTypingUsers.set(conversationId, userIds);
      return { typingUsers: newTypingUsers };
    }),
}));
