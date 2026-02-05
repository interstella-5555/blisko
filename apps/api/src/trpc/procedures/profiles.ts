import { z } from 'zod';
import { eq, and, ne, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { profiles, blocks } from '../../db/schema';
import {
  createProfileSchema,
  updateProfileSchema,
  updateLocationSchema,
  getNearbyUsersSchema,
  getNearbyUsersForMapSchema,
} from '@meet/shared';
import { toGridCenter, roundDistance } from '../../lib/grid';
import { generateEmbedding } from '../../services/ai';

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

      // Generate embedding for bio + lookingFor
      const embedding = await generateEmbedding(
        `${input.bio}\n\n${input.lookingFor}`
      );

      const [profile] = await db
        .insert(profiles)
        .values({
          userId: ctx.userId,
          displayName: input.displayName,
          bio: input.bio,
          lookingFor: input.lookingFor,
          embedding,
        })
        .returning();

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

      // Regenerate embedding if bio or lookingFor changed
      if (input.bio || input.lookingFor) {
        const [currentProfile] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.userId, ctx.userId));

        if (currentProfile) {
          const bio = input.bio || currentProfile.bio;
          const lookingFor = input.lookingFor || currentProfile.lookingFor;
          updateData.embedding = await generateEmbedding(
            `${bio}\n\n${lookingFor}`
          );
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
      const lonDelta = radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLon = longitude - lonDelta;
      const maxLon = longitude + lonDelta;

      // Get blocked users and current profile in parallel
      const [blockedUsers, blockedByUsers, currentProfileResult] = await Promise.all([
        db.select({ blockedId: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, ctx.userId)),
        db.select({ blockerId: blocks.blockerId }).from(blocks).where(eq(blocks.blockedId, ctx.userId)),
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

  // Get nearby users for map view (with grid-based privacy)
  getNearbyUsersForMap: protectedProcedure
    .input(getNearbyUsersForMapSchema)
    .query(async ({ ctx, input }) => {
      const { latitude, longitude, radiusMeters, limit } = input;

      // Calculate bounding box for initial filter (uses index!)
      const latDelta = radiusMeters / 111000;
      const lonDelta = radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLon = longitude - lonDelta;
      const maxLon = longitude + lonDelta;

      // Get blocked users
      const [blockedUsers, blockedByUsers] = await Promise.all([
        db.select({ blockedId: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, ctx.userId)),
        db.select({ blockerId: blocks.blockerId }).from(blocks).where(eq(blocks.blockedId, ctx.userId)),
      ]);

      const allBlockedIds = new Set([
        ...blockedUsers.map((b) => b.blockedId),
        ...blockedByUsers.map((b) => b.blockerId),
      ]);

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
            sql`${profiles.latitude} BETWEEN ${minLat} AND ${maxLat}`,
            sql`${profiles.longitude} BETWEEN ${minLon} AND ${maxLon}`,
            sql`${distanceFormula} <= ${radiusMeters}`
          )
        )
        .orderBy(distanceFormula)
        .limit(limit + allBlockedIds.size);

      // Filter blocked users and add grid positions
      const results = [];
      for (const u of nearbyUsers) {
        if (allBlockedIds.has(u.profile.userId)) continue;
        if (results.length >= limit) break;

        // Get grid position for privacy (instead of exact coords)
        const gridPos = toGridCenter(
          u.profile.latitude!,
          u.profile.longitude!
        );

        results.push({
          profile: {
            id: u.profile.id,
            userId: u.profile.userId,
            displayName: u.profile.displayName,
            bio: u.profile.bio,
            lookingFor: u.profile.lookingFor,
            avatarUrl: u.profile.avatarUrl,
            // NO latitude/longitude - only grid position!
          },
          distance: roundDistance(u.distance), // Rounded to 100m
          gridLat: gridPos.gridLat,
          gridLng: gridPos.gridLng,
          gridId: gridPos.gridId,
        });
      }

      return results;
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
