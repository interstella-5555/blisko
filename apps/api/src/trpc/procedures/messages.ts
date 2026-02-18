import { z } from 'zod';
import { eq, and, desc, isNull, ne, sql, ilike } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import {
  messages,
  conversations,
  conversationParticipants,
  profiles,
  messageReactions,
  topics,
} from '../../db/schema';
import {
  sendMessageSchema,
  deleteMessageSchema,
  reactToMessageSchema,
  searchMessagesSchema,
} from '@repo/shared';
import { TRPCError } from '@trpc/server';
import { ee } from '../../ws/events';
import { ensureTypingListener } from '../../ws/handler';

export const messagesRouter = router({
  // Get all conversations for current user
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    // Get conversations where user is participant
    const userConversations = await db
      .select({
        conversationId: conversationParticipants.conversationId,
        lastReadAt: conversationParticipants.lastReadAt,
      })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, ctx.userId));

    const conversationIds = userConversations.map((c) => c.conversationId);

    if (conversationIds.length === 0) {
      return [];
    }

    const lastReadMap = new Map(
      userConversations.map((c) => [c.conversationId, c.lastReadAt])
    );

    // For each conversation, get the other participant and last message
    const result = await Promise.all(
      conversationIds.map(async (conversationId) => {
        // Get conversation
        const [conversation] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, conversationId));

        const isGroup = conversation.type === 'group';

        // For DMs: get other participant. For groups: get member count.
        let participant = null;
        let memberCount = null;

        if (isGroup) {
          const [countResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(conversationParticipants)
            .where(
              eq(conversationParticipants.conversationId, conversationId)
            );
          memberCount = Number(countResult.count);
        } else {
          const [otherParticipant] = await db
            .select({ profile: profiles })
            .from(conversationParticipants)
            .innerJoin(
              profiles,
              eq(conversationParticipants.userId, profiles.userId)
            )
            .where(
              and(
                eq(conversationParticipants.conversationId, conversationId),
                ne(conversationParticipants.userId, ctx.userId)
              )
            );
          participant = otherParticipant?.profile || null;
        }

        // Get last message (skip deleted)
        const [lastMessage] = await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversationId),
              isNull(messages.deletedAt)
            )
          )
          .orderBy(desc(messages.createdAt))
          .limit(1);

        // Get sender name for last message (for groups)
        let lastMessageSenderName: string | null = null;
        if (isGroup && lastMessage) {
          const [senderProfile] = await db
            .select({ displayName: profiles.displayName })
            .from(profiles)
            .where(eq(profiles.userId, lastMessage.senderId));
          lastMessageSenderName = senderProfile?.displayName ?? null;
        }

        // Count unread messages
        let unreadCount = 0;
        if (isGroup) {
          // Groups: count messages after lastReadAt
          const lastReadAt = lastReadMap.get(conversationId);
          if (lastReadAt) {
            const [unreadResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(messages)
              .where(
                and(
                  eq(messages.conversationId, conversationId),
                  ne(messages.senderId, ctx.userId),
                  isNull(messages.deletedAt),
                  sql`${messages.createdAt} > ${lastReadAt}`
                )
              );
            unreadCount = Number(unreadResult?.count || 0);
          } else {
            // Never read — count all messages from others
            const [unreadResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(messages)
              .where(
                and(
                  eq(messages.conversationId, conversationId),
                  ne(messages.senderId, ctx.userId),
                  isNull(messages.deletedAt)
                )
              );
            unreadCount = Number(unreadResult?.count || 0);
          }
        } else {
          // DMs: use per-message readAt
          const [unreadResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, conversationId),
                ne(messages.senderId, ctx.userId),
                isNull(messages.readAt),
                isNull(messages.deletedAt)
              )
            );
          unreadCount = Number(unreadResult?.count || 0);
        }

        return {
          conversation,
          participant,
          lastMessage: lastMessage || null,
          lastMessageSenderName,
          memberCount,
          unreadCount,
        };
      })
    );

    // Sort by last message date — keep groups even without participant
    return result
      .filter(
        (r) => r.conversation.type === 'group' || r.participant !== null
      )
      .sort((a, b) => {
        const dateA = a.lastMessage?.createdAt || a.conversation.createdAt;
        const dateB = b.lastMessage?.createdAt || b.conversation.createdAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
  }),

  // Get messages for a conversation
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        topicId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify user is participant
      const [participant] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, ctx.userId)
          )
        );

      if (!participant) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a participant in this conversation',
        });
      }

      // Check if group conversation for sender enrichment
      const [conversation] = await db
        .select({ type: conversations.type })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId));

      const isGroup = conversation?.type === 'group';

      // Ensure typing listener is set up for this conversation
      ensureTypingListener(input.conversationId);

      // Build WHERE conditions
      const whereConditions = [
        eq(messages.conversationId, input.conversationId),
      ];
      if (input.topicId) {
        whereConditions.push(eq(messages.topicId, input.topicId));
      }

      let query = db
        .select()
        .from(messages)
        .where(and(...whereConditions))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit + 1);

      if (input.cursor) {
        const [cursorMessage] = await db
          .select()
          .from(messages)
          .where(eq(messages.id, input.cursor));

        if (cursorMessage) {
          query = db
            .select()
            .from(messages)
            .where(
              and(
                ...whereConditions,
                sql`${messages.createdAt} < ${cursorMessage.createdAt}`
              )
            )
            .orderBy(desc(messages.createdAt))
            .limit(input.limit + 1);
        }
      }

      const result = await query;

      let nextCursor: string | undefined;
      if (result.length > input.limit) {
        const nextItem = result.pop();
        nextCursor = nextItem?.id;
      }

      // For groups, batch-fetch sender profiles
      const senderProfileMap = new Map<
        string,
        { displayName: string; avatarUrl: string | null }
      >();
      if (isGroup) {
        const senderIds = [...new Set(result.map((m) => m.senderId))];
        if (senderIds.length > 0) {
          const senderProfiles = await db
            .select({
              userId: profiles.userId,
              displayName: profiles.displayName,
              avatarUrl: profiles.avatarUrl,
            })
            .from(profiles)
            .where(
              sql`${profiles.userId} IN ${senderIds}`
            );
          for (const sp of senderProfiles) {
            senderProfileMap.set(sp.userId, {
              displayName: sp.displayName,
              avatarUrl: sp.avatarUrl,
            });
          }
        }
      }

      // Enrich messages with reply-to info and reactions
      const enrichedMessages = await Promise.all(
        result.map(async (msg) => {
          // Get reply-to message if exists
          let replyTo = null;
          if (msg.replyToId) {
            const [replyMsg] = await db
              .select({
                id: messages.id,
                content: messages.content,
                senderId: messages.senderId,
              })
              .from(messages)
              .where(eq(messages.id, msg.replyToId));

            if (replyMsg) {
              const senderProfile =
                senderProfileMap.get(replyMsg.senderId) ||
                (
                  await db
                    .select({ displayName: profiles.displayName })
                    .from(profiles)
                    .where(eq(profiles.userId, replyMsg.senderId))
                )[0];

              replyTo = {
                id: replyMsg.id,
                content: replyMsg.content,
                senderName:
                  senderProfile?.displayName ?? 'Użytkownik',
              };
            }
          }

          // Get reactions for this message
          const reactionsData = await db
            .select()
            .from(messageReactions)
            .where(eq(messageReactions.messageId, msg.id));

          // Group reactions by emoji
          const reactionMap = new Map<
            string,
            { emoji: string; count: number; userIds: string[] }
          >();
          for (const r of reactionsData) {
            const existing = reactionMap.get(r.emoji);
            if (existing) {
              existing.count++;
              existing.userIds.push(r.userId);
            } else {
              reactionMap.set(r.emoji, {
                emoji: r.emoji,
                count: 1,
                userIds: [r.userId],
              });
            }
          }

          const reactions = Array.from(reactionMap.values()).map((r) => ({
            emoji: r.emoji,
            count: r.count,
            myReaction: r.userIds.includes(ctx.userId),
          }));

          // Add sender info for groups
          const senderInfo = isGroup
            ? senderProfileMap.get(msg.senderId) ?? null
            : null;

          return {
            ...msg,
            replyTo,
            reactions,
            senderName: senderInfo?.displayName ?? null,
            senderAvatarUrl: senderInfo?.avatarUrl ?? null,
          };
        })
      );

      return {
        messages: enrichedMessages,
        nextCursor,
      };
    }),

  // Send a message
  send: protectedProcedure
    .input(sendMessageSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user is participant
      const [participant] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, ctx.userId)
          )
        );

      if (!participant) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a participant in this conversation',
        });
      }

      const [message] = await db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderId: ctx.userId,
          content: input.content,
          type: input.type ?? 'text',
          metadata: input.metadata ?? null,
          replyToId: input.replyToId ?? null,
          topicId: input.topicId ?? null,
        })
        .returning();

      // Update conversation updatedAt
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      // If message belongs to a topic, update topic stats
      if (input.topicId) {
        await db
          .update(topics)
          .set({
            lastMessageAt: new Date(),
            messageCount: sql`${topics.messageCount} + 1`,
          })
          .where(eq(topics.id, input.topicId));
      }

      // Get sender profile for WS event enrichment
      const [senderProfile] = await db
        .select({
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        })
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      // Emit real-time event
      ee.emit('newMessage', {
        conversationId: input.conversationId,
        message,
        senderName: senderProfile?.displayName ?? null,
        senderAvatarUrl: senderProfile?.avatarUrl ?? null,
      });

      return message;
    }),

  // Mark messages as read
  markAsRead: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if this is a group conversation
      const [conv] = await db
        .select({ type: conversations.type })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId));

      if (conv?.type === 'group') {
        // Groups: update lastReadAt on participant row
        await db
          .update(conversationParticipants)
          .set({ lastReadAt: new Date() })
          .where(
            and(
              eq(
                conversationParticipants.conversationId,
                input.conversationId
              ),
              eq(conversationParticipants.userId, ctx.userId)
            )
          );
      } else {
        // DMs: mark individual messages as read
        await db
          .update(messages)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(messages.conversationId, input.conversationId),
              ne(messages.senderId, ctx.userId),
              isNull(messages.readAt)
            )
          );
      }

      return { success: true };
    }),

  // Delete a message (soft delete)
  deleteMessage: protectedProcedure
    .input(deleteMessageSchema)
    .mutation(async ({ ctx, input }) => {
      const [msg] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, input.messageId));

      if (!msg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Message not found',
        });
      }

      // Check if user can delete: own message OR group admin
      if (msg.senderId !== ctx.userId) {
        // Check if this is a group and user is admin/owner
        const [conv] = await db
          .select({ type: conversations.type })
          .from(conversations)
          .where(eq(conversations.id, msg.conversationId));

        if (conv?.type === 'group') {
          const [participant] = await db
            .select({ role: conversationParticipants.role })
            .from(conversationParticipants)
            .where(
              and(
                eq(
                  conversationParticipants.conversationId,
                  msg.conversationId
                ),
                eq(conversationParticipants.userId, ctx.userId)
              )
            );

          if (
            !participant ||
            (participant.role !== 'admin' && participant.role !== 'owner')
          ) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You can only delete your own messages',
            });
          }
        } else {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only delete your own messages',
          });
        }
      }

      await db
        .update(messages)
        .set({ deletedAt: new Date() })
        .where(eq(messages.id, input.messageId));

      return { success: true };
    }),

  // React to a message (toggle)
  react: protectedProcedure
    .input(reactToMessageSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify message exists
      const [msg] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, input.messageId));

      if (!msg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Message not found',
        });
      }

      // Verify user is participant in this conversation
      const [participant] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, msg.conversationId),
            eq(conversationParticipants.userId, ctx.userId)
          )
        );

      if (!participant) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a participant in this conversation',
        });
      }

      // Check if reaction already exists (toggle)
      const [existing] = await db
        .select()
        .from(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, input.messageId),
            eq(messageReactions.userId, ctx.userId),
            eq(messageReactions.emoji, input.emoji)
          )
        );

      if (existing) {
        // Remove reaction
        await db
          .delete(messageReactions)
          .where(eq(messageReactions.id, existing.id));

        ee.emit('reaction', {
          conversationId: msg.conversationId,
          messageId: input.messageId,
          emoji: input.emoji,
          userId: ctx.userId,
          action: 'removed' as const,
        });

        return { action: 'removed' as const };
      } else {
        // Add reaction
        await db.insert(messageReactions).values({
          messageId: input.messageId,
          userId: ctx.userId,
          emoji: input.emoji,
        });

        ee.emit('reaction', {
          conversationId: msg.conversationId,
          messageId: input.messageId,
          emoji: input.emoji,
          userId: ctx.userId,
          action: 'added' as const,
        });

        return { action: 'added' as const };
      }
    }),

  // Set typing indicator
  setTyping: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().min(1),
        isTyping: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      ensureTypingListener(input.conversationId);
      ee.emit(`typing:${input.conversationId}`, {
        conversationId: input.conversationId,
        userId: ctx.userId,
        isTyping: input.isTyping,
      });
      return { success: true };
    }),

  // Search messages in a conversation
  search: protectedProcedure
    .input(searchMessagesSchema)
    .query(async ({ ctx, input }) => {
      // Verify user is participant
      const [participant] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(
              conversationParticipants.conversationId,
              input.conversationId
            ),
            eq(conversationParticipants.userId, ctx.userId)
          )
        );

      if (!participant) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a participant in this conversation',
        });
      }

      const results = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, input.conversationId),
            isNull(messages.deletedAt),
            ilike(messages.content, `%${input.query}%`)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(input.limit);

      return results;
    }),
});
