import { randomUUID } from "expo-crypto";
import { create } from "zustand";
import { showToast } from "@/lib/toast";
import { vanillaClient } from "@/lib/trpc";
import { useConversationsStore } from "./conversationsStore";

// Structural shape of messages as they arrive from the API or WebSocket.
// Required fields match the messages schema; optional fields reflect per-endpoint
// differences (getMessages enriches with replyTo/reactions/senderName, syncGaps
// returns raw rows, dates can be Date on WS events but strings after JSON).
export interface RawMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: string | Date;
  seq?: number | null;
  conversationId?: string;
  type?: string;
  metadata?: Record<string, unknown> | null;
  replyToId?: string | null;
  topicId?: string | null;
  readAt?: string | Date | null;
  deletedAt?: string | Date | null;
  replyTo?: EnrichedMessage["replyTo"];
  reactions?: EnrichedMessage["reactions"];
  senderName?: string | null;
  senderAvatarUrl?: string | null;
}

export function rawToEnriched(msg: RawMessage, convId: string): EnrichedMessage {
  return {
    id: msg.id,
    seq: msg.seq ?? null,
    conversationId: msg.conversationId ?? convId,
    senderId: msg.senderId,
    content: msg.content,
    type: msg.type ?? "text",
    metadata: msg.metadata ?? null,
    replyToId: msg.replyToId ?? null,
    topicId: msg.topicId ?? null,
    createdAt: typeof msg.createdAt === "string" ? msg.createdAt : msg.createdAt.toISOString(),
    readAt: msg.readAt ? (typeof msg.readAt === "string" ? msg.readAt : msg.readAt.toISOString()) : null,
    deletedAt: msg.deletedAt ? (typeof msg.deletedAt === "string" ? msg.deletedAt : msg.deletedAt.toISOString()) : null,
    replyTo: msg.replyTo ?? null,
    reactions: msg.reactions ?? [],
    senderName: msg.senderName ?? null,
    senderAvatarUrl: msg.senderAvatarUrl ?? null,
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
  hydrate(convId: string, messages: EnrichedMessage[], hasOlder: boolean, oldestSeq?: number | null): void;
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
  hasChat(convId: string): boolean;
  getChat(convId: string): ChatCache | undefined;
  reset(): void;
}

export const useMessagesStore = create<MessagesStore>((setState, getState) => ({
  chats: new Map(),

  hydrate(convId, messages, hasOlder, oldestSeq) {
    setState((state) => {
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
    setState((state) => {
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
    setState((state) => {
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
          setTimeout(() => getState().fillGap(convId, existing.newestSeq!, message.seq!), 0);
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
    setState((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);

      // Sort DESC with null seq (optimistic) at top — maintains store invariant
      // regardless of API order (syncGaps/fillGap return ASC, prepend ordering varies).
      const sortDescWithNullTop = (a: EnrichedMessage, b: EnrichedMessage): number => {
        const aSeq = a.seq ?? Number.POSITIVE_INFINITY;
        const bSeq = b.seq ?? Number.POSITIVE_INFINITY;
        return bSeq - aSeq;
      };

      if (!existing) {
        const sorted = [...messages].sort(sortDescWithNullTop);
        chats.set(convId, {
          items: sorted,
          hasOlder: true,
          oldestSeq: sorted[sorted.length - 1]?.seq ?? null,
          newestSeq: sorted[0]?.seq ?? null,
          status: "partial",
        });
      } else {
        const existingIds = new Set(existing.items.map((m) => m.id));
        const newMsgs = messages.filter((m) => !existingIds.has(m.id));
        if (newMsgs.length === 0) return state;
        const maxSeq = Math.max(...newMsgs.filter((m) => m.seq != null).map((m) => m.seq!), existing.newestSeq ?? 0);
        chats.set(convId, {
          ...existing,
          items: [...newMsgs, ...existing.items].sort(sortDescWithNullTop),
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

      const messages = res.messages.map((msg) => rawToEnriched(msg, convId));

      const hasOlder = !!res.nextCursor;
      if (opts.cursor) {
        getState().appendOlder(convId, messages, hasOlder, res.nextCursor);
      } else {
        getState().hydrate(convId, messages, hasOlder, res.nextCursor);
      }
    } catch {
      throw new Error("Failed to fetch messages");
    }
  },

  send(convId, content, opts) {
    // UUID (not Date.now) so two sends in the same millisecond get distinct IDs —
    // otherwise prepend()'s dedup-by-id collapses the second, but the server still
    // inserts both (different idempotencyKeys), leaving a ghost message on refetch.
    const tempId = `temp-${randomUUID()}`;
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

    getState().prepend(convId, optimistic);
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
        idempotencyKey: randomUUID(),
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
        getState().replaceOptimistic(convId, tempId, enriched);
      })
      .catch(() => {
        getState().removeOptimistic(convId, tempId);
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
    const store = getState();
    const chat = store.chats.get(convId);
    const original = chat?.items.find((m) => m.id === messageId);
    store.updateMessage(convId, messageId, {
      deletedAt: new Date().toISOString(),
      content: "",
    });

    vanillaClient.messages.deleteMessage.mutate({ messageId }).catch(() => {
      // Restore on failure
      if (original) {
        getState().updateMessage(convId, messageId, {
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
          getState().prependBatch(
            convId,
            res.messages.map((msg) => rawToEnriched(msg, convId)),
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
          getState().prependBatch(
            convId,
            messages.map((msg) => rawToEnriched(msg, convId)),
          );
        }
      }
    } catch {
      // Silent — next reconnect will retry
    }
  },

  replaceOptimistic(convId, tempId, real) {
    setState((state) => {
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
    setState((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) return state;

      const items = existing.items.filter((m) => m.id !== tempId);
      chats.set(convId, { ...existing, items });
      return { chats };
    });
  },

  updateMessage(convId, messageId, patch) {
    setState((state) => {
      const chats = new Map(state.chats);
      const existing = chats.get(convId);
      if (!existing) return state;

      const items = existing.items.map((m) => (m.id === messageId ? { ...m, ...patch } : m));
      chats.set(convId, { ...existing, items });
      return { chats };
    });
  },

  updateReaction(convId, messageId, emoji, userId, action, currentUserId) {
    setState((state) => {
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

  hasChat(convId) {
    return getState().chats.has(convId);
  },

  getChat(convId) {
    return getState().chats.get(convId);
  },

  reset() {
    setState({ chats: new Map() });
  },
}));
