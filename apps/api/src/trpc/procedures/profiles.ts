import { z } from 'zod';
import { eq, and, ne, sql } from 'drizzle-orm';
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
  generateEmbedding,
  generateSocialProfile,
  extractInterests,
} from '../../services/ai';
import {
  enqueueUserPairAnalysis,
  enqueuePairAnalysis,
} from '../../services/queue';

export const profilesRouter = router({
  // Get current user's profile
  me: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, ctx.userId));

    return profile || null;
  }),

  // Create profile
  create: protectedProcedure
    .input(createProfileSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if profile already exists
      const [existing] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      if (existing) {
        throw new Error('Profile already exists');
      }

      // Pipeline: bio+lookingFor → socialProfile → (embedding, interests)
      const socialProfile = await generateSocialProfile(
        input.bio,
        input.lookingFor
      );

      const [embedding, interests] = await Promise.all([
        generateEmbedding(socialProfile),
        extractInterests(socialProfile),
      ]);

      const [profile] = await db
        .insert(profiles)
        .values({
          userId: ctx.userId,
          displayName: input.displayName,
          bio: input.bio,
          lookingFor: input.lookingFor,
          socialProfile,
          interests,
          embedding,
        })
        .returning();

      // Queue connection analyses for nearby users (non-blocking)
      if (profile.latitude && profile.longitude) {
        enqueueUserPairAnalysis(
          ctx.userId,
          profile.latitude,
          profile.longitude
        ).catch(() => {});
      }

      return profile;
    }),

  // Update profile
  update: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {
        ...input,
        updatedAt: new Date(),
      };

      // Regenerate socialProfile + embedding + interests if bio or lookingFor changed
      if (input.bio || input.lookingFor) {
        const [currentProfile] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.userId, ctx.userId));

        if (currentProfile) {
          const bio = input.bio || currentProfile.bio;
          const lookingFor = input.lookingFor || currentProfile.lookingFor;

          const socialProfile = await generateSocialProfile(bio, lookingFor);
          const [embedding, interests] = await Promise.all([
            generateEmbedding(socialProfile),
            extractInterests(socialProfile),
          ]);

          updateData.socialProfile = socialProfile;
          updateData.embedding = embedding;
          updateData.interests = interests;

          // Queue new analyses (profile changed → old analyses are stale)
          if (currentProfile.latitude && currentProfile.longitude) {
            enqueueUserPairAnalysis(
              ctx.userId,
              currentProfile.latitude,
              currentProfile.longitude
            ).catch(() => {});
          }
        }
      }

      const [profile] = await db
        .update(profiles)
        .set(updateData)
        .where(eq(profiles.userId, ctx.userId))
        .returning();

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
      const { latitude, longitude, radiusMeters, limit } = input;

      // Calculate bounding box for initial filter (uses index!)
      const latDelta = radiusMeters / 111000;
      const lonDelta =
        radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLon = longitude - lonDelta;
      const maxLon = longitude + lonDelta;

      // Get blocked users + current profile + pre-computed analyses in parallel
      const [blockedUsers, blockedByUsers, currentProfileResult, analyses] =
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
        ]);

      const allBlockedIds = new Set([
        ...blockedUsers.map((b) => b.blockedId),
        ...blockedByUsers.map((b) => b.blockerId),
      ]);

      const currentProfile = currentProfileResult[0];

      const analysisMap = new Map(
        analyses.map((a) => [a.toUserId, a])
      );

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
            sql`${profiles.latitude} BETWEEN ${minLat} AND ${maxLat}`,
            sql`${profiles.longitude} BETWEEN ${minLon} AND ${maxLon}`,
            sql`${distanceFormula} <= ${radiusMeters}`
          )
        )
        .orderBy(distanceFormula)
        .limit(limit + allBlockedIds.size);

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

      return results;
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
