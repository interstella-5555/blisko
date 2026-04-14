import { create } from "zustand";
import { showToast } from "@/lib/toast";
import { vanillaClient } from "@/lib/trpc";
import { uuidv4 } from "@/lib/uuid";
import { useConversationsStore } from "./conversationsStore";

// Shared mapper: raw tRPC/WS message → EnrichedMessage
// biome-ignore lint/suspicious/noExplicitAny: raw API response shape varies by endpoint
export function rawToEnriched(msg: Record<string, any>, convId: string): EnrichedMessage {
  return {
    id: msg.id as string,
    seq: (msg.seq as number) ?? null,
    conversationId: (msg.conversationId as string) ?? convId,
    senderId: msg.senderId as string,
    content: msg.content as string,
    type: (msg.type as string) ?? "text",
    metadata: (msg.metadata as Record<string, unknown> | null) ?? null,
    replyToId: (msg.replyToId as string | null) ?? null,
    topicId: (msg.topicId as string | null) ?? null,
    createdAt: String(msg.createdAt),
    readAt: msg.readAt ? String(msg.readAt) : null,
    deletedAt: msg.deletedAt ? String(msg.deletedAt) : null,
    replyTo: (msg.replyTo as EnrichedMessage["replyTo"]) ?? null,
    reactions: (msg.reactions as EnrichedMessage["reactions"]) ?? [],
    senderName: (msg.senderName as string | null) ?? null,
    senderAvatarUrl: (msg.senderAvatarUrl as string | null) ?? null,
  };
}

// Dedup set for in-flight gap fills
const pendingGapFills = new Set<string>();

export interface EnrichedMessage {
  id: string;
  seq: number | null;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  metadata: Record<string, unknown> | null;
  replyToId: string | null;
  topicId?: string | null;
  createdAt: string;
  readAt: string | null;
  deletedAt: string | null;
  replyTo: { id: string; content: string; senderName: string } | null;
  reactions: Array<{ emoji: string; count: number; myReaction: boolean }>;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
}

export interface ChatCache {
  items: EnrichedMessage[];
  oldestSeq: number | null;
  hasOlder: boolean;
  newestSeq: number | null;
  status: "partial" | "hydrated";
}

interface MessagesStore {
  chats: Map<string, ChatCache>;

  // Data loading
  set(convId: string, messages: EnrichedMessage[], hasOlder: boolean, oldestSeq?: number | null): void;
  appendOlder(convId: string, messages: EnrichedMessage[], hasOlder: boolean, oldestSeq?: number | null): void;
  prepend(convId: string, message: EnrichedMessage): void;
  prependBatch(convId: string, messages: EnrichedMessage[]): void;
  fetchMessages(convId: string, opts: { limit: number; cursor?: number | null }): Promise<void>;

  // Lifecycle-safe mutations
  send(
    convId: string,
    content: string,
    opts: {
      userId: string;
      replyToId?: string;
      replyTo?: EnrichedMessage["replyTo"];
      topicId?: string;
      type?: string;
      metadata?: Record<string, unknown>;
    },
  ): void;
  react(messageId: string, emoji: string): void;
  deleteMessage(convId: string, messageId: string): void;
  markAsRead(convId: string): void;

  // Gap detection
  fillGap(convId: string, fromSeq: number, toSeq: number): void;
  syncGaps(cursors: Record<string, number>): Promise<void>;

  // Optimistic helpers
  replaceOptimistic(convId: string, tempId: string, real: EnrichedMessage): void;
  removeOptimistic(convId: string, tempId: string): void;
  updateMessage(convId: string, messageId: string, patch: Partial<EnrichedMessage>): void;
  updateReaction(
    convId: string,
    messageId: string,
    emoji: string,
    userId: string,
    action: "added" | "removed",
    currentUserId: string,
  ): void;

  // Queries
  has(convId: string): boolean;
  get(convId: string): ChatCache | undefined;
  reset(): void;
}

export const useMessagesStore = create<MessagesStore>((set, get) => ({
  chats: new Map(),

  set(convId, messages, hasOlder, oldestSeq) {
    set((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);

      if (!existing) {
        // First load — no existing items to merge with
        chats.set(convId, {
          items: messages,
          hasOlder,
          oldestSeq: oldestSeq ?? null,
          newestSeq: messages[0]?.seq ?? null,
          status: "hydrated",
        });
      } else {
        // Merge: preserve WS-only items (newer seq or optimistic) not in server response.
        // Applies to partial→hydrated upgrade (preload/WS race) AND re-entry on hydrated.
        const serverIds = new Set(messages.map((m) => m.id));
        const newestServerSeq = messages[0]?.seq ?? 0;
        const wsOnly = existing.items.filter(
          (m) => !serverIds.has(m.id) && (m.seq === null || m.seq > newestServerSeq),
        );
        chats.set(convId, {
          items: [...wsOnly, ...messages],
          hasOlder,
          oldestSeq: oldestSeq ?? existing.oldestSeq,
          newestSeq: Math.max(existing.newestSeq ?? 0, newestServerSeq),
          status: "hydrated",
        });
      }
      return { chats };
    });
  },

  appendOlder(convId, messages, hasOlder, oldestSeq) {
    set((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) {
        chats.set(convId, {
          items: messages,
          hasOlder,
          oldestSeq: oldestSeq ?? null,
          newestSeq: messages[0]?.seq ?? null,
          status: "hydrated",
        });
      } else {
        const existingIds = new Set(existing.items.map((m) => m.id));
        const newMessages = messages.filter((m) => !existingIds.has(m.id));
        chats.set(convId, {
          ...existing,
          items: [...existing.items, ...newMessages],
          hasOlder,
          oldestSeq: oldestSeq ?? existing.oldestSeq,
        });
      }
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
          hasOlder: true,
          oldestSeq: message.seq,
          newestSeq: message.seq,
          status: "partial",
        });
      } else {
        // Dedup
        if (existing.items.some((m) => m.id === message.id)) return state;

        // Eager gap detection
        if (message.seq && existing.newestSeq && message.seq > existing.newestSeq + 1) {
          setTimeout(() => get().fillGap(convId, existing.newestSeq!, message.seq!), 0);
        }

        chats.set(convId, {
          ...existing,
          items: [message, ...existing.items],
          newestSeq: message.seq ? Math.max(message.seq, existing.newestSeq ?? 0) : existing.newestSeq,
        });
      }
      return { chats };
    });
  },

  prependBatch(convId, messages) {
    if (messages.length === 0) return;
    set((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) {
        chats.set(convId, {
          items: messages,
          hasOlder: true,
          oldestSeq: messages[messages.length - 1]?.seq ?? null,
          newestSeq: messages[0]?.seq ?? null,
          status: "partial",
        });
      } else {
        const existingIds = new Set(existing.items.map((m) => m.id));
        const newMsgs = messages.filter((m) => !existingIds.has(m.id));
        if (newMsgs.length === 0) return state;
        const maxSeq = Math.max(...newMsgs.filter((m) => m.seq != null).map((m) => m.seq!), existing.newestSeq ?? 0);
        chats.set(convId, {
          ...existing,
          items: [...newMsgs, ...existing.items],
          newestSeq: maxSeq,
        });
      }
      return { chats };
    });
  },

  async fetchMessages(convId, opts) {
    try {
      const res = await vanillaClient.messages.getMessages.query({
        conversationId: convId,
        limit: opts.limit,
        cursor: opts.cursor ?? undefined,
      });

      const messages = res.messages.map((msg) => rawToEnriched(msg as Record<string, unknown>, convId));

      const hasOlder = !!res.nextCursor;
      if (opts.cursor) {
        get().appendOlder(convId, messages, hasOlder, res.nextCursor);
      } else {
        get().set(convId, messages, hasOlder, res.nextCursor);
      }
    } catch {
      throw new Error("Failed to fetch messages");
    }
  },

  send(convId, content, opts) {
    const tempId = `temp-${Date.now()}`;
    const optimistic: EnrichedMessage = {
      id: tempId,
      seq: null,
      conversationId: convId,
      senderId: opts.userId,
      content,
      type: opts.type ?? "text",
      metadata: opts.metadata ?? null,
      replyToId: opts.replyToId ?? null,
      topicId: opts.topicId ?? null,
      createdAt: new Date().toISOString(),
      readAt: null,
      deletedAt: null,
      replyTo: opts.replyTo ?? null,
      reactions: [],
    };

    get().prepend(convId, optimistic);
    useConversationsStore.getState().updateLastMessage(convId, {
      id: tempId,
      content,
      senderId: opts.userId,
      createdAt: optimistic.createdAt,
      type: optimistic.type,
    });

    vanillaClient.messages.send
      .mutate({
        conversationId: convId,
        content,
        replyToId: opts.replyToId,
        topicId: opts.topicId,
        type: opts.type as "text" | "image" | "location" | undefined,
        metadata: opts.metadata,
        idempotencyKey: uuidv4(),
      })
      .then((data) => {
        if (!data) return;
        const raw = data as Record<string, unknown>;
        const enriched: EnrichedMessage = {
          id: raw.id as string,
          seq: (raw.seq as number) ?? null,
          conversationId: raw.conversationId as string,
          senderId: raw.senderId as string,
          content: raw.content as string,
          type: (raw.type as string) ?? "text",
          metadata: (raw.metadata as Record<string, unknown> | null) ?? null,
          replyToId: (raw.replyToId as string | null) ?? null,
          topicId: (raw.topicId as string | null) ?? null,
          createdAt:
            typeof raw.createdAt === "string" ? raw.createdAt : new Date(raw.createdAt as string).toISOString(),
          readAt: (raw.readAt as string | null) ?? null,
          deletedAt: (raw.deletedAt as string | null) ?? null,
          replyTo: opts.replyTo ?? null,
          reactions: [],
        };
        get().replaceOptimistic(convId, tempId, enriched);
      })
      .catch(() => {
        get().removeOptimistic(convId, tempId);
        showToast("error", "Nie udało się wysłać wiadomości");
      });
  },

  react(messageId, emoji) {
    vanillaClient.messages.react.mutate({ messageId, emoji }).catch(() => {
      showToast("error", "Nie udało się dodać reakcji");
    });
  },

  deleteMessage(convId, messageId) {
    // Optimistic: mark as deleted
    const store = get();
    const chat = store.chats.get(convId);
    const original = chat?.items.find((m) => m.id === messageId);
    store.updateMessage(convId, messageId, {
      deletedAt: new Date().toISOString(),
      content: "",
    });

    vanillaClient.messages.deleteMessage.mutate({ messageId }).catch(() => {
      // Restore on failure
      if (original) {
        get().updateMessage(convId, messageId, {
          deletedAt: null,
          content: original.content,
        });
      }
      showToast("error", "Nie udało się usunąć wiadomości");
    });
  },

  markAsRead(convId) {
    vanillaClient.messages.markAsRead.mutate({ conversationId: convId }).catch(() => {
      // Silent — non-critical
    });
  },

  fillGap(convId, fromSeq, toSeq) {
    const key = `${convId}:${fromSeq}:${toSeq}`;
    if (pendingGapFills.has(key)) return;
    pendingGapFills.add(key);

    vanillaClient.messages.getMessages
      .query({
        conversationId: convId,
        afterSeq: fromSeq,
        limit: Math.min(toSeq - fromSeq, 100),
      })
      .then((res) => {
        if (res.messages.length > 0) {
          get().prependBatch(
            convId,
            res.messages.map((msg) => rawToEnriched(msg as Record<string, unknown>, convId)),
          );
        }
      })
      .catch(() => {
        // Silent — gap will be resolved on next sync
      })
      .finally(() => {
        pendingGapFills.delete(key);
      });
  },

  async syncGaps(cursors) {
    try {
      const result = await vanillaClient.messages.syncGaps.query(cursors);
      for (const [convId, messages] of Object.entries(result)) {
        if (Array.isArray(messages) && messages.length > 0) {
          get().prependBatch(
            convId,
            messages.map((msg) => rawToEnriched(msg as Record<string, unknown>, convId)),
          );
        }
      }
    } catch {
      // Silent — next reconnect will retry
    }
  },

  replaceOptimistic(convId, tempId, real) {
    set((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) return state;

      const hasReal = existing.items.some((m) => m.id === real.id);
      const items = hasReal
        ? existing.items.filter((m) => m.id !== tempId)
        : existing.items.map((m) => (m.id === tempId ? real : m));

      const newNewest = real.seq != null ? Math.max(real.seq, existing.newestSeq ?? 0) : existing.newestSeq;

      chats.set(convId, { ...existing, items, newestSeq: newNewest });
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

  updateMessage(convId, messageId, patch) {
    set((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) return state;

      const items = existing.items.map((m) => (m.id === messageId ? { ...m, ...patch } : m));
      chats.set(convId, { ...existing, items });
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

        if (action === "added") {
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

  reset() {
    set({ chats: new Map() });
  },
}));
