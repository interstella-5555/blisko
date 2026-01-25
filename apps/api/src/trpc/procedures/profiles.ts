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
} from '@meet/shared';
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

      // Get blocked user IDs
      const blockedUsers = await db
        .select({ blockedId: blocks.blockedId })
        .from(blocks)
        .where(eq(blocks.blockerId, ctx.userId));

      const blockedIds = blockedUsers.map((b) => b.blockedId);

      // Get users who blocked current user
      const blockedByUsers = await db
        .select({ blockerId: blocks.blockerId })
        .from(blocks)
        .where(eq(blocks.blockedId, ctx.userId));

      const blockedByIds = blockedByUsers.map((b) => b.blockerId);

      const allBlockedIds = [...new Set([...blockedIds, ...blockedByIds])];

      // Calculate distance using Haversine formula in SQL
      // This is a simplified version - in production use PostGIS
      const distanceFormula = sql<number>`
        6371000 * acos(
          cos(radians(${latitude})) * cos(radians(${profiles.latitude})) *
          cos(radians(${profiles.longitude}) - radians(${longitude})) +
          sin(radians(${latitude})) * sin(radians(${profiles.latitude}))
        )
      `;

      let query = db
        .select({
          profile: profiles,
          distance: distanceFormula,
        })
        .from(profiles)
        .where(
          and(
            ne(profiles.userId, ctx.userId),
            sql`${profiles.latitude} IS NOT NULL`,
            sql`${profiles.longitude} IS NOT NULL`,
            sql`${distanceFormula} <= ${radiusMeters}`
          )
        )
        .orderBy(distanceFormula)
        .limit(limit);

      const nearbyUsers = await query;

      // Filter out blocked users
      const filteredUsers = nearbyUsers.filter(
        (u) => !allBlockedIds.includes(u.profile.userId)
      );

      // Get current user's embedding for similarity calculation
      const [currentProfile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      // Calculate similarity scores if embeddings exist
      return filteredUsers.map((u) => {
        let similarityScore: number | null = null;

        if (currentProfile?.embedding && u.profile.embedding) {
          similarityScore = cosineSimilarity(
            currentProfile.embedding,
            u.profile.embedding
          );
        }

        return {
          profile: u.profile,
          distance: u.distance,
          similarityScore,
        };
      });
    }),

  // Get profile by user ID
  getById: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
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
