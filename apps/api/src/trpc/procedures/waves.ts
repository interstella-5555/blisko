import { z } from 'zod';
import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import {
  waves,
  profiles,
  blocks,
  conversations,
  conversationParticipants,
} from '../../db/schema';
import { sendWaveSchema, respondToWaveSchema, blockUserSchema } from '@repo/shared';
import { TRPCError } from '@trpc/server';
import { ee } from '../../ws/events';

export const wavesRouter = router({
  // Send a wave to someone
  send: protectedProcedure
    .input(sendWaveSchema)
    .mutation(async ({ ctx, input }) => {
      console.log(`[waves.send] from=${ctx.userId} to=${input.toUserId}`);

      // Check if target user exists
      const [targetProfile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, input.toUserId));

      if (!targetProfile) {
        console.log(`[waves.send] Target profile not found for userId=${input.toUserId}`);
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Check if blocked
      const [blocked] = await db
        .select()
        .from(blocks)
        .where(
          or(
            and(
              eq(blocks.blockerId, ctx.userId),
              eq(blocks.blockedId, input.toUserId)
            ),
            and(
              eq(blocks.blockerId, input.toUserId),
              eq(blocks.blockedId, ctx.userId)
            )
          )
        );

      if (blocked) {
        console.log(`[waves.send] Blocked: from=${ctx.userId} to=${input.toUserId}`);
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot send wave to this user',
        });
      }

      // Check if already waved
      const [existingWave] = await db
        .select()
        .from(waves)
        .where(
          and(
            eq(waves.fromUserId, ctx.userId),
            eq(waves.toUserId, input.toUserId),
            eq(waves.status, 'pending')
          )
        );

      if (existingWave) {
        console.log(`[waves.send] Already waved: from=${ctx.userId} to=${input.toUserId}`);
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You already waved at this user',
        });
      }

      const [wave] = await db
        .insert(waves)
        .values({
          fromUserId: ctx.userId,
          toUserId: input.toUserId,
        })
        .returning();

      // TODO: Send push notification

      ee.emit('newWave', { toUserId: input.toUserId, wave });

      return wave;
    }),

  // Get received waves
  getReceived: protectedProcedure.query(async ({ ctx }) => {
    const receivedWaves = await db
      .select({
        wave: waves,
        fromProfile: profiles,
      })
      .from(waves)
      .innerJoin(profiles, eq(waves.fromUserId, profiles.userId))
      .where(
        and(
          eq(waves.toUserId, ctx.userId),
          inArray(waves.status, ['pending', 'accepted'])
        )
      )
      .orderBy(desc(waves.createdAt));

    return receivedWaves;
  }),

  // Get sent waves
  getSent: protectedProcedure.query(async ({ ctx }) => {
    const sentWaves = await db
      .select({
        wave: waves,
        toProfile: profiles,
      })
      .from(waves)
      .innerJoin(profiles, eq(waves.toUserId, profiles.userId))
      .where(eq(waves.fromUserId, ctx.userId))
      .orderBy(desc(waves.createdAt));

    return sentWaves;
  }),

  // Cancel a sent wave
  cancel: protectedProcedure
    .input(z.object({ waveId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [wave] = await db
        .select()
        .from(waves)
        .where(
          and(eq(waves.id, input.waveId), eq(waves.fromUserId, ctx.userId))
        );

      if (!wave) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Wave not found',
        });
      }

      if (wave.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only cancel pending waves',
        });
      }

      const [deleted] = await db
        .delete(waves)
        .where(eq(waves.id, input.waveId))
        .returning();

      return deleted;
    }),

  // Respond to a wave (accept or decline)
  respond: protectedProcedure
    .input(respondToWaveSchema)
    .mutation(async ({ ctx, input }) => {
      const [wave] = await db
        .select()
        .from(waves)
        .where(
          and(eq(waves.id, input.waveId), eq(waves.toUserId, ctx.userId))
        );

      if (!wave) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Wave not found',
        });
      }

      if (wave.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Wave already responded to',
        });
      }

      const newStatus = input.accept ? 'accepted' : 'declined';

      const [updatedWave] = await db
        .update(waves)
        .set({ status: newStatus })
        .where(eq(waves.id, input.waveId))
        .returning();

      // If accepted, create a conversation
      if (input.accept) {
        const [conversation] = await db
          .insert(conversations)
          .values({})
          .returning();

        await db.insert(conversationParticipants).values([
          { conversationId: conversation.id, userId: wave.fromUserId },
          { conversationId: conversation.id, userId: ctx.userId },
        ]);

        // TODO: Send push notification about accepted wave

        ee.emit('waveResponded', {
          fromUserId: wave.fromUserId,
          waveId: wave.id,
          accepted: true,
          conversationId: conversation.id,
        });

        return { wave: updatedWave, conversationId: conversation.id };
      }

      ee.emit('waveResponded', {
        fromUserId: wave.fromUserId,
        waveId: wave.id,
        accepted: false,
        conversationId: null,
      });

      return { wave: updatedWave, conversationId: null };
    }),

  // Block a user
  block: protectedProcedure
    .input(blockUserSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if already blocked
      const [existingBlock] = await db
        .select()
        .from(blocks)
        .where(
          and(
            eq(blocks.blockerId, ctx.userId),
            eq(blocks.blockedId, input.userId)
          )
        );

      if (existingBlock) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User already blocked',
        });
      }

      // Create block
      const [block] = await db
        .insert(blocks)
        .values({
          blockerId: ctx.userId,
          blockedId: input.userId,
        })
        .returning();

      // Decline any pending waves from blocked user
      await db
        .update(waves)
        .set({ status: 'declined' })
        .where(
          and(
            eq(waves.fromUserId, input.userId),
            eq(waves.toUserId, ctx.userId),
            eq(waves.status, 'pending')
          )
        );

      return block;
    }),

  // Unblock a user
  unblock: protectedProcedure
    .input(blockUserSchema)
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(blocks)
        .where(
          and(
            eq(blocks.blockerId, ctx.userId),
            eq(blocks.blockedId, input.userId)
          )
        );

      return { success: true };
    }),

  // Get blocked users
  getBlocked: protectedProcedure.query(async ({ ctx }) => {
    const blockedUsers = await db
      .select({
        block: blocks,
        profile: profiles,
      })
      .from(blocks)
      .innerJoin(profiles, eq(blocks.blockedId, profiles.userId))
      .where(eq(blocks.blockerId, ctx.userId));

    return blockedUsers;
  }),
});
