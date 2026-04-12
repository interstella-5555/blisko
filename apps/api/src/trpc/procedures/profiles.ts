import {
  cosineSimilarity,
  createProfileSchema,
  getNearbyMapMarkersSchema,
  getNearbyUsersForMapSchema,
  getNearbyUsersSchema,
  setStatusSchema,
  updateLocationSchema,
  updateProfileSchema,
} from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { differenceInMinutes, subHours } from "date-fns";
import { and, between, eq, gte, isNotNull, isNull, lte, ne, or, placeholder, sql } from "drizzle-orm";
import { z } from "zod";
import { DECLINE_COOLDOWN_HOURS } from "@/config/pingLimits";
import { db, preparedName, schema } from "@/db";
import { roundDistance, toGridCenter } from "@/lib/grid";
import { isStatusActive, isStatusPublic } from "@/lib/status";
import { setTargetUserId } from "@/services/metrics";
import { moderateContent } from "@/services/moderation";
import {
  enqueuePairAnalysis,
  enqueueProfileAI,
  enqueueProximityStatusMatching,
  enqueueQuickScore,
  enqueueStatusMatching,
  enqueueUserPairAnalysis,
  promotePairAnalysis,
} from "@/services/queue";
import { rateLimit } from "@/trpc/middleware/rateLimit";
import { protectedProcedure, router } from "@/trpc/trpc";
import { publishEvent } from "@/ws/redis-bridge";

// Prepared statement — compiled once, reused on every profiles.me call
const profileByUserId = db
  .select()
  .from(schema.profiles)
  .where(eq(schema.profiles.userId, placeholder("userId")))
  .prepare(preparedName("profile_by_user_id"));

export const profilesRouter = router({
  // Get current user's profile
  me: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await profileByUserId.execute({ userId: ctx.userId });

    return profile || null;
  }),

  // Create profile (async — AI fields populate via queue worker)
  create: protectedProcedure.input(createProfileSchema).mutation(async ({ ctx, input }) => {
    const existing = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, ctx.userId),
    });

    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "Profile already exists" });
    }

    await moderateContent([input.displayName, input.bio, input.lookingFor].join("\n\n"));

    // Pull avatar from user.image (set by OAuth provider on signup)
    const authUser = await db.query.user.findFirst({
      where: eq(schema.user.id, ctx.userId),
      columns: { image: true },
    });

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
      // Lock displayName after initial setup (5 min grace period)
      if (input.displayName) {
        const existing = await db.query.profiles.findFirst({
          where: eq(schema.profiles.userId, ctx.userId),
          columns: { displayName: true, createdAt: true },
        });
        const graceExpired = existing && differenceInMinutes(new Date(), existing.createdAt) > 5;
        if (graceExpired && existing.displayName !== input.displayName) {
          throw new TRPCError({ code: "FORBIDDEN", message: "display_name_locked" });
        }
      }

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

      // If bio or lookingFor changed, re-run AI pipeline (debounced 30s by BullMQ)
      if (input.bio || input.lookingFor) {
        const bio = profile.bio;
        const lookingFor = profile.lookingFor;
        await enqueueProfileAI(ctx.userId, bio, lookingFor);

        // Also re-analyze connections (profile changed → analyses stale)
        if (profile.latitude && profile.longitude) {
          await enqueueUserPairAnalysis(ctx.userId, profile.latitude, profile.longitude);
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

    // Proximity status matching on location change (debounced 2m by BullMQ)
    if (!input.skipAnalysis) {
      enqueueProximityStatusMatching(ctx.userId, input.latitude, input.longitude).catch(() => {});
    }

    // Notify nearby users that someone's location changed (fire-and-forget — don't fail current user)
    const radiusMeters = 5000;
    const latDelta = radiusMeters / 111000;
    const lonDelta = radiusMeters / (111000 * Math.cos((input.latitude * Math.PI) / 180));

    db.select({ userId: schema.profiles.userId })
      .from(schema.profiles)
      .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
      .where(
        and(
          ne(schema.profiles.userId, ctx.userId),
          ne(schema.profiles.visibilityMode, "ninja"),
          between(schema.profiles.latitude, input.latitude - latDelta, input.latitude + latDelta),
          between(schema.profiles.longitude, input.longitude - lonDelta, input.longitude + lonDelta),
          isNull(schema.user.deletedAt),
        ),
      )
      .then((nearbyUsers) => {
        for (const u of nearbyUsers) {
          publishEvent("nearbyChanged", { forUserId: u.userId });
        }
      })
      .catch((err) => {
        console.error("[profiles] Failed to broadcast nearbyChanged:", err);
      });

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
      const [blockedUsers, blockedByUsers, currentProfile] = await Promise.all([
        db
          .select({ blockedId: schema.blocks.blockedId })
          .from(schema.blocks)
          .where(eq(schema.blocks.blockerId, ctx.userId)),
        db
          .select({ blockerId: schema.blocks.blockerId })
          .from(schema.blocks)
          .where(eq(schema.blocks.blockedId, ctx.userId)),
        db.query.profiles.findFirst({
          where: eq(schema.profiles.userId, ctx.userId),
        }),
      ]);

      const allBlockedIds = new Set([
        ...blockedUsers.map((b) => b.blockedId),
        ...blockedByUsers.map((b) => b.blockerId),
      ]);

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
        .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
        .where(
          and(
            ne(schema.profiles.userId, ctx.userId),
            ne(schema.profiles.visibilityMode, "ninja"),
            // Bounding box filter (uses index)
            between(schema.profiles.latitude, minLat, maxLat),
            between(schema.profiles.longitude, minLon, maxLon),
            // Exact distance filter
            lte(distanceFormula, radiusMeters),
            isNull(schema.user.deletedAt),
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

  // Lightweight map markers — all users in radius with minimal data (no scoring, no embeddings)
  getNearbyMapMarkers: protectedProcedure
    .use(rateLimit("profiles.getNearbyMap"))
    .input(getNearbyMapMarkersSchema)
    .query(async ({ ctx, input }) => {
      const { latitude, longitude, radiusMeters, photoOnly } = input;

      // Bounding box for index-based pre-filter
      const latDelta = radiusMeters / 111000;
      const lonDelta = radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));
      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLon = longitude - lonDelta;
      const maxLon = longitude + lonDelta;

      // Haversine distance
      const distanceFormula = sql<number>`
        6371000 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${latitude})) * cos(radians(${schema.profiles.latitude})) *
            cos(radians(${schema.profiles.longitude}) - radians(${longitude})) +
            sin(radians(${latitude})) * sin(radians(${schema.profiles.latitude}))
          ))
        )
      `;

      // Haversine for group locations (conversations table)
      const groupDistanceFormula = sql<number>`
        6371000 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${latitude})) * cos(radians(${schema.conversations.latitude})) *
            cos(radians(${schema.conversations.longitude}) - radians(${longitude})) +
            sin(radians(${latitude})) * sin(radians(${schema.conversations.latitude}))
          ))
        )
      `;

      // Parallel: blocked users (both directions), nearby profiles, current user profile, status matches, discoverable groups
      const [blockedUsers, blockedByUsers, nearbyProfiles, currentProfile, myStatusMatchRows, nearbyGroups] =
        await Promise.all([
          db
            .select({ blockedId: schema.blocks.blockedId })
            .from(schema.blocks)
            .where(eq(schema.blocks.blockerId, ctx.userId)),
          db
            .select({ blockerId: schema.blocks.blockerId })
            .from(schema.blocks)
            .where(eq(schema.blocks.blockedId, ctx.userId)),
          db
            .select({
              userId: schema.profiles.userId,
              displayName: schema.profiles.displayName,
              avatarUrl: schema.profiles.avatarUrl,
              latitude: schema.profiles.latitude,
              longitude: schema.profiles.longitude,
              currentStatus: schema.profiles.currentStatus,
              statusVisibility: schema.profiles.statusVisibility,
            })
            .from(schema.profiles)
            .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
            .where(
              and(
                ne(schema.profiles.userId, ctx.userId),
                ne(schema.profiles.visibilityMode, "ninja"),
                between(schema.profiles.latitude, minLat, maxLat),
                between(schema.profiles.longitude, minLon, maxLon),
                lte(distanceFormula, radiusMeters),
                isNull(schema.user.deletedAt),
                ...(photoOnly ? [isNotNull(schema.profiles.avatarUrl)] : []),
              ),
            )
            .limit(5000),
          db.query.profiles.findFirst({
            where: eq(schema.profiles.userId, ctx.userId),
            columns: { currentStatus: true },
          }),
          db
            .select({ matchedUserId: schema.statusMatches.matchedUserId })
            .from(schema.statusMatches)
            .where(eq(schema.statusMatches.userId, ctx.userId)),
          db
            .select({
              id: schema.conversations.id,
              name: schema.conversations.name,
              avatarUrl: schema.conversations.avatarUrl,
              latitude: schema.conversations.latitude,
              longitude: schema.conversations.longitude,
            })
            .from(schema.conversations)
            .where(
              and(
                eq(schema.conversations.type, "group"),
                eq(schema.conversations.isDiscoverable, true),
                isNull(schema.conversations.deletedAt),
                isNotNull(schema.conversations.latitude),
                isNotNull(schema.conversations.longitude),
                between(schema.conversations.latitude, minLat, maxLat),
                between(schema.conversations.longitude, minLon, maxLon),
                lte(groupDistanceFormula, radiusMeters),
              ),
            )
            .limit(500),
        ]);

      const allBlockedIds = new Set([
        ...blockedUsers.map((b) => b.blockedId),
        ...blockedByUsers.map((b) => b.blockerId),
      ]);

      const statusMatchSet = new Set(myStatusMatchRows.map((m) => m.matchedUserId));
      const myStatusActive = currentProfile ? isStatusActive(currentProfile) : false;

      // Build columnar user response
      const ids: string[] = [];
      const names: string[] = [];
      const avatars: (string | null)[] = [];
      const lats: number[] = [];
      const lngs: number[] = [];
      const statusMatch: (0 | 1)[] = [];

      for (const u of nearbyProfiles) {
        if (allBlockedIds.has(u.userId)) continue;

        ids.push(u.userId);
        names.push(u.displayName ?? "");
        avatars.push(u.avatarUrl ? u.avatarUrl : null);
        lats.push(u.latitude!);
        lngs.push(u.longitude!);

        const theirStatusActive = isStatusActive(u);
        statusMatch.push(myStatusActive && theirStatusActive && statusMatchSet.has(u.userId) ? 1 : 0);
      }

      // Build columnar group response
      const groupIds: string[] = [];
      const groupNames: (string | null)[] = [];
      const groupAvatars: (string | null)[] = [];
      const groupLats: number[] = [];
      const groupLngs: number[] = [];
      const groupMembers: number[] = [];

      for (const g of nearbyGroups) {
        groupIds.push(g.id);
        groupNames.push(g.name);
        groupAvatars.push(g.avatarUrl ? g.avatarUrl : null);
        groupLats.push(g.latitude!);
        groupLngs.push(g.longitude!);
        groupMembers.push(0);
      }

      return {
        users: { ids, names, avatars, lats, lngs, statusMatch },
        groups: {
          ids: groupIds,
          names: groupNames,
          avatars: groupAvatars,
          lats: groupLats,
          lngs: groupLngs,
          members: groupMembers,
        },
      };
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

      // When bbox provided, intersect viewport with radius bounding box
      const effectiveMinLat = input.bbox ? Math.max(minLat, input.bbox.south) : minLat;
      const effectiveMaxLat = input.bbox ? Math.min(maxLat, input.bbox.north) : maxLat;
      const effectiveMinLon = input.bbox ? Math.max(minLon, input.bbox.west) : minLon;
      const effectiveMaxLon = input.bbox ? Math.min(maxLon, input.bbox.east) : maxLon;

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
        ne(schema.profiles.visibilityMode, "ninja"),
        between(schema.profiles.latitude, effectiveMinLat, effectiveMaxLat),
        between(schema.profiles.longitude, effectiveMinLon, effectiveMaxLon),
        lte(distanceFormula, radiusMeters),
        isNull(schema.user.deletedAt),
        ...(input.photoOnly ? [isNotNull(schema.profiles.avatarUrl)] : []),
      );

      // Get blocked users + cooldown users + current profile + analyses + status matches + totalCount in parallel
      const cooldownCutoff = subHours(new Date(), DECLINE_COOLDOWN_HOURS);
      const [blockedUsers, blockedByUsers, cooldownDeclines, currentProfile, analyses, myStatusMatchRows, countResult] =
        await Promise.all([
          db
            .select({ blockedId: schema.blocks.blockedId })
            .from(schema.blocks)
            .where(eq(schema.blocks.blockerId, ctx.userId)),
          db
            .select({ blockerId: schema.blocks.blockerId })
            .from(schema.blocks)
            .where(eq(schema.blocks.blockedId, ctx.userId)),
          db
            .select({ toUserId: schema.waves.toUserId })
            .from(schema.waves)
            .where(
              and(
                eq(schema.waves.fromUserId, ctx.userId),
                eq(schema.waves.status, "declined"),
                gte(schema.waves.respondedAt, cooldownCutoff),
              ),
            ),
          db.query.profiles.findFirst({
            where: eq(schema.profiles.userId, ctx.userId),
          }),
          db.query.connectionAnalyses.findMany({
            where: eq(schema.connectionAnalyses.fromUserId, ctx.userId),
            columns: { toUserId: true, aiMatchScore: true, shortSnippet: true },
          }),
          db.query.statusMatches.findMany({
            where: eq(schema.statusMatches.userId, ctx.userId),
            columns: { matchedUserId: true, reason: true, matchedVia: true },
          }),
          db
            .select({ count: sql<number>`count(*)` })
            .from(schema.profiles)
            .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
            .where(baseWhere),
        ]);

      const allBlockedIds = new Set([
        ...blockedUsers.map((b) => b.blockedId),
        ...blockedByUsers.map((b) => b.blockerId),
        ...cooldownDeclines.map((d) => d.toUserId),
      ]);

      const rawCount = Number(countResult[0]?.count ?? 0);
      // Subtract blocked users from count (approximate — blocked users may not all be in range)
      const totalCount = Math.max(0, rawCount - allBlockedIds.size);

      const analysisMap = new Map(analyses.map((a) => [a.toUserId, a]));

      const statusMatchMap = new Map(
        myStatusMatchRows.map((m) => [m.matchedUserId, { reason: m.reason, matchedVia: m.matchedVia }]),
      );

      const myStatusActive = currentProfile ? isStatusActive(currentProfile) : false;

      // Fetch extra rows to account for blocked users being filtered out
      const nearbyUsers = await db
        .select({
          profile: schema.profiles,
          distance: distanceFormula,
        })
        .from(schema.profiles)
        .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
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

        const theirStatusActive = isStatusActive(u.profile);

        results.push({
          profile: {
            id: u.profile.id,
            userId: u.profile.userId,
            displayName: u.profile.displayName,
            bio: u.profile.bio,
            lookingFor: u.profile.lookingFor,
            avatarUrl: u.profile.avatarUrl,
            currentStatus: isStatusPublic(u.profile) ? u.profile.currentStatus : null,
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
          hasStatusMatch: myStatusActive && theirStatusActive && statusMatchMap.has(u.profile.userId),
        });
      }

      // Sort: status matches first, then rankScore descending
      results.sort((a, b) => {
        if (a.hasStatusMatch !== b.hasStatusMatch) return a.hasStatusMatch ? -1 : 1;
        return b.rankScore - a.rankScore;
      });

      // Safety net: queue T2 quick scores for users without any analysis
      const missingAnalysisUserIds = results
        .filter((r) => !analysisMap.has(r.profile.userId))
        .map((r) => r.profile.userId);

      for (const theirUserId of missingAnalysisUserIds) {
        enqueueQuickScore(ctx.userId, theirUserId).catch((err) => {
          console.error("[profiles] Failed to enqueue quick score:", err);
        });
      }

      const nextCursor = offset + limit < totalCount ? offset + limit : null;

      const myStatus = myStatusActive
        ? {
            text: currentProfile!.currentStatus!,
            setAt: currentProfile!.statusSetAt?.toISOString() ?? null,
          }
        : null;

      return { users: results, totalCount, nextCursor, myStatus };
    }),

  // Ensure T3 analysis exists — lightweight "poke" to re-enqueue if stuck/failed.
  // A T2 row is NOT "ready" — still promote to T3. Silent no-op for blocked/incomplete/
  // soft-deleted target (returns "ready") so mobile self-heal stops without revealing state.
  ensureAnalysis: protectedProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
    const block = await db.query.blocks.findFirst({
      where: or(
        and(eq(schema.blocks.blockerId, ctx.userId), eq(schema.blocks.blockedId, input.userId)),
        and(eq(schema.blocks.blockerId, input.userId), eq(schema.blocks.blockedId, ctx.userId)),
      ),
    });
    if (block) return { status: "ready" as const };

    const myProfile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, ctx.userId),
      columns: { isComplete: true },
    });
    if (!myProfile?.isComplete) return { status: "ready" as const };

    const [target] = await db
      .select({ isComplete: schema.profiles.isComplete })
      .from(schema.profiles)
      .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
      .where(and(eq(schema.profiles.userId, input.userId), isNull(schema.user.deletedAt)));
    if (!target?.isComplete) return { status: "ready" as const };

    const existing = await db.query.connectionAnalyses.findFirst({
      where: and(
        eq(schema.connectionAnalyses.fromUserId, ctx.userId),
        eq(schema.connectionAnalyses.toUserId, input.userId),
      ),
      columns: { tier: true },
    });
    if (existing?.tier === "t3") return { status: "ready" as const };

    await enqueuePairAnalysis(ctx.userId, input.userId);
    return { status: "queued" as const };
  }),

  // On-demand T3: return full analysis if ready, otherwise promote to top of queue.
  // Called from the profile modal on tap — this is the hot path that turns T2 rows into T3.
  getDetailedAnalysis: protectedProcedure.input(z.object({ userId: z.string() })).query(async ({ ctx, input }) => {
    const block = await db.query.blocks.findFirst({
      where: or(
        and(eq(schema.blocks.blockerId, ctx.userId), eq(schema.blocks.blockedId, input.userId)),
        and(eq(schema.blocks.blockerId, input.userId), eq(schema.blocks.blockedId, ctx.userId)),
      ),
    });
    if (block) return null;

    const myProfile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, ctx.userId),
      columns: { isComplete: true },
    });
    if (!myProfile?.isComplete) return null;

    // Soft-delete filter: inner-join user so a soft-deleted target disappears even if
    // the map query raced and handed the userId to mobile before the deletion landed.
    const [target] = await db
      .select({ isComplete: schema.profiles.isComplete })
      .from(schema.profiles)
      .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
      .where(and(eq(schema.profiles.userId, input.userId), isNull(schema.user.deletedAt)));
    if (!target?.isComplete) return null;

    const analysis = await db.query.connectionAnalyses.findFirst({
      where: and(
        eq(schema.connectionAnalyses.fromUserId, ctx.userId),
        eq(schema.connectionAnalyses.toUserId, input.userId),
      ),
      columns: { tier: true, shortSnippet: true, longDescription: true, aiMatchScore: true },
    });

    if (analysis?.tier === "t3") {
      return {
        status: "ready" as const,
        matchScore: analysis.aiMatchScore,
        shortSnippet: analysis.shortSnippet,
        longDescription: analysis.longDescription,
      };
    }

    // No T3 yet (either no row or T2 row) — promote to top of queue
    await promotePairAnalysis(ctx.userId, input.userId);
    return {
      status: "queued" as const,
      matchScore: analysis?.aiMatchScore ?? null,
    };
  }),

  // Get profile by user ID
  getById: protectedProcedure.input(z.object({ userId: z.string() })).query(async ({ ctx, input }) => {
    setTargetUserId(ctx.req, input.userId);

    // Block check — blocked users should not see each other's profiles
    if (input.userId !== ctx.userId) {
      const block = await db.query.blocks.findFirst({
        where: or(
          and(eq(schema.blocks.blockerId, ctx.userId), eq(schema.blocks.blockedId, input.userId)),
          and(eq(schema.blocks.blockerId, input.userId), eq(schema.blocks.blockedId, ctx.userId)),
        ),
      });
      if (block) return null;
    }

    const [result] = await db
      .select({ profile: schema.profiles })
      .from(schema.profiles)
      .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
      .where(and(eq(schema.profiles.userId, input.userId), isNull(schema.user.deletedAt)));
    const profile = result?.profile;

    if (!profile) return null;

    const isOwnProfile = input.userId === ctx.userId;
    const showStatus = isOwnProfile ? isStatusActive(profile) : isStatusPublic(profile);

    return {
      ...profile,
      currentStatus: showStatus ? profile.currentStatus : null,
      statusSetAt: showStatus ? profile.statusSetAt : null,
      statusVisibility: isOwnProfile ? profile.statusVisibility : null,
    };
  }),

  // Dev: clear all connection analyses (dev-only — disabled in production)
  clearAnalyses: protectedProcedure.mutation(async () => {
    if (process.env.NODE_ENV === "production") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Dev-only endpoint" });
    }
    // Raw SQL: TRUNCATE has no Drizzle query builder equivalent (dev-only endpoint)
    await db.execute(sql`TRUNCATE connection_analyses`);
    return { ok: true };
  }),

  // Dev: re-trigger connection analyses for current user (dev-only — disabled in production)
  reanalyze: protectedProcedure.mutation(async ({ ctx }) => {
    if (process.env.NODE_ENV === "production") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Dev-only endpoint" });
    }
    const profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, ctx.userId),
    });

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

    const [profile] = await db
      .update(schema.profiles)
      .set({
        currentStatus: input.text,
        statusExpiresAt: null,
        statusVisibility: input.visibility,
        statusCategories: input.categories,
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
        statusVisibility: null,
        statusCategories: null,
        statusSetAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.profiles.userId, ctx.userId))
      .returning();

    await db
      .delete(schema.statusMatches)
      .where(or(eq(schema.statusMatches.userId, ctx.userId), eq(schema.statusMatches.matchedUserId, ctx.userId)));

    return profile;
  }),

  // Get my status matches
  getMyStatusMatches: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: schema.statusMatches.id,
        matchedUserId: schema.statusMatches.matchedUserId,
        reason: schema.statusMatches.reason,
        matchedVia: schema.statusMatches.matchedVia,
        createdAt: schema.statusMatches.createdAt,
        statusVisibility: schema.profiles.statusVisibility,
      })
      .from(schema.statusMatches)
      .innerJoin(schema.profiles, eq(schema.statusMatches.matchedUserId, schema.profiles.userId))
      .innerJoin(schema.user, eq(schema.statusMatches.matchedUserId, schema.user.id))
      .where(and(eq(schema.statusMatches.userId, ctx.userId), isNull(schema.user.deletedAt)));

    return rows.map((row) => ({
      id: row.id,
      matchedUserId: row.matchedUserId,
      reason: row.statusVisibility === "private" ? "Na podstawie profilu" : row.reason,
      matchedVia: row.matchedVia,
      createdAt: row.createdAt,
    }));
  }),

  // Retry profile AI generation after failure (self-healing)
  retryProfileAI: protectedProcedure.use(rateLimit("profiles.retryProfileAI")).mutation(async ({ ctx }) => {
    const profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, ctx.userId),
      columns: { bio: true, lookingFor: true },
    });
    if (!profile) return;
    await enqueueProfileAI(ctx.userId, profile.bio, profile.lookingFor);
  }),

  // Retry status matching after failure (self-healing)
  retryStatusMatching: protectedProcedure.use(rateLimit("profiles.retryStatusMatching")).mutation(async ({ ctx }) => {
    const profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, ctx.userId),
      columns: { currentStatus: true, isComplete: true },
    });
    if (!profile?.currentStatus || !profile.isComplete) return;
    await enqueueStatusMatching(ctx.userId);
  }),
});
