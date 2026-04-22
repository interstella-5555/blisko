import { blockUserSchema, respondToWaveSchema, sendWaveSchema } from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { subHours } from "date-fns";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { DAILY_PING_LIMIT_BASIC, DECLINE_COOLDOWN_HOURS, PER_PERSON_COOLDOWN_HOURS } from "@/config/pingLimits";
import { db, schema } from "@/db";
import { userIsActive } from "@/db/filters";
import { setTargetUserId } from "@/services/metrics";
import { sendPushToUser } from "@/services/push";
import { promotePairAnalysis } from "@/services/queue";
import { featureGate } from "@/trpc/middleware/featureGate";
import { rateLimit } from "@/trpc/middleware/rateLimit";
import { protectedProcedure, router } from "@/trpc/trpc";
import { publishEvent } from "@/ws/redis-bridge";

type AcceptableWave = {
  id: string;
  fromUserId: string;
  toUserId: string;
  senderStatusSnapshot: string | null;
};

type ResponderProfile = {
  displayName: string;
  avatarUrl: string | null;
  currentStatus: string | null;
  latitude: number | null;
  longitude: number | null;
} | null;

type SenderLocation = {
  latitude: number | null;
  longitude: number | null;
} | null;

// Shared accept logic used by both `waves.respond` (explicit accept) and
// `waves.send` (implicit accept when the second user pings the first user
// who already has a pending wave to them — they clearly both want to
// connect, so the second send is treated as accept of the existing pending).
async function acceptWaveCore(
  wave: AcceptableWave,
  responderUserId: string,
  responderProfile: ResponderProfile,
  senderLocation: SenderLocation,
): Promise<{ updatedWave: typeof schema.waves.$inferSelect; conversation: { id: string } }> {
  let connectedDistance: number | null = null;
  if (
    responderProfile?.latitude &&
    responderProfile?.longitude &&
    senderLocation?.latitude &&
    senderLocation?.longitude
  ) {
    const R = 6371000;
    const dLat = ((senderLocation.latitude - responderProfile.latitude) * Math.PI) / 180;
    const dLon = ((senderLocation.longitude - responderProfile.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((responderProfile.latitude * Math.PI) / 180) *
        Math.cos((senderLocation.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    connectedDistance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  const result = await db.transaction(async (tx) => {
    const [updatedWave] = await tx
      .update(schema.waves)
      .set({
        status: "accepted",
        recipientStatusSnapshot: responderProfile?.currentStatus ?? null,
        respondedAt: new Date(),
      })
      .where(and(eq(schema.waves.id, wave.id), eq(schema.waves.status, "pending")))
      .returning();

    if (!updatedWave) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Wave already responded to" });
    }

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
      { conversationId: conversation.id, userId: responderUserId },
    ]);

    return { updatedWave, conversation };
  });

  void sendPushToUser(wave.fromUserId, {
    title: "Blisko",
    body: `${responderProfile?.displayName ?? "Ktoś"} — ping przyjęty! Możecie teraz pisać.`,
    data: { type: "chat", conversationId: result.conversation.id },
  });

  publishEvent("waveResponded", {
    fromUserId: wave.fromUserId,
    responderId: responderUserId,
    waveId: wave.id,
    accepted: true,
    conversationId: result.conversation.id,
    responderProfile: responderProfile
      ? { displayName: responderProfile.displayName, avatarUrl: responderProfile.avatarUrl }
      : { displayName: "Ktoś", avatarUrl: null },
  });

  return result;
}

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
        .where(and(eq(schema.profiles.userId, input.toUserId), userIsActive()))
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

      // Hidden users cannot send pings (server-side safety net — mobile prompts before reaching here)
      const senderVisibility = await db.query.profiles.findFirst({
        where: eq(schema.profiles.userId, ctx.userId),
        columns: { visibilityMode: true },
      });
      if (senderVisibility?.visibilityMode === "ninja") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "hidden_cannot_ping",
        });
      }

      // Daily ping limit — count waves sent today (UTC midnight reset)
      const todayMidnight = new Date();
      todayMidnight.setUTCHours(0, 0, 0, 0);
      const [dailyCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.waves)
        .where(and(eq(schema.waves.fromUserId, ctx.userId), gte(schema.waves.createdAt, todayMidnight)));
      const sentToday = Number(dailyCount?.count ?? 0);

      if (sentToday >= DAILY_PING_LIMIT_BASIC) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "daily_limit",
        });
      }

      // Per-person cooldown — max 1 ping per person per 24h (any status)
      const perPersonCutoff = subHours(new Date(), PER_PERSON_COOLDOWN_HOURS);
      const recentWaveToSamePerson = await db.query.waves.findFirst({
        where: and(
          eq(schema.waves.fromUserId, ctx.userId),
          eq(schema.waves.toUserId, input.toUserId),
          gte(schema.waves.createdAt, perPersonCutoff),
        ),
        columns: { createdAt: true },
      });

      if (recentWaveToSamePerson) {
        const remainingMs =
          recentWaveToSamePerson.createdAt.getTime() + PER_PERSON_COOLDOWN_HOURS * 3600000 - Date.now();
        const remainingHours = Math.ceil(remainingMs / 3600000);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `per_person:${remainingHours}`,
        });
      }

      // Check decline cooldown — cannot re-ping someone who declined within DECLINE_COOLDOWN_HOURS
      const cooldownCutoff = subHours(new Date(), DECLINE_COOLDOWN_HOURS);
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

      // Fetch sender profile for status snapshot, push display, and the
      // implicit-accept location calculation if we end up taking that path.
      const senderProfile = await db.query.profiles.findFirst({
        where: eq(schema.profiles.userId, ctx.userId),
        columns: {
          displayName: true,
          avatarUrl: true,
          currentStatus: true,
          latitude: true,
          longitude: true,
        },
      });

      // INSERT with ON CONFLICT DO NOTHING against the `waves_active_unique`
      // partial index. The index lives on the generated `pair_key` column
      // (md5 of LEAST/GREATEST of the user IDs) so it is direction-agnostic
      // and `onConflictDoNothing` can target it via the standard column API.
      // The index enforces all the hard correctness rules at the database
      // layer:
      //   - no duplicate pending in the same direction
      //   - no re-waving an already-connected user (any direction)
      //   - no two pending waves between the same pair (any direction)
      // See docs/architecture/rate-limiting.md → "Wave send race condition".
      const [wave] = await db
        .insert(schema.waves)
        .values({
          fromUserId: ctx.userId,
          toUserId: input.toUserId,
          senderStatusSnapshot: senderProfile?.currentStatus ?? null,
        })
        .onConflictDoNothing({
          target: schema.waves.pairKey,
          where: sql`${schema.waves.status} in ('pending', 'accepted')`,
        })
        .returning();

      if (!wave) {
        // Empty `returning` means the partial unique index blocked the insert.
        // Find what was already in the active set for this pair (either
        // direction) and choose one of three responses: implicit accept,
        // already_connected, or already_waved.
        const existing = await db.query.waves.findFirst({
          where: and(
            or(
              and(eq(schema.waves.fromUserId, ctx.userId), eq(schema.waves.toUserId, input.toUserId)),
              and(eq(schema.waves.fromUserId, input.toUserId), eq(schema.waves.toUserId, ctx.userId)),
            ),
            inArray(schema.waves.status, ["pending", "accepted"]),
          ),
          columns: {
            id: true,
            fromUserId: true,
            toUserId: true,
            status: true,
            senderStatusSnapshot: true,
          },
        });

        if (!existing) {
          // Extremely unlikely race: the blocking row vanished between
          // ON CONFLICT and our SELECT (e.g. someone declined it in between).
          // Surface it as a transient error so the client can retry.
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "wave_state_inconsistent" });
        }

        if (existing.status === "accepted") {
          throw new TRPCError({ code: "CONFLICT", message: "already_connected" });
        }

        if (existing.fromUserId === ctx.userId) {
          throw new TRPCError({ code: "CONFLICT", message: "already_waved" });
        }

        // existing.fromUserId === input.toUserId — the other user has a
        // pending wave to us. They want to connect; we just clicked ping
        // (so we want to connect too). Implicitly accept their wave.
        const otherProfile = await db.query.profiles.findFirst({
          where: eq(schema.profiles.userId, input.toUserId),
          columns: { latitude: true, longitude: true },
        });

        const { updatedWave, conversation } = await acceptWaveCore(
          {
            id: existing.id,
            fromUserId: existing.fromUserId,
            toUserId: existing.toUserId,
            senderStatusSnapshot: existing.senderStatusSnapshot,
          },
          ctx.userId,
          senderProfile ?? null,
          otherProfile ?? null,
        );

        return { wave: updatedWave, conversationId: conversation.id, autoAccepted: true as const };
      }

      await promotePairAnalysis(ctx.userId, input.toUserId);

      void sendPushToUser(input.toUserId, {
        title: "Blisko",
        body: `${senderProfile?.displayName ?? "Ktoś"} — nowy ping!`,
        data: { type: "wave", userId: ctx.userId },
      });

      publishEvent("newWave", {
        toUserId: input.toUserId,
        wave,
        fromProfile: senderProfile
          ? { displayName: senderProfile.displayName, avatarUrl: senderProfile.avatarUrl }
          : { displayName: "Ktoś", avatarUrl: null },
      });

      return { wave, conversationId: null, autoAccepted: false as const };
    }),

  // Get received waves
  getReceived: protectedProcedure.query(async ({ ctx }) => {
    const receivedWaves = await db
      .select({
        wave: schema.waves,
        fromProfile: {
          userId: schema.profiles.userId,
          displayName: schema.profiles.displayName,
          avatarUrl: schema.profiles.avatarUrl,
          bio: schema.profiles.bio,
        },
      })
      .from(schema.waves)
      .innerJoin(schema.profiles, eq(schema.waves.fromUserId, schema.profiles.userId))
      .innerJoin(schema.user, eq(schema.waves.fromUserId, schema.user.id))
      .where(
        and(
          eq(schema.waves.toUserId, ctx.userId),
          inArray(schema.waves.status, ["pending", "accepted"]),
          userIsActive(),
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
        toProfile: {
          userId: schema.profiles.userId,
          displayName: schema.profiles.displayName,
          avatarUrl: schema.profiles.avatarUrl,
          bio: schema.profiles.bio,
        },
      })
      .from(schema.waves)
      .innerJoin(schema.profiles, eq(schema.waves.toUserId, schema.profiles.userId))
      .innerJoin(schema.user, eq(schema.waves.toUserId, schema.user.id))
      .where(and(eq(schema.waves.fromUserId, ctx.userId), userIsActive()))
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
        const [responderProfile, senderLocation] = await Promise.all([
          db.query.profiles.findFirst({
            where: eq(schema.profiles.userId, ctx.userId),
            columns: {
              displayName: true,
              avatarUrl: true,
              currentStatus: true,
              latitude: true,
              longitude: true,
            },
          }),
          db.query.profiles.findFirst({
            where: eq(schema.profiles.userId, wave.fromUserId),
            columns: { latitude: true, longitude: true },
          }),
        ]);

        const { updatedWave, conversation } = await acceptWaveCore(
          {
            id: wave.id,
            fromUserId: wave.fromUserId,
            toUserId: wave.toUserId,
            senderStatusSnapshot: wave.senderStatusSnapshot,
          },
          ctx.userId,
          responderProfile ?? null,
          senderLocation ?? null,
        );

        return { wave: updatedWave, conversationId: conversation.id };
      }

      // Decline path (single atomic update)
      const [updatedWave] = await db
        .update(schema.waves)
        .set({ status: "declined", respondedAt: new Date() })
        .where(and(eq(schema.waves.id, input.waveId), eq(schema.waves.status, "pending")))
        .returning();

      if (!updatedWave) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Wave already responded to",
        });
      }

      publishEvent("waveResponded", {
        fromUserId: wave.fromUserId,
        responderId: wave.toUserId,
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

      // Decline ALL pending waves between us — both incoming (from the
      // blocked user to me) and outgoing (from me to the blocked user). The
      // outgoing case matters because the user profile modal renders the
      // block button regardless of prior interaction, so a user can ping
      // someone and then immediately block them; without this bidirectional
      // sweep that outgoing pending would stay live and the blocked user
      // could still accept it, opening a chat with someone who has just
      // blocked them. The `waves_active_unique` partial unique index would
      // also keep the pair_key locked, preventing any later wave between
      // the same pair after an unblock.
      await tx
        .update(schema.waves)
        .set({ status: "declined", respondedAt: new Date() })
        .where(
          and(
            or(
              and(eq(schema.waves.fromUserId, input.userId), eq(schema.waves.toUserId, ctx.userId)),
              and(eq(schema.waves.fromUserId, ctx.userId), eq(schema.waves.toUserId, input.userId)),
            ),
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
        userId: schema.profiles.userId,
        displayName: schema.profiles.displayName,
        avatarUrl: schema.profiles.avatarUrl,
        blockedAt: schema.blocks.createdAt,
      })
      .from(schema.blocks)
      .innerJoin(schema.profiles, eq(schema.blocks.blockedId, schema.profiles.userId))
      .innerJoin(schema.user, eq(schema.blocks.blockedId, schema.user.id))
      .where(and(eq(schema.blocks.blockerId, ctx.userId), userIsActive()));

    return blockedUsers;
  }),
});
