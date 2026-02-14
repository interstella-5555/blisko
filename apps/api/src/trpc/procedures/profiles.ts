import { z } from 'zod';
import { eq, and, ne, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { profiles, blocks, connectionAnalyses } from '../../db/schema';
import {
  createProfileSchema,
  updateProfileSchema,
  updateLocationSchema,
  getNearbyUsersSchema,
  getNearbyUsersForMapSchema,
} from '@repo/shared';
import { toGridCenter, roundDistance } from '../../lib/grid';
import {
  enqueueUserPairAnalysis,
  enqueuePairAnalysis,
  enqueueProfileAI,
} from '../../services/queue';
import { ee } from '../../ws/events';

export const profilesRouter = router({
  // Get current user's profile
  me: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, ctx.userId));

    return profile || null;
  }),

  // Create profile (async — AI fields populate via queue worker)
  create: protectedProcedure
    .input(createProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Profile already exists' });
      }

      const [profile] = await db
        .insert(profiles)
        .values({
          userId: ctx.userId,
          displayName: input.displayName,
          bio: input.bio,
          lookingFor: input.lookingFor,
        })
        .returning();

      // Enqueue AI generation (socialProfile, embedding, interests)
      // WS event 'profileReady' will fire when done
      enqueueProfileAI(ctx.userId, input.bio, input.lookingFor).catch((err) => {
        console.error('[profiles] Failed to enqueue profile AI job:', err);
      });

      return profile;
    }),

  // Update profile (async — AI regeneration via queue if bio/lookingFor changed)
  update: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const [profile] = await db
        .update(profiles)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, ctx.userId))
        .returning();

      // If bio or lookingFor changed, re-run AI pipeline async
      if (input.bio || input.lookingFor) {
        const bio = profile.bio;
        const lookingFor = profile.lookingFor;
        enqueueProfileAI(ctx.userId, bio, lookingFor).catch((err) => {
          console.error('[profiles] Failed to enqueue profile AI job:', err);
        });

        // Also re-analyze connections (profile changed → analyses stale)
        if (profile.latitude && profile.longitude) {
          enqueueUserPairAnalysis(
            ctx.userId,
            profile.latitude,
            profile.longitude
          ).catch(() => {});
        }
      }

      return profile;
    }),

  // Update location
  updateLocation: protectedProcedure
    .input(updateLocationSchema)
    .mutation(async ({ ctx, input }) => {
      const [profile] = await db
        .update(profiles)
        .set({
          latitude: input.latitude,
          longitude: input.longitude,
          lastLocationUpdate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, ctx.userId))
        .returning();

      // Queue connection analyses for new location
      enqueueUserPairAnalysis(
        ctx.userId,
        input.latitude,
        input.longitude
      ).catch(() => {});

      // Notify nearby users that someone's location changed
      const radiusMeters = 5000;
      const latDelta = radiusMeters / 111000;
      const lonDelta =
        radiusMeters / (111000 * Math.cos((input.latitude * Math.PI) / 180));

      db.select({ userId: profiles.userId })
        .from(profiles)
        .where(
          and(
            ne(profiles.userId, ctx.userId),
            eq(profiles.isHidden, false),
            sql`${profiles.latitude} BETWEEN ${input.latitude - latDelta} AND ${input.latitude + latDelta}`,
            sql`${profiles.longitude} BETWEEN ${input.longitude - lonDelta} AND ${input.longitude + lonDelta}`
          )
        )
        .then((nearbyUsers) => {
          for (const u of nearbyUsers) {
            ee.emit('nearbyChanged', { forUserId: u.userId });
          }
        })
        .catch(() => {});

      return profile;
    }),

  // Get nearby users
  getNearbyUsers: protectedProcedure
    .input(getNearbyUsersSchema)
    .query(async ({ ctx, input }) => {
      const { latitude, longitude, radiusMeters, limit } = input;

      // Calculate bounding box for initial filter (uses index!)
      // ~111km per degree latitude, longitude varies by latitude
      const latDelta = radiusMeters / 111000;
      const lonDelta =
        radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLon = longitude - lonDelta;
      const maxLon = longitude + lonDelta;

      // Get blocked users and current profile in parallel
      const [blockedUsers, blockedByUsers, currentProfileResult] =
        await Promise.all([
          db
            .select({ blockedId: blocks.blockedId })
            .from(blocks)
            .where(eq(blocks.blockerId, ctx.userId)),
          db
            .select({ blockerId: blocks.blockerId })
            .from(blocks)
            .where(eq(blocks.blockedId, ctx.userId)),
          db.select().from(profiles).where(eq(profiles.userId, ctx.userId)),
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
            cos(radians(${latitude})) * cos(radians(${profiles.latitude})) *
            cos(radians(${profiles.longitude}) - radians(${longitude})) +
            sin(radians(${latitude})) * sin(radians(${profiles.latitude}))
          ))
        )
      `;

      const nearbyUsers = await db
        .select({
          profile: profiles,
          distance: distanceFormula,
        })
        .from(profiles)
        .where(
          and(
            ne(profiles.userId, ctx.userId),
            eq(profiles.isHidden, false),
            // Bounding box filter (uses index)
            sql`${profiles.latitude} BETWEEN ${minLat} AND ${maxLat}`,
            sql`${profiles.longitude} BETWEEN ${minLon} AND ${maxLon}`,
            // Exact distance filter
            sql`${distanceFormula} <= ${radiusMeters}`
          )
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
          similarityScore = cosineSimilarity(
            currentProfile.embedding,
            u.profile.embedding
          );
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
    .input(getNearbyUsersForMapSchema)
    .query(async ({ ctx, input }) => {
      const { latitude, longitude, radiusMeters, limit, cursor } = input;
      const offset = cursor ?? 0;

      // Calculate bounding box for initial filter (uses index!)
      const latDelta = radiusMeters / 111000;
      const lonDelta =
        radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLon = longitude - lonDelta;
      const maxLon = longitude + lonDelta;

      // Haversine distance formula
      const distanceFormula = sql<number>`
        6371000 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${latitude})) * cos(radians(${profiles.latitude})) *
            cos(radians(${profiles.longitude}) - radians(${longitude})) +
            sin(radians(${latitude})) * sin(radians(${profiles.latitude}))
          ))
        )
      `;

      // Base WHERE conditions (reused for count + paginated query)
      const baseWhere = and(
        ne(profiles.userId, ctx.userId),
        eq(profiles.isHidden, false),
        sql`${profiles.latitude} BETWEEN ${minLat} AND ${maxLat}`,
        sql`${profiles.longitude} BETWEEN ${minLon} AND ${maxLon}`,
        sql`${distanceFormula} <= ${radiusMeters}`
      );

      // Get blocked users + current profile + analyses + totalCount in parallel
      const [blockedUsers, blockedByUsers, currentProfileResult, analyses, countResult] =
        await Promise.all([
          db
            .select({ blockedId: blocks.blockedId })
            .from(blocks)
            .where(eq(blocks.blockerId, ctx.userId)),
          db
            .select({ blockerId: blocks.blockerId })
            .from(blocks)
            .where(eq(blocks.blockedId, ctx.userId)),
          db.select().from(profiles).where(eq(profiles.userId, ctx.userId)),
          db
            .select()
            .from(connectionAnalyses)
            .where(eq(connectionAnalyses.fromUserId, ctx.userId)),
          db
            .select({ count: sql<number>`count(*)` })
            .from(profiles)
            .where(baseWhere),
        ]);

      const allBlockedIds = new Set([
        ...blockedUsers.map((b) => b.blockedId),
        ...blockedByUsers.map((b) => b.blockerId),
      ]);

      const rawCount = Number(countResult[0]?.count ?? 0);
      // Subtract blocked users from count (approximate — blocked users may not all be in range)
      const totalCount = Math.max(0, rawCount - allBlockedIds.size);

      const currentProfile = currentProfileResult[0];

      const analysisMap = new Map(
        analyses.map((a) => [a.toUserId, a])
      );

      // Fetch extra rows to account for blocked users being filtered out
      const nearbyUsers = await db
        .select({
          profile: profiles,
          distance: distanceFormula,
        })
        .from(profiles)
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

        const gridPos = toGridCenter(
          u.profile.latitude!,
          u.profile.longitude!
        );

        // Ranking calculation
        const proximity = 1 - Math.min(u.distance, radiusMeters) / radiusMeters;

        const analysis = analysisMap.get(u.profile.userId);

        let similarity: number | null = null;
        if (myEmbedding?.length && u.profile.embedding?.length) {
          similarity = cosineSimilarity(myEmbedding, u.profile.embedding);
        }

        const theirInterests = u.profile.interests ?? [];
        const commonInterests = myInterests.filter((i) =>
          theirInterests.includes(i)
        );
        const interestScore =
          myInterests.length > 0
            ? commonInterests.length / myInterests.length
            : 0;

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
          commonInterests,
          shortSnippet: analysis?.shortSnippet ?? null,
          analysisReady: !!analysis,
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

      return { users: results, totalCount, nextCursor };
    }),

  // Get AI connection analysis for a specific user
  getConnectionAnalysis: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [analysis] = await db
        .select()
        .from(connectionAnalyses)
        .where(
          and(
            eq(connectionAnalyses.fromUserId, ctx.userId),
            eq(connectionAnalyses.toUserId, input.userId)
          )
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
  getById: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, input.userId));

      return profile || null;
    }),
});

// Helper function for cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
