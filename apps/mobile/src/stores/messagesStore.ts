import { create } from 'zustand';

export interface EnrichedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  metadata: Record<string, unknown> | null;
  replyToId: string | null;
  createdAt: string;
  readAt: string | null;
  deletedAt: string | null;
  replyTo: { id: string; content: string; senderName: string } | null;
  reactions: Array<{ emoji: string; count: number; myReaction: boolean }>;
}

export interface ChatCache {
  items: EnrichedMessage[]; // newest first (matches inverted FlatList)
  hasMore: boolean;
  oldestCursor: string | null;
}

interface MessagesStore {
  chats: Map<string, ChatCache>;

  set(
    convId: string,
    messages: EnrichedMessage[],
    hasMore: boolean,
    cursor?: string,
  ): void;
  prepend(convId: string, message: EnrichedMessage): void;
  appendOlder(
    convId: string,
    messages: EnrichedMessage[],
    hasMore: boolean,
    cursor?: string,
  ): void;
  updateReaction(
    convId: string,
    messageId: string,
    emoji: string,
    userId: string,
    action: 'added' | 'removed',
    currentUserId: string,
  ): void;
  has(convId: string): boolean;
  get(convId: string): ChatCache | undefined;

  reset(): void;

  // Optimistic
  addOptimistic(convId: string, message: EnrichedMessage): void;
  replaceOptimistic(
    convId: string,
    tempId: string,
    real: EnrichedMessage,
  ): void;
  removeOptimistic(convId: string, tempId: string): void;
}

export const useMessagesStore = create<MessagesStore>((set, get) => ({
  chats: new Map(),

  set(convId, messages, hasMore, cursor) {
    set((state) => {
      const chats = new Map(state.chats);
      chats.set(convId, {
        items: messages,
        hasMore,
        oldestCursor: cursor ?? null,
      });
      return { chats };
    });
  },

  prepend(convId, message) {
    set((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) {
        chats.set(convId, {
          items: [message],
          hasMore: false,
          oldestCursor: null,
        });
      } else {
        // Dedup by id
        if (existing.items.some((m) => m.id === message.id)) return state;
        chats.set(convId, {
          ...existing,
          items: [message, ...existing.items],
        });
      }
      return { chats };
    });
  },

  appendOlder(convId, messages, hasMore, cursor) {
    set((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) {
        chats.set(convId, {
          items: messages,
          hasMore,
          oldestCursor: cursor ?? null,
        });
      } else {
        // Dedup
        const existingIds = new Set(existing.items.map((m) => m.id));
        const newMessages = messages.filter((m) => !existingIds.has(m.id));
        chats.set(convId, {
          items: [...existing.items, ...newMessages],
          hasMore,
          oldestCursor: cursor ?? existing.oldestCursor,
        });
      }
      return { chats };
    });
  },

  updateReaction(convId, messageId, emoji, userId, action, currentUserId) {
    set((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) return state;

      const items = existing.items.map((m) => {
        if (m.id !== messageId) return m;

        const reactions = [...m.reactions];
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        const isMe = userId === currentUserId;

        if (action === 'added') {
          if (idx >= 0) {
            reactions[idx] = {
              ...reactions[idx],
              count: reactions[idx].count + 1,
              myReaction: isMe ? true : reactions[idx].myReaction,
            };
          } else {
            reactions.push({ emoji, count: 1, myReaction: isMe });
          }
        } else {
          if (idx >= 0) {
            const newCount = reactions[idx].count - 1;
            if (newCount <= 0) {
              reactions.splice(idx, 1);
            } else {
              reactions[idx] = {
                ...reactions[idx],
                count: newCount,
                myReaction: isMe ? false : reactions[idx].myReaction,
              };
            }
          }
        }

        return { ...m, reactions };
      });

      chats.set(convId, { ...existing, items });
      return { chats };
    });
  },

  has(convId) {
    return get().chats.has(convId);
  },

  get(convId) {
    return get().chats.get(convId);
  },

  addOptimistic(convId, message) {
    // Same as prepend — no dedup needed for optimistic (temp ids are unique)
    get().prepend(convId, message);
  },

  replaceOptimistic(convId, tempId, real) {
    set((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) return state;

      const items = existing.items.map((m) => (m.id === tempId ? real : m));
      chats.set(convId, { ...existing, items });
      return { chats };
    });
  },

  removeOptimistic(convId, tempId) {
    set((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) return state;

      const items = existing.items.filter((m) => m.id !== tempId);
      chats.set(convId, { ...existing, items });
      return { chats };
    });
  },

  reset() {
    set({ chats: new Map() });
  },
}));
