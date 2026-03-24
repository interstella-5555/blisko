import { blockUserSchema, respondToWaveSchema, sendWaveSchema } from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { DECLINE_COOLDOWN_HOURS } from "@/config/pingLimits";
import { db, schema } from "@/db";
import { setTargetUserId } from "@/services/metrics";
import { sendPushToUser } from "@/services/push";
import { promotePairAnalysis } from "@/services/queue";
import { featureGate } from "@/trpc/middleware/featureGate";
import { rateLimit } from "@/trpc/middleware/rateLimit";
import { protectedProcedure, router } from "@/trpc/trpc";
import { ee } from "@/ws/events";

export const wavesRouter = router({
  // Send a wave to someone
  send: protectedProcedure
    .use(featureGate("waves.send"))
    .use(rateLimit("waves.send"))
    .input(sendWaveSchema)
    .mutation(async ({ ctx, input }) => {
      setTargetUserId(ctx.req, input.toUserId);
      console.log(`[waves.send] from=${ctx.userId} to=${input.toUserId}`);

      // Check if target user exists and is not soft-deleted
      const [targetResult] = await db
        .select({ userId: schema.profiles.userId })
        .from(schema.profiles)
        .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
        .where(and(eq(schema.profiles.userId, input.toUserId), isNull(schema.user.deletedAt)))
        .limit(1);
      const targetProfile = targetResult ?? null;

      if (!targetProfile) {
        console.log(`[waves.send] Target profile not found for userId=${input.toUserId}`);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Check if blocked
      const blocked = await db.query.blocks.findFirst({
        where: or(
          and(eq(schema.blocks.blockerId, ctx.userId), eq(schema.blocks.blockedId, input.toUserId)),
          and(eq(schema.blocks.blockerId, input.toUserId), eq(schema.blocks.blockedId, ctx.userId)),
        ),
      });

      if (blocked) {
        console.log(`[waves.send] Blocked: from=${ctx.userId} to=${input.toUserId}`);
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot send wave to this user",
        });
      }

      // Check decline cooldown — cannot re-ping someone who declined within DECLINE_COOLDOWN_HOURS
      const cooldownCutoff = new Date(Date.now() - DECLINE_COOLDOWN_HOURS * 3600000);
      const recentDecline = await db.query.waves.findFirst({
        where: and(
          eq(schema.waves.fromUserId, ctx.userId),
          eq(schema.waves.toUserId, input.toUserId),
          eq(schema.waves.status, "declined"),
          gte(schema.waves.respondedAt, cooldownCutoff),
        ),
        columns: { respondedAt: true },
      });

      if (recentDecline?.respondedAt) {
        const remainingMs = recentDecline.respondedAt.getTime() + DECLINE_COOLDOWN_HOURS * 3600000 - Date.now();
        const remainingHours = Math.ceil(remainingMs / 3600000);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `cooldown:${remainingHours}`,
        });
      }

      // Fetch sender profile for status snapshot + notification display
      const senderProfile = await db.query.profiles.findFirst({
        where: eq(schema.profiles.userId, ctx.userId),
        columns: { displayName: true, avatarUrl: true, currentStatus: true },
      });

      // Check + insert in serializable transaction to prevent duplicate waves
      const [wave] = await db.transaction(
        async (tx) => {
          const [existingWave] = await tx
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
            throw new TRPCError({
              code: "CONFLICT",
              message: "You already waved at this user",
            });
          }

          return await tx
            .insert(schema.waves)
            .values({
              fromUserId: ctx.userId,
              toUserId: input.toUserId,
              senderStatusSnapshot: senderProfile?.currentStatus ?? null,
            })
            .returning();
        },
        { isolationLevel: "serializable" },
      );

      await promotePairAnalysis(ctx.userId, input.toUserId);

      void sendPushToUser(input.toUserId, {
        title: "Blisko",
        body: `${senderProfile?.displayName ?? "Ktoś"} — nowy ping!`,
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
      .innerJoin(schema.user, eq(schema.waves.fromUserId, schema.user.id))
      .where(
        and(
          eq(schema.waves.toUserId, ctx.userId),
          inArray(schema.waves.status, ["pending", "accepted"]),
          isNull(schema.user.deletedAt),
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
      .innerJoin(schema.user, eq(schema.waves.toUserId, schema.user.id))
      .where(and(eq(schema.waves.fromUserId, ctx.userId), isNull(schema.user.deletedAt)))
      .orderBy(desc(schema.waves.createdAt));

    return sentWaves;
  }),

  // Respond to a wave (accept or decline)
  respond: protectedProcedure
    .use(featureGate("waves.respond"))
    .use(rateLimit("waves.respond"))
    .input(respondToWaveSchema)
    .mutation(async ({ ctx, input }) => {
      const wave = await db.query.waves.findFirst({
        where: and(eq(schema.waves.id, input.waveId), eq(schema.waves.toUserId, ctx.userId)),
      });

      if (!wave) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wave not found",
        });
      }

      setTargetUserId(ctx.req, wave.fromUserId);

      if (wave.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Wave already responded to",
        });
      }

      if (input.accept) {
        // Fetch both profiles for status snapshots + notification display
        const [responderProfile, senderProfile] = await Promise.all([
          db.query.profiles.findFirst({
            where: eq(schema.profiles.userId, ctx.userId),
            columns: { displayName: true, avatarUrl: true, currentStatus: true, latitude: true, longitude: true },
          }),
          db.query.profiles.findFirst({
            where: eq(schema.profiles.userId, wave.fromUserId),
            columns: { latitude: true, longitude: true },
          }),
        ]);

        // Compute distance between sender and recipient at accept time
        let connectedDistance: number | null = null;
        if (
          responderProfile?.latitude &&
          responderProfile?.longitude &&
          senderProfile?.latitude &&
          senderProfile?.longitude
        ) {
          const R = 6371000;
          const dLat = ((senderProfile.latitude - responderProfile.latitude) * Math.PI) / 180;
          const dLon = ((senderProfile.longitude - responderProfile.longitude) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((responderProfile.latitude * Math.PI) / 180) *
              Math.cos((senderProfile.latitude * Math.PI) / 180) *
              Math.sin(dLon / 2) ** 2;
          connectedDistance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        }

        const { updatedWave, conversation } = await db.transaction(async (tx) => {
          const [updatedWave] = await tx
            .update(schema.waves)
            .set({
              status: "accepted",
              recipientStatusSnapshot: responderProfile?.currentStatus ?? null,
              respondedAt: new Date(),
            })
            .where(eq(schema.waves.id, input.waveId))
            .returning();

          const [conversation] = await tx
            .insert(schema.conversations)
            .values({
              metadata: {
                senderStatus: wave.senderStatusSnapshot ?? null,
                recipientStatus: responderProfile?.currentStatus ?? null,
                connectedAt: new Date().toISOString(),
                connectedDistance,
              },
            })
            .returning();

          await tx.insert(schema.conversationParticipants).values([
            { conversationId: conversation.id, userId: wave.fromUserId },
            { conversationId: conversation.id, userId: ctx.userId },
          ]);

          return { updatedWave, conversation };
        });

        void sendPushToUser(wave.fromUserId, {
          title: "Blisko",
          body: `${responderProfile?.displayName ?? "Ktoś"} — ping przyjęty!`,
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

      // Decline path (no transaction needed — single update)
      const [updatedWave] = await db
        .update(schema.waves)
        .set({ status: "declined", respondedAt: new Date() })
        .where(eq(schema.waves.id, input.waveId))
        .returning();

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
    const existingBlock = await db.query.blocks.findFirst({
      where: and(eq(schema.blocks.blockerId, ctx.userId), eq(schema.blocks.blockedId, input.userId)),
    });

    if (existingBlock) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "User already blocked",
      });
    }

    // Create block + decline pending waves atomically
    const [block] = await db.transaction(async (tx) => {
      const [block] = await tx
        .insert(schema.blocks)
        .values({
          blockerId: ctx.userId,
          blockedId: input.userId,
        })
        .returning();

      await tx
        .update(schema.waves)
        .set({ status: "declined", respondedAt: new Date() })
        .where(
          and(
            eq(schema.waves.fromUserId, input.userId),
            eq(schema.waves.toUserId, ctx.userId),
            eq(schema.waves.status, "pending"),
          ),
        );

      return [block];
    });

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
      .innerJoin(schema.user, eq(schema.blocks.blockedId, schema.user.id))
      .where(and(eq(schema.blocks.blockerId, ctx.userId), isNull(schema.user.deletedAt)));

    return blockedUsers;
  }),
});
