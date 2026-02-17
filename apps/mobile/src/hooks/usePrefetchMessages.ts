import { useCallback, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { useMessagesStore, type EnrichedMessage } from '../stores/messagesStore';

export function usePrefetchMessages() {
  const utils = trpc.useUtils();
  // Track in-flight fetches to avoid duplicates
  const inflightRef = useRef(new Set<string>());

  const prefetch = useCallback(
    (conversationId: string) => {
      if (useMessagesStore.getState().has(conversationId)) return;
      if (inflightRef.current.has(conversationId)) return;
      inflightRef.current.add(conversationId);

      utils.messages.getMessages
        .fetch({ conversationId, limit: 50 })
        .then((data) => {
          // Don't overwrite if store was populated while we were fetching
          if (useMessagesStore.getState().has(conversationId)) return;

          const toEnriched = (msg: any): EnrichedMessage => ({
            id: msg.id,
            conversationId: msg.conversationId ?? conversationId,
            senderId: msg.senderId,
            content: msg.content,
            type: msg.type ?? 'text',
            metadata: msg.metadata ?? null,
            replyToId: msg.replyToId ?? null,
            createdAt: msg.createdAt?.toISOString?.() ?? String(msg.createdAt),
            readAt: msg.readAt
              ? (msg.readAt.toISOString?.() ?? String(msg.readAt))
              : null,
            deletedAt: msg.deletedAt
              ? (msg.deletedAt.toISOString?.() ?? String(msg.deletedAt))
              : null,
            replyTo: msg.replyTo ?? null,
            reactions: msg.reactions ?? [],
          });

          useMessagesStore.getState().set(
            conversationId,
            data.messages.map(toEnriched),
            !!data.nextCursor,
            data.nextCursor,
          );
        })
        .catch(() => {
          // Silently fail — chat screen will fetch on open
        })
        .finally(() => {
          inflightRef.current.delete(conversationId);
        });
    },
    [utils],
  );

  return prefetch;
}
