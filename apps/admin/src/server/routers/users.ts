import { schema } from "@repo/db";
import { and, count, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { enqueueAndWait } from "~/lib/queue";
import { publicProcedure, router } from "../trpc";

export const usersRouter = router({
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["all", "active", "onboarding", "deleted"]).default("all"),
        showSeed: z.boolean().default(true),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const { search, status, showSeed, limit, offset } = input;

      const conditions = [];

      if (status === "active") {
        conditions.push(isNull(schema.user.deletedAt));
        conditions.push(eq(schema.profiles.isComplete, true));
      } else if (status === "onboarding") {
        conditions.push(isNull(schema.user.deletedAt));
        conditions.push(eq(schema.profiles.isComplete, false));
      } else if (status === "deleted") {
        conditions.push(isNotNull(schema.user.deletedAt));
      }

      if (!showSeed) {
        conditions.push(sql`${schema.user.email} NOT LIKE 'user%@example.com'`);
      }

      if (search) {
        conditions.push(
          or(
            ilike(schema.user.email, `%${search}%`),
            ilike(schema.user.name, `%${search}%`),
            ilike(schema.profiles.displayName, `%${search}%`),
          ),
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      // Basic user + profile query
      const rows = await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
          createdAt: schema.user.createdAt,
          deletedAt: schema.user.deletedAt,
          displayName: schema.profiles.displayName,
          avatarUrl: schema.profiles.avatarUrl,
          visibilityMode: schema.profiles.visibilityMode,
          isComplete: schema.profiles.isComplete,
          lastLocationUpdate: schema.profiles.lastLocationUpdate,
        })
        .from(schema.user)
        .innerJoin(schema.profiles, eq(schema.user.id, schema.profiles.userId))
        .where(where)
        .orderBy(schema.user.createdAt)
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(schema.user)
        .innerJoin(schema.profiles, eq(schema.user.id, schema.profiles.userId))
        .where(where);

      // Batch fetch counts for the page of users
      const userIds = rows.map((r) => r.id);

      const waveCounts: Record<string, { sent: number; received: number }> = {};
      const messageCounts: Record<string, number> = {};
      const groupCounts: Record<string, number> = {};

      if (userIds.length > 0) {
        const wavesSent = await db
          .select({
            userId: schema.waves.fromUserId,
            count: count(),
          })
          .from(schema.waves)
          .where(sql`${schema.waves.fromUserId} IN ${userIds}`)
          .groupBy(schema.waves.fromUserId);

        const wavesReceived = await db
          .select({
            userId: schema.waves.toUserId,
            count: count(),
          })
          .from(schema.waves)
          .where(sql`${schema.waves.toUserId} IN ${userIds}`)
          .groupBy(schema.waves.toUserId);

        for (const w of wavesSent) {
          waveCounts[w.userId] = { sent: w.count, received: 0 };
        }
        for (const w of wavesReceived) {
          if (!waveCounts[w.userId]) waveCounts[w.userId] = { sent: 0, received: 0 };
          waveCounts[w.userId].received = w.count;
        }

        const msgs = await db
          .select({
            userId: schema.messages.senderId,
            count: count(),
          })
          .from(schema.messages)
          .where(and(sql`${schema.messages.senderId} IN ${userIds}`, isNull(schema.messages.deletedAt)))
          .groupBy(schema.messages.senderId);

        for (const m of msgs) {
          messageCounts[m.userId] = m.count;
        }

        const groups = await db
          .select({
            userId: schema.conversationParticipants.userId,
            count: count(),
          })
          .from(schema.conversationParticipants)
          .innerJoin(schema.conversations, eq(schema.conversationParticipants.conversationId, schema.conversations.id))
          .where(
            and(sql`${schema.conversationParticipants.userId} IN ${userIds}`, eq(schema.conversations.type, "group")),
          )
          .groupBy(schema.conversationParticipants.userId);

        for (const g of groups) {
          groupCounts[g.userId] = g.count;
        }
      }

      return {
        users: rows.map((row) => ({
          ...row,
          wavesSent: waveCounts[row.id]?.sent ?? 0,
          wavesReceived: waveCounts[row.id]?.received ?? 0,
          messageCount: messageCounts[row.id] ?? 0,
          groupCount: groupCounts[row.id] ?? 0,
          isSeed: /^user\d+@example\.com$/.test(row.email),
          status: row.deletedAt ? ("deleted" as const) : row.isComplete ? ("active" as const) : ("onboarding" as const),
        })),
        total,
      };
    }),

  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const row = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        createdAt: schema.user.createdAt,
        updatedAt: schema.user.updatedAt,
        deletedAt: schema.user.deletedAt,
        anonymizedAt: schema.user.anonymizedAt,
        displayName: schema.profiles.displayName,
        avatarUrl: schema.profiles.avatarUrl,
        bio: schema.profiles.bio,
        lookingFor: schema.profiles.lookingFor,
        visibilityMode: schema.profiles.visibilityMode,
        doNotDisturb: schema.profiles.doNotDisturb,
        superpower: schema.profiles.superpower,
        interests: schema.profiles.interests,
        isComplete: schema.profiles.isComplete,
        dateOfBirth: schema.profiles.dateOfBirth,
        currentStatus: schema.profiles.currentStatus,
        latitude: schema.profiles.latitude,
        longitude: schema.profiles.longitude,
        lastLocationUpdate: schema.profiles.lastLocationUpdate,
      })
      .from(schema.user)
      .innerJoin(schema.profiles, eq(schema.user.id, schema.profiles.userId))
      .where(eq(schema.user.id, input.id))
      .limit(1);

    if (row.length === 0) return null;
    return row[0];
  }),

  softDelete: publicProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    await enqueueAndWait("admin-soft-delete-user", {
      type: "admin-soft-delete-user",
      userId: input.userId,
    });
    return { ok: true };
  }),

  restore: publicProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    await enqueueAndWait("admin-restore-user", {
      type: "admin-restore-user",
      userId: input.userId,
    });
    return { ok: true };
  }),

  reanalyze: publicProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    const profile = await db
      .select({
        latitude: schema.profiles.latitude,
        longitude: schema.profiles.longitude,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, input.userId))
      .limit(1);

    if (!profile[0]?.latitude || !profile[0]?.longitude) {
      throw new Error("Użytkownik nie ma udostępnionej lokalizacji");
    }

    await enqueueAndWait("analyze-user-pairs", {
      type: "analyze-user-pairs",
      userId: input.userId,
      latitude: profile[0].latitude,
      longitude: profile[0].longitude,
      radiusMeters: 5000,
    });
    return { ok: true };
  }),

  regenerateProfile: publicProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    const profile = await db
      .select({
        bio: schema.profiles.bio,
        lookingFor: schema.profiles.lookingFor,
        latitude: schema.profiles.latitude,
        longitude: schema.profiles.longitude,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, input.userId))
      .limit(1);

    if (!profile[0]) {
      throw new Error("Profil nie znaleziony");
    }

    await enqueueAndWait("generate-profile-ai", {
      type: "generate-profile-ai",
      userId: input.userId,
      bio: profile[0].bio ?? "",
      lookingFor: profile[0].lookingFor ?? "",
    });

    // Re-analyze nearby pairs if user has location
    if (profile[0].latitude && profile[0].longitude) {
      await enqueueAndWait("analyze-user-pairs", {
        type: "analyze-user-pairs",
        userId: input.userId,
        latitude: profile[0].latitude,
        longitude: profile[0].longitude,
        radiusMeters: 5000,
      });
    }

    return { ok: true };
  }),

  forceDisconnect: publicProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    await enqueueAndWait("admin-force-disconnect", {
      type: "admin-force-disconnect",
      userId: input.userId,
    });
    return { ok: true };
  }),

  stats: publicProcedure.query(async () => {
    const seedFilter = sql`${schema.user.email} NOT LIKE 'user%@example.com'`;

    const [realUsers] = await db
      .select({ count: count() })
      .from(schema.user)
      .innerJoin(schema.profiles, eq(schema.user.id, schema.profiles.userId))
      .where(seedFilter);

    const [seedUsers] = await db
      .select({ count: count() })
      .from(schema.user)
      .where(sql`${schema.user.email} LIKE 'user%@example.com'`);

    const [activeUsers] = await db
      .select({ count: count() })
      .from(schema.user)
      .innerJoin(schema.profiles, eq(schema.user.id, schema.profiles.userId))
      .where(and(isNull(schema.user.deletedAt), eq(schema.profiles.isComplete, true), seedFilter));

    const [onboardingUsers] = await db
      .select({ count: count() })
      .from(schema.user)
      .innerJoin(schema.profiles, eq(schema.user.id, schema.profiles.userId))
      .where(and(isNull(schema.user.deletedAt), eq(schema.profiles.isComplete, false), seedFilter));

    return {
      real: realUsers.count,
      seed: seedUsers.count,
      active: activeUsers.count,
      onboarding: onboardingUsers.count,
    };
  }),
});
