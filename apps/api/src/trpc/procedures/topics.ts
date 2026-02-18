import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import {
  topics,
  conversations,
  conversationParticipants,
} from '../../db/schema';
import { createTopicSchema, updateTopicSchema } from '@repo/shared';
import { TRPCError } from '@trpc/server';
import { ee } from '../../ws/events';

async function requireGroupMember(conversationId: string, userId: string) {
  const [participant] = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      )
    );

  if (!participant) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You are not a member of this group',
    });
  }

  return participant;
}

async function requireAdmin(conversationId: string, userId: string) {
  const participant = await requireGroupMember(conversationId, userId);

  if (participant.role !== 'admin' && participant.role !== 'owner') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only admins can perform this action',
    });
  }

  return participant;
}

export const topicsRouter = router({
  create: protectedProcedure
    .input(createTopicSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify this is a group conversation
      const [conv] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.conversationId),
            eq(conversations.type, 'group')
          )
        );

      if (!conv) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Group not found',
        });
      }

      await requireGroupMember(input.conversationId, ctx.userId);

      const [topic] = await db
        .insert(topics)
        .values({
          conversationId: input.conversationId,
          name: input.name,
          emoji: input.emoji ?? null,
          creatorId: ctx.userId,
        })
        .returning();

      ee.emit('topicEvent', {
        conversationId: input.conversationId,
        topic: { id: topic.id, name: topic.name, emoji: topic.emoji },
        action: 'created',
      });

      return topic;
    }),

  update: protectedProcedure
    .input(updateTopicSchema)
    .mutation(async ({ ctx, input }) => {
      const [topic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, input.topicId));

      if (!topic) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Topic not found',
        });
      }

      await requireAdmin(topic.conversationId, ctx.userId);

      const { topicId, ...updates } = input;
      const setValues: Record<string, unknown> = {};
      if (updates.name !== undefined) setValues.name = updates.name;
      if (updates.emoji !== undefined) setValues.emoji = updates.emoji;
      if (updates.isPinned !== undefined) setValues.isPinned = updates.isPinned;
      if (updates.isClosed !== undefined) setValues.isClosed = updates.isClosed;

      const [updated] = await db
        .update(topics)
        .set(setValues)
        .where(eq(topics.id, topicId))
        .returning();

      ee.emit('topicEvent', {
        conversationId: topic.conversationId,
        topic: { id: updated.id, name: updated.name, emoji: updated.emoji },
        action: updates.isClosed ? 'closed' : 'updated',
      });

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ topicId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [topic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, input.topicId));

      if (!topic) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Topic not found',
        });
      }

      await requireAdmin(topic.conversationId, ctx.userId);

      await db.delete(topics).where(eq(topics.id, input.topicId));

      ee.emit('topicEvent', {
        conversationId: topic.conversationId,
        topic: { id: topic.id, name: topic.name, emoji: topic.emoji },
        action: 'deleted',
      });

      return { success: true };
    }),

  list: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireGroupMember(input.conversationId, ctx.userId);

      const result = await db
        .select()
        .from(topics)
        .where(eq(topics.conversationId, input.conversationId))
        .orderBy(
          sql`${topics.isPinned} DESC, ${topics.sortOrder} ASC, ${topics.lastMessageAt} DESC NULLS LAST`
        );

      return result;
    }),
});
