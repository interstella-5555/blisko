import { blockUserSchema, respondToWaveSchema, sendWaveSchema } from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNotNull, notInArray, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { sendPushToUser } from "@/services/push";
import { promotePairAnalysis } from "@/services/queue";
import { featureGate } from "@/trpc/middleware/featureGate";
import { protectedProcedure, router } from "@/trpc/trpc";
import { ee } from "@/ws/events";

export const wavesRouter = router({
  // Send a wave to someone
  send: protectedProcedure
    .use(featureGate("waves.send"))
    .input(sendWaveSchema)
    .mutation(async ({ ctx, input }) => {
      console.log(`[waves.send] from=${ctx.userId} to=${input.toUserId}`);

      // Check if target user exists and is not soft-deleted
      const [targetProfile] = await db
        .select()
        .from(schema.profiles)
        .where(
          and(
            eq(schema.profiles.userId, input.toUserId),
            notInArray(
              schema.profiles.userId,
              db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
            ),
          ),
        );

      if (!targetProfile) {
        console.log(`[waves.send] Target profile not found for userId=${input.toUserId}`);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Check if blocked
      const [blocked] = await db
        .select()
        .from(schema.blocks)
        .where(
          or(
            and(eq(schema.blocks.blockerId, ctx.userId), eq(schema.blocks.blockedId, input.toUserId)),
            and(eq(schema.blocks.blockerId, input.toUserId), eq(schema.blocks.blockedId, ctx.userId)),
          ),
        );

      if (blocked) {
        console.log(`[waves.send] Blocked: from=${ctx.userId} to=${input.toUserId}`);
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot send wave to this user",
        });
      }

      // Check if already waved
      const [existingWave] = await db
        .select()
        .from(schema.waves)
        .where(
          and(
            eq(schema.waves.fromUserId, ctx.userId),
            eq(schema.waves.toUserId, input.toUserId),
            eq(schema.waves.status, "pending"),
          ),
        );

      if (existingWave) {
        console.log(`[waves.send] Already waved: from=${ctx.userId} to=${input.toUserId}`);
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already waved at this user",
        });
      }

      const [wave] = await db
        .insert(schema.waves)
        .values({
          fromUserId: ctx.userId,
          toUserId: input.toUserId,
        })
        .returning();

      await promotePairAnalysis(ctx.userId, input.toUserId);

      // Query sender profile for notification display
      const [senderProfile] = await db
        .select({ displayName: schema.profiles.displayName, avatarUrl: schema.profiles.avatarUrl })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, ctx.userId));

      void sendPushToUser(input.toUserId, {
        title: "Blisko",
        body: `${senderProfile?.displayName ?? "Ktoś"} — nowa zaczepka!`,
        data: { type: "wave", userId: ctx.userId },
      });

      ee.emit("newWave", {
        toUserId: input.toUserId,
        wave,
        fromProfile: senderProfile
          ? { displayName: senderProfile.displayName, avatarUrl: senderProfile.avatarUrl }
          : { displayName: "Ktoś", avatarUrl: null },
      });

      return wave;
    }),

  // Get received waves
  getReceived: protectedProcedure.query(async ({ ctx }) => {
    const receivedWaves = await db
      .select({
        wave: schema.waves,
        fromProfile: schema.profiles,
      })
      .from(schema.waves)
      .innerJoin(schema.profiles, eq(schema.waves.fromUserId, schema.profiles.userId))
      .where(
        and(
          eq(schema.waves.toUserId, ctx.userId),
          inArray(schema.waves.status, ["pending", "accepted"]),
          notInArray(
            schema.waves.fromUserId,
            db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
          ),
        ),
      )
      .orderBy(desc(schema.waves.createdAt));

    return receivedWaves;
  }),

  // Get sent waves
  getSent: protectedProcedure.query(async ({ ctx }) => {
    const sentWaves = await db
      .select({
        wave: schema.waves,
        toProfile: schema.profiles,
      })
      .from(schema.waves)
      .innerJoin(schema.profiles, eq(schema.waves.toUserId, schema.profiles.userId))
      .where(
        and(
          eq(schema.waves.fromUserId, ctx.userId),
          notInArray(
            schema.waves.toUserId,
            db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
          ),
        ),
      )
      .orderBy(desc(schema.waves.createdAt));

    return sentWaves;
  }),

  // Cancel a sent wave
  cancel: protectedProcedure.input(z.object({ waveId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const [wave] = await db
      .select()
      .from(schema.waves)
      .where(and(eq(schema.waves.id, input.waveId), eq(schema.waves.fromUserId, ctx.userId)));

    if (!wave) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Wave not found",
      });
    }

    if (wave.status !== "pending") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Can only cancel pending waves",
      });
    }

    const [deleted] = await db.delete(schema.waves).where(eq(schema.waves.id, input.waveId)).returning();

    return deleted;
  }),

  // Respond to a wave (accept or decline)
  respond: protectedProcedure
    .use(featureGate("waves.respond"))
    .input(respondToWaveSchema)
    .mutation(async ({ ctx, input }) => {
      const [wave] = await db
        .select()
        .from(schema.waves)
        .where(and(eq(schema.waves.id, input.waveId), eq(schema.waves.toUserId, ctx.userId)));

      if (!wave) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wave not found",
        });
      }

      if (wave.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Wave already responded to",
        });
      }

      const newStatus = input.accept ? "accepted" : "declined";

      const [updatedWave] = await db
        .update(schema.waves)
        .set({ status: newStatus })
        .where(eq(schema.waves.id, input.waveId))
        .returning();

      // If accepted, create a conversation
      if (input.accept) {
        const [conversation] = await db.insert(schema.conversations).values({}).returning();

        await db.insert(schema.conversationParticipants).values([
          { conversationId: conversation.id, userId: wave.fromUserId },
          { conversationId: conversation.id, userId: ctx.userId },
        ]);

        // Query responder profile for notification display
        const [responderProfile] = await db
          .select({ displayName: schema.profiles.displayName, avatarUrl: schema.profiles.avatarUrl })
          .from(schema.profiles)
          .where(eq(schema.profiles.userId, ctx.userId));

        void sendPushToUser(wave.fromUserId, {
          title: "Blisko",
          body: `${responderProfile?.displayName ?? "Ktoś"} — zaczepka przyjęta!`,
          data: { type: "chat", conversationId: conversation.id },
        });

        ee.emit("waveResponded", {
          fromUserId: wave.fromUserId,
          waveId: wave.id,
          accepted: true,
          conversationId: conversation.id,
          responderProfile: responderProfile
            ? { displayName: responderProfile.displayName, avatarUrl: responderProfile.avatarUrl }
            : { displayName: "Ktoś", avatarUrl: null },
        });

        return { wave: updatedWave, conversationId: conversation.id };
      }

      ee.emit("waveResponded", {
        fromUserId: wave.fromUserId,
        waveId: wave.id,
        accepted: false,
        conversationId: null,
        responderProfile: { displayName: "", avatarUrl: null },
      });

      return { wave: updatedWave, conversationId: null };
    }),

  // Block a user
  block: protectedProcedure.input(blockUserSchema).mutation(async ({ ctx, input }) => {
    // Check if already blocked
    const [existingBlock] = await db
      .select()
      .from(schema.blocks)
      .where(and(eq(schema.blocks.blockerId, ctx.userId), eq(schema.blocks.blockedId, input.userId)));

    if (existingBlock) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "User already blocked",
      });
    }

    // Create block
    const [block] = await db
      .insert(schema.blocks)
      .values({
        blockerId: ctx.userId,
        blockedId: input.userId,
      })
      .returning();

    // Decline any pending waves from blocked user
    await db
      .update(schema.waves)
      .set({ status: "declined" })
      .where(
        and(
          eq(schema.waves.fromUserId, input.userId),
          eq(schema.waves.toUserId, ctx.userId),
          eq(schema.waves.status, "pending"),
        ),
      );

    return block;
  }),

  // Unblock a user
  unblock: protectedProcedure.input(blockUserSchema).mutation(async ({ ctx, input }) => {
    await db
      .delete(schema.blocks)
      .where(and(eq(schema.blocks.blockerId, ctx.userId), eq(schema.blocks.blockedId, input.userId)));

    return { success: true };
  }),

  // Get blocked users
  getBlocked: protectedProcedure.query(async ({ ctx }) => {
    const blockedUsers = await db
      .select({
        block: schema.blocks,
        profile: schema.profiles,
      })
      .from(schema.blocks)
      .innerJoin(schema.profiles, eq(schema.blocks.blockedId, schema.profiles.userId))
      .where(
        and(
          eq(schema.blocks.blockerId, ctx.userId),
          notInArray(
            schema.blocks.blockedId,
            db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
          ),
        ),
      );

    return blockedUsers;
  }),
});
