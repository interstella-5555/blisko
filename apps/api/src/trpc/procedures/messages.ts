import { z } from 'zod';
import { eq, and, desc, isNull, ne, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import {
  messages,
  conversations,
  conversationParticipants,
  profiles,
} from '../../db/schema';
import { sendMessageSchema } from '@meet/shared';
import { TRPCError } from '@trpc/server';

export const messagesRouter = router({
  // Get all conversations for current user
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    // Get conversations where user is participant
    const userConversations = await db
      .select({
        conversationId: conversationParticipants.conversationId,
      })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, ctx.userId));

    const conversationIds = userConversations.map((c) => c.conversationId);

    if (conversationIds.length === 0) {
      return [];
    }

    // For each conversation, get the other participant and last message
    const result = await Promise.all(
      conversationIds.map(async (conversationId) => {
        // Get conversation
        const [conversation] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, conversationId));

        // Get other participant
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

        // Get last message
        const [lastMessage] = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        // Count unread messages
        const [unreadResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversationId),
              ne(messages.senderId, ctx.userId),
              isNull(messages.readAt)
            )
          );

        return {
          conversation,
          participant: otherParticipant?.profile || null,
          lastMessage: lastMessage || null,
          unreadCount: Number(unreadResult?.count || 0),
        };
      })
    );

    // Sort by last message date
    return result
      .filter((r) => r.participant !== null)
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

      let query = db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
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
                eq(messages.conversationId, input.conversationId),
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

      return {
        messages: result,
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
        })
        .returning();

      // Update conversation updatedAt
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      // TODO: Send push notification

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

      return { success: true };
    }),
});
