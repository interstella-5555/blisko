import {
  cosineSimilarity,
  createProfileSchema,
  getNearbyUsersForMapSchema,
  getNearbyUsersSchema,
  setStatusSchema,
  updateLocationSchema,
  updateProfileSchema,
} from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { and, between, eq, isNotNull, isNull, lte, ne, notInArray, placeholder, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { roundDistance, toGridCenter } from "@/lib/grid";
import { moderateContent } from "@/services/moderation";
import {
  enqueuePairAnalysis,
  enqueueProfileAI,
  enqueueStatusMatching,
  enqueueUserPairAnalysis,
} from "@/services/queue";
import { rateLimit } from "@/trpc/middleware/rateLimit";
import { protectedProcedure, router } from "@/trpc/trpc";
import { ee } from "@/ws/events";

// Prepared statement — compiled once, reused on every profiles.me call
const profileByUserId = db
  .select()
  .from(schema.profiles)
  .where(eq(schema.profiles.userId, placeholder("userId")))
  .prepare("profile_by_user_id");

export const profilesRouter = router({
  // Get current user's profile
  me: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await profileByUserId.execute({ userId: ctx.userId });

    return profile || null;
  }),

  // Create profile (async — AI fields populate via queue worker)
  create: protectedProcedure.input(createProfileSchema).mutation(async ({ ctx, input }) => {
    const [existing] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, ctx.userId));

    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "Profile already exists" });
    }

    await moderateContent([input.displayName, input.bio, input.lookingFor].join("\n\n"));

    // Pull avatar from user.image (set by OAuth provider on signup)
    const [authUser] = await db
      .select({ image: schema.user.image })
      .from(schema.user)
      .where(eq(schema.user.id, ctx.userId));

    const [profile] = await db
      .insert(schema.profiles)
      .values({
        userId: ctx.userId,
        displayName: input.displayName,
        bio: input.bio,
        lookingFor: input.lookingFor,
        ...(authUser?.image ? { avatarUrl: authUser.image } : {}),
      })
      .returning();

    // Enqueue AI generation (portrait, embedding, interests)
    // WS event 'profileReady' will fire when done
    enqueueProfileAI(ctx.userId, input.bio, input.lookingFor).catch((err) => {
      console.error("[profiles] Failed to enqueue profile AI job:", err);
    });

    return profile;
  }),

  // Update profile (async — AI regeneration via queue if bio/lookingFor changed)
  update: protectedProcedure
    .use(rateLimit("profiles.update"))
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const fieldsToModerate = [input.displayName, input.bio, input.lookingFor].filter(Boolean);
      if (fieldsToModerate.length > 0) {
        await moderateContent(fieldsToModerate.join("\n\n"));
      }

      const [profile] = await db
        .update(schema.profiles)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(schema.profiles.userId, ctx.userId))
        .returning();

      // If bio or lookingFor changed, re-run AI pipeline async
      if (input.bio || input.lookingFor) {
        const bio = profile.bio;
        const lookingFor = profile.lookingFor;
        enqueueProfileAI(ctx.userId, bio, lookingFor).catch((err) => {
          console.error("[profiles] Failed to enqueue profile AI job:", err);
        });

        // Also re-analyze connections (profile changed → analyses stale)
        if (profile.latitude && profile.longitude) {
          enqueueUserPairAnalysis(ctx.userId, profile.latitude, profile.longitude).catch(() => {});
        }
      }

      return profile;
    }),

  // Update location
  updateLocation: protectedProcedure.input(updateLocationSchema).mutation(async ({ ctx, input }) => {
    const [profile] = await db
      .update(schema.profiles)
      .set({
        latitude: input.latitude,
        longitude: input.longitude,
        lastLocationUpdate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.profiles.userId, ctx.userId))
      .returning();

    // Queue connection analyses for new location
    if (!input.skipAnalysis) {
      enqueueUserPairAnalysis(ctx.userId, input.latitude, input.longitude).catch(() => {});
    }

    // Notify nearby users that someone's location changed
    const radiusMeters = 5000;
    const latDelta = radiusMeters / 111000;
    const lonDelta = radiusMeters / (111000 * Math.cos((input.latitude * Math.PI) / 180));

    db.select({ userId: schema.profiles.userId })
      .from(schema.profiles)
      .where(
        and(
          ne(schema.profiles.userId, ctx.userId),
          eq(schema.profiles.visibilityMode, "visible"),
          between(schema.profiles.latitude, input.latitude - latDelta, input.latitude + latDelta),
          between(schema.profiles.longitude, input.longitude - lonDelta, input.longitude + lonDelta),
          notInArray(
            schema.profiles.userId,
            db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
          ),
        ),
      )
      .then((nearbyUsers) => {
        for (const u of nearbyUsers) {
          ee.emit("nearbyChanged", { forUserId: u.userId });
        }
      })
      .catch(() => {});

    return profile;
  }),

  // Get nearby users
  getNearbyUsers: protectedProcedure
    .use(rateLimit("profiles.getNearby"))
    .input(getNearbyUsersSchema)
    .query(async ({ ctx, input }) => {
      const { latitude, longitude, radiusMeters, limit } = input;

      // Calculate bounding box for initial filter (uses index!)
      // ~111km per degree latitude, longitude varies by latitude
      const latDelta = radiusMeters / 111000;
      const lonDelta = radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLon = longitude - lonDelta;
      const maxLon = longitude + lonDelta;

      // Get blocked users and current profile in parallel
      const [blockedUsers, blockedByUsers, currentProfileResult] = await Promise.all([
        db
          .select({ blockedId: schema.blocks.blockedId })
          .from(schema.blocks)
          .where(eq(schema.blocks.blockerId, ctx.userId)),
        db
          .select({ blockerId: schema.blocks.blockerId })
          .from(schema.blocks)
          .where(eq(schema.blocks.blockedId, ctx.userId)),
        db.select().from(schema.profiles).where(eq(schema.profiles.userId, ctx.userId)),
      ]);

      const allBlockedIds = new Set([
        ...blockedUsers.map((b) => b.blockedId),
        ...blockedByUsers.map((b) => b.blockerId),
      ]);

      const currentProfile = currentProfileResult[0];

      // Query with bounding box filter first (fast, uses index)
      // Then calculate exact Haversine distance
      const distanceFormula = sql<number>`
        6371000 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${latitude})) * cos(radians(${schema.profiles.latitude})) *
            cos(radians(${schema.profiles.longitude}) - radians(${longitude})) +
            sin(radians(${latitude})) * sin(radians(${schema.profiles.latitude}))
          ))
        )
      `;

      const nearbyUsers = await db
        .select({
          profile: schema.profiles,
          distance: distanceFormula,
        })
        .from(schema.profiles)
        .where(
          and(
            ne(schema.profiles.userId, ctx.userId),
            eq(schema.profiles.visibilityMode, "visible"),
            // Bounding box filter (uses index)
            between(schema.profiles.latitude, minLat, maxLat),
            between(schema.profiles.longitude, minLon, maxLon),
            // Exact distance filter
            lte(distanceFormula, radiusMeters),
            notInArray(
              schema.profiles.userId,
              db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
            ),
            ...(input.photoOnly ? [isNotNull(schema.profiles.avatarUrl)] : []),
          ),
        )
        .orderBy(distanceFormula)
        .limit(limit + allBlockedIds.size); // Fetch extra to account for filtered

      // Filter blocked and calculate similarity in one pass
      const results = [];
      for (const u of nearbyUsers) {
        if (allBlockedIds.has(u.profile.userId)) continue;
        if (results.length >= limit) break;

        let similarityScore: number | null = null;
        if (currentProfile?.embedding && u.profile.embedding) {
          similarityScore = cosineSimilarity(currentProfile.embedding, u.profile.embedding);
        }

        results.push({
          profile: u.profile,
          distance: u.distance,
          similarityScore,
        });
      }

      return results;
    }),

  // Get nearby users for map view (with grid-based privacy + ranking)
  getNearbyUsersForMap: protectedProcedure
    .use(rateLimit("profiles.getNearby"))
    .input(getNearbyUsersForMapSchema)
    .query(async ({ ctx, input }) => {
      const { latitude, longitude, radiusMeters, limit, cursor } = input;
      const offset = cursor ?? 0;

      // Calculate bounding box for initial filter (uses index!)
      const latDelta = radiusMeters / 111000;
      const lonDelta = radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLon = longitude - lonDelta;
      const maxLon = longitude + lonDelta;

      // Haversine distance formula
      const distanceFormula = sql<number>`
        6371000 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${latitude})) * cos(radians(${schema.profiles.latitude})) *
            cos(radians(${schema.profiles.longitude}) - radians(${longitude})) +
            sin(radians(${latitude})) * sin(radians(${schema.profiles.latitude}))
          ))
        )
      `;

      // Base WHERE conditions (reused for count + paginated query)
      const baseWhere = and(
        ne(schema.profiles.userId, ctx.userId),
        eq(schema.profiles.visibilityMode, "visible"),
        between(schema.profiles.latitude, minLat, maxLat),
        between(schema.profiles.longitude, minLon, maxLon),
        lte(distanceFormula, radiusMeters),
        notInArray(
          schema.profiles.userId,
          db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
        ),
        ...(input.photoOnly ? [isNotNull(schema.profiles.avatarUrl)] : []),
      );

      // Get blocked users + current profile + analyses + status matches + totalCount in parallel
      const [blockedUsers, blockedByUsers, currentProfileResult, analyses, myStatusMatchRows, countResult] =
        await Promise.all([
          db
            .select({ blockedId: schema.blocks.blockedId })
            .from(schema.blocks)
            .where(eq(schema.blocks.blockerId, ctx.userId)),
          db
            .select({ blockerId: schema.blocks.blockerId })
            .from(schema.blocks)
            .where(eq(schema.blocks.blockedId, ctx.userId)),
          db.select().from(schema.profiles).where(eq(schema.profiles.userId, ctx.userId)),
          db.select().from(schema.connectionAnalyses).where(eq(schema.connectionAnalyses.fromUserId, ctx.userId)),
          db.select().from(schema.statusMatches).where(eq(schema.statusMatches.userId, ctx.userId)),
          db.select({ count: sql<number>`count(*)` }).from(schema.profiles).where(baseWhere),
        ]);

      const allBlockedIds = new Set([
        ...blockedUsers.map((b) => b.blockedId),
        ...blockedByUsers.map((b) => b.blockerId),
      ]);

      const rawCount = Number(countResult[0]?.count ?? 0);
      // Subtract blocked users from count (approximate — blocked users may not all be in range)
      const totalCount = Math.max(0, rawCount - allBlockedIds.size);

      const currentProfile = currentProfileResult[0];

      const analysisMap = new Map(analyses.map((a) => [a.toUserId, a]));

      const statusMatchMap = new Map(
        myStatusMatchRows.map((m) => [m.matchedUserId, { reason: m.reason, matchedVia: m.matchedVia }]),
      );

      const now = new Date();
      const myStatusActive =
        currentProfile?.currentStatus && (!currentProfile.statusExpiresAt || currentProfile.statusExpiresAt > now);

      // Fetch extra rows to account for blocked users being filtered out
      const nearbyUsers = await db
        .select({
          profile: schema.profiles,
          distance: distanceFormula,
        })
        .from(schema.profiles)
        .where(baseWhere)
        .orderBy(distanceFormula)
        .limit(limit + allBlockedIds.size)
        .offset(offset);

      const myInterests = currentProfile?.interests ?? [];
      const myEmbedding = currentProfile?.embedding ?? null;

      // Filter blocked users, calculate ranking, add grid positions
      const results = [];
      for (const u of nearbyUsers) {
        if (allBlockedIds.has(u.profile.userId)) continue;
        if (results.length >= limit) break;

        const gridPos = toGridCenter(u.profile.latitude!, u.profile.longitude!);

        // Ranking calculation
        const proximity = 1 - Math.min(u.distance, radiusMeters) / radiusMeters;

        const analysis = analysisMap.get(u.profile.userId);

        let similarity: number | null = null;
        if (myEmbedding?.length && u.profile.embedding?.length) {
          similarity = cosineSimilarity(myEmbedding, u.profile.embedding);
        }

        const theirInterests = u.profile.interests ?? [];
        const commonInterests = myInterests.filter((i) => theirInterests.includes(i));
        const interestScore = myInterests.length > 0 ? commonInterests.length / myInterests.length : 0;

        // Use AI score when available, fallback to embedding + interests
        const matchScore = analysis
          ? analysis.aiMatchScore / 100
          : similarity != null
            ? 0.7 * similarity + 0.3 * interestScore
            : interestScore;
        const rankScore = 0.6 * matchScore + 0.4 * proximity;

        results.push({
          profile: {
            id: u.profile.id,
            userId: u.profile.userId,
            displayName: u.profile.displayName,
            bio: u.profile.bio,
            lookingFor: u.profile.lookingFor,
            avatarUrl: u.profile.avatarUrl,
          },
          distance: roundDistance(u.distance),
          gridLat: gridPos.gridLat,
          gridLng: gridPos.gridLng,
          gridId: gridPos.gridId,
          rankScore: Math.round(rankScore * 100) / 100,
          matchScore: Math.round(matchScore * 100),
          commonInterests,
          shortSnippet: analysis?.shortSnippet ?? null,
          analysisReady: !!analysis,
          statusMatch:
            myStatusActive && u.profile.currentStatus && (!u.profile.statusExpiresAt || u.profile.statusExpiresAt > now)
              ? (statusMatchMap.get(u.profile.userId) ?? null)
              : null,
        });
      }

      // Sort by rankScore descending
      results.sort((a, b) => b.rankScore - a.rankScore);

      // Safety net: queue analyses for users without one
      const missingAnalysisUserIds = results
        .filter((r) => !analysisMap.has(r.profile.userId))
        .map((r) => r.profile.userId);

      for (const theirUserId of missingAnalysisUserIds) {
        enqueuePairAnalysis(ctx.userId, theirUserId).catch(() => {});
      }

      const nextCursor = offset + limit < totalCount ? offset + limit : null;

      const myStatus = myStatusActive
        ? {
            text: currentProfile!.currentStatus!,
            expiresAt: currentProfile!.statusExpiresAt?.toISOString() ?? null,
            setAt: currentProfile!.statusSetAt?.toISOString() ?? null,
          }
        : null;

      return { users: results, totalCount, nextCursor, myStatus };
    }),

  // Ensure analysis exists — lightweight "poke" to re-enqueue if stuck/failed
  ensureAnalysis: protectedProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select({ id: schema.connectionAnalyses.id })
      .from(schema.connectionAnalyses)
      .where(
        and(eq(schema.connectionAnalyses.fromUserId, ctx.userId), eq(schema.connectionAnalyses.toUserId, input.userId)),
      );
    if (existing) return { status: "ready" as const };

    await enqueuePairAnalysis(ctx.userId, input.userId);
    return { status: "queued" as const };
  }),

  // Get AI connection analysis for a specific user
  getConnectionAnalysis: protectedProcedure.input(z.object({ userId: z.string() })).query(async ({ ctx, input }) => {
    // Return null if either user has incomplete profile
    const [myProfile] = await db
      .select({ isComplete: schema.profiles.isComplete })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, ctx.userId));
    if (!myProfile?.isComplete) return null;

    const [theirProfile] = await db
      .select({ isComplete: schema.profiles.isComplete })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, input.userId));
    if (!theirProfile?.isComplete) return null;

    const [analysis] = await db
      .select()
      .from(schema.connectionAnalyses)
      .where(
        and(eq(schema.connectionAnalyses.fromUserId, ctx.userId), eq(schema.connectionAnalyses.toUserId, input.userId)),
      );

    return analysis
      ? {
          shortSnippet: analysis.shortSnippet,
          longDescription: analysis.longDescription,
          aiMatchScore: analysis.aiMatchScore,
        }
      : null;
  }),

  // Get profile by user ID
  getById: protectedProcedure.input(z.object({ userId: z.string() })).query(async ({ input }) => {
    const [result] = await db
      .select({ profile: schema.profiles })
      .from(schema.profiles)
      .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
      .where(and(eq(schema.profiles.userId, input.userId), isNull(schema.user.deletedAt)));
    const profile = result?.profile;

    if (!profile) return null;

    // Lazy expiry check — treat expired status as null
    const now = new Date();
    const hasActiveStatus = profile.currentStatus && (!profile.statusExpiresAt || profile.statusExpiresAt > now);

    return {
      ...profile,
      currentStatus: hasActiveStatus ? profile.currentStatus : null,
      statusExpiresAt: hasActiveStatus ? profile.statusExpiresAt : null,
      statusSetAt: hasActiveStatus ? profile.statusSetAt : null,
    };
  }),

  // Dev: clear all connection analyses
  clearAnalyses: protectedProcedure.mutation(async () => {
    await db.execute(sql`TRUNCATE connection_analyses`);
    return { ok: true };
  }),

  // Dev: re-trigger connection analyses for current user
  reanalyze: protectedProcedure.mutation(async ({ ctx }) => {
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, ctx.userId));

    if (!profile?.latitude || !profile?.longitude) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Profile has no location set",
      });
    }

    await enqueueUserPairAnalysis(ctx.userId, profile.latitude, profile.longitude);
    return { ok: true };
  }),

  // Set status "na teraz"
  setStatus: protectedProcedure.input(setStatusSchema).mutation(async ({ ctx, input }) => {
    await moderateContent(input.text);

    const expiresAt =
      input.expiresIn === "never"
        ? null
        : new Date(Date.now() + { "1h": 3600000, "6h": 21600000, "24h": 86400000 }[input.expiresIn]);

    const [profile] = await db
      .update(schema.profiles)
      .set({
        currentStatus: input.text,
        statusExpiresAt: expiresAt,
        statusSetAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.profiles.userId, ctx.userId))
      .returning();

    if (profile.isComplete) {
      enqueueStatusMatching(ctx.userId).catch((err) => {
        console.error("[profiles] Failed to enqueue status matching:", err);
      });
    }

    return profile;
  }),

  // Clear status "na teraz"
  clearStatus: protectedProcedure.mutation(async ({ ctx }) => {
    const [profile] = await db
      .update(schema.profiles)
      .set({
        currentStatus: null,
        statusExpiresAt: null,
        statusEmbedding: null,
        statusSetAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.profiles.userId, ctx.userId))
      .returning();

    await db.delete(schema.statusMatches).where(eq(schema.statusMatches.userId, ctx.userId));

    return profile;
  }),

  // Get my status matches
  getMyStatusMatches: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(schema.statusMatches).where(eq(schema.statusMatches.userId, ctx.userId));
  }),
});
