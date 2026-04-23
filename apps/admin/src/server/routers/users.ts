import { schema, USER_TYPES } from "@repo/db";
import { and, count, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { enqueueAiAndWait, enqueueOpsAndWait } from "~/lib/queue";
import { protectedProcedure, router } from "../trpc";

// BLI-271 replaced email-LIKE detection with a column — admin filters and
// labels by `user.type`. Enum values sourced from `@repo/db` (single truth).
const userTypeEnum = z.enum(USER_TYPES);
const userTypeFilter = z.enum(["all", ...USER_TYPES]);

export const usersRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["all", "active", "onboarding", "deleted", "suspended"]).default("all"),
        type: userTypeFilter.default("regular"),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const { search, status, type, limit, offset } = input;

      const conditions = [];

      if (status === "active") {
        conditions.push(isNull(schema.user.deletedAt));
        conditions.push(isNull(schema.user.suspendedAt));
        conditions.push(eq(schema.profiles.isComplete, true));
      } else if (status === "onboarding") {
        conditions.push(isNull(schema.user.deletedAt));
        conditions.push(isNull(schema.user.suspendedAt));
        conditions.push(eq(schema.profiles.isComplete, false));
      } else if (status === "deleted") {
        conditions.push(isNotNull(schema.user.deletedAt));
      } else if (status === "suspended") {
        // Exclude rows that are also soft-deleted — the list's status ternary
        // resolves those to "Usunięty", so they don't belong in this filter.
        conditions.push(isNotNull(schema.user.suspendedAt));
        conditions.push(isNull(schema.user.deletedAt));
      }

      if (type !== "all") {
        conditions.push(eq(schema.user.type, type));
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

      const rows = await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
          type: schema.user.type,
          createdAt: schema.user.createdAt,
          deletedAt: schema.user.deletedAt,
          suspendedAt: schema.user.suspendedAt,
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
          status: row.deletedAt
            ? ("deleted" as const)
            : row.suspendedAt
              ? ("suspended" as const)
              : row.isComplete
                ? ("active" as const)
                : ("onboarding" as const),
        })),
        total,
      };
    }),

  getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const row = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        type: schema.user.type,
        createdAt: schema.user.createdAt,
        updatedAt: schema.user.updatedAt,
        deletedAt: schema.user.deletedAt,
        anonymizedAt: schema.user.anonymizedAt,
        suspendedAt: schema.user.suspendedAt,
        suspendReason: schema.user.suspendReason,
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

  softDelete: protectedProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    await enqueueOpsAndWait("admin-soft-delete-user", {
      type: "admin-soft-delete-user",
      userId: input.userId,
    });
    return { ok: true };
  }),

  restore: protectedProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    await enqueueOpsAndWait("admin-restore-user", {
      type: "admin-restore-user",
      userId: input.userId,
    });
    return { ok: true };
  }),

  reanalyze: protectedProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    const profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, input.userId),
      columns: { latitude: true, longitude: true },
    });

    if (!profile?.latitude || !profile?.longitude) {
      throw new Error("Użytkownik nie ma udostępnionej lokalizacji");
    }

    await enqueueAiAndWait("analyze-user-pairs", {
      type: "analyze-user-pairs",
      userId: input.userId,
      latitude: profile.latitude,
      longitude: profile.longitude,
      radiusMeters: 5000,
    });
    return { ok: true };
  }),

  regenerateProfile: protectedProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    const profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, input.userId),
      columns: { bio: true, lookingFor: true, latitude: true, longitude: true },
    });

    if (!profile) {
      throw new Error("Profil nie znaleziony");
    }

    await enqueueAiAndWait("generate-profile-ai", {
      type: "generate-profile-ai",
      userId: input.userId,
      bio: profile.bio ?? "",
      lookingFor: profile.lookingFor ?? "",
    });

    if (profile.latitude && profile.longitude) {
      await enqueueAiAndWait("analyze-user-pairs", {
        type: "analyze-user-pairs",
        userId: input.userId,
        latitude: profile.latitude,
        longitude: profile.longitude,
        radiusMeters: 5000,
      });
    }

    return { ok: true };
  }),

  forceDisconnect: protectedProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    await enqueueOpsAndWait("admin-force-disconnect", {
      type: "admin-force-disconnect",
      userId: input.userId,
    });
    return { ok: true };
  }),

  suspend: protectedProcedure
    .input(z.object({ userId: z.string(), reason: z.string().trim().min(3).max(500) }))
    .mutation(async ({ input }) => {
      await enqueueOpsAndWait("admin-suspend-user", {
        type: "admin-suspend-user",
        userId: input.userId,
        reason: input.reason,
      });
      return { ok: true };
    }),

  unsuspend: protectedProcedure.input(z.object({ userId: z.string() })).mutation(async ({ input }) => {
    await enqueueOpsAndWait("admin-unsuspend-user", {
      type: "admin-unsuspend-user",
      userId: input.userId,
    });
    return { ok: true };
  }),

  // Change user.type (BLI-271). Primary use: provision Apple/Google store review
  // accounts (flip from 'regular' to 'review') without SQL. Also used to demote
  // accidentally-created fixtures back to regular during manual debugging.
  updateType: protectedProcedure
    .input(z.object({ userId: z.string(), type: userTypeEnum }))
    .mutation(async ({ input }) => {
      await db.update(schema.user).set({ type: input.type }).where(eq(schema.user.id, input.userId));
      return { ok: true };
    }),

  stats: protectedProcedure.query(async () => {
    // Per-type counts — BLI-271 replaced the prior email-LIKE real/seed split.
    // Active/onboarding still scoped to regular users only.
    const perType = await db
      .select({ type: schema.user.type, count: count() })
      .from(schema.user)
      .groupBy(schema.user.type);

    const byType = Object.fromEntries(USER_TYPES.map((t) => [t, 0])) as Record<(typeof USER_TYPES)[number], number>;
    for (const row of perType) {
      if (row.type in byType) byType[row.type] = row.count;
    }

    const regularFilter = eq(schema.user.type, "regular");

    const [activeUsers] = await db
      .select({ count: count() })
      .from(schema.user)
      .innerJoin(schema.profiles, eq(schema.user.id, schema.profiles.userId))
      .where(
        and(
          isNull(schema.user.deletedAt),
          isNull(schema.user.suspendedAt),
          eq(schema.profiles.isComplete, true),
          regularFilter,
        ),
      );

    const [onboardingUsers] = await db
      .select({ count: count() })
      .from(schema.user)
      .innerJoin(schema.profiles, eq(schema.user.id, schema.profiles.userId))
      .where(
        and(
          isNull(schema.user.deletedAt),
          isNull(schema.user.suspendedAt),
          eq(schema.profiles.isComplete, false),
          regularFilter,
        ),
      );

    return {
      ...byType,
      active: activeUsers.count,
      onboarding: onboardingUsers.count,
    };
  }),
});
