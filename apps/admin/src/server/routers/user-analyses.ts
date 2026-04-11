import { schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { aliasedTable, and, between, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { protectedProcedure, router } from "../trpc";

// Inline to avoid pulling @repo/shared into admin for a 5-line function.
// Mirrors packages/shared/src/math.ts.
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

const NEARBY_HARD_CAP = 500;

export const userAnalysesRouter = router({
  listAnalyses: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        tierFilter: z.enum(["all", "t2", "t3"]).default("all"),
        sort: z.enum(["newest", "highest"]).default("newest"),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const { userId, tierFilter, sort, limit, offset } = input;

      const toUser = aliasedTable(schema.user, "to_user");
      const toProfile = aliasedTable(schema.profiles, "to_profile");

      const conditions = [eq(schema.connectionAnalyses.fromUserId, userId)];
      if (tierFilter !== "all") {
        conditions.push(eq(schema.connectionAnalyses.tier, tierFilter));
      }
      const where = and(...conditions);

      const orderBy =
        sort === "highest" ? desc(schema.connectionAnalyses.aiMatchScore) : desc(schema.connectionAnalyses.createdAt);

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id: schema.connectionAnalyses.id,
            toUserId: schema.connectionAnalyses.toUserId,
            aiMatchScore: schema.connectionAnalyses.aiMatchScore,
            tier: schema.connectionAnalyses.tier,
            shortSnippet: schema.connectionAnalyses.shortSnippet,
            longDescription: schema.connectionAnalyses.longDescription,
            createdAt: schema.connectionAnalyses.createdAt,
            updatedAt: schema.connectionAnalyses.updatedAt,
            fromProfileHash: schema.connectionAnalyses.fromProfileHash,
            toProfileHash: schema.connectionAnalyses.toProfileHash,
            toDisplayName: toProfile.displayName,
            toAvatarUrl: toProfile.avatarUrl,
            toEmail: toUser.email,
          })
          .from(schema.connectionAnalyses)
          .innerJoin(toUser, eq(schema.connectionAnalyses.toUserId, toUser.id))
          .innerJoin(toProfile, eq(toUser.id, toProfile.userId))
          .where(where)
          .orderBy(orderBy)
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(schema.connectionAnalyses).where(where),
      ]);

      return { analyses: rows, total };
    }),

  // Read-only diagnostic view — adding enqueue calls here silently turns admin viewing into AI spend.
  listNearby: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        radiusMeters: z.number().min(100).max(50000).default(2000),
      }),
    )
    .query(async ({ input }) => {
      const { userId, radiusMeters } = input;

      const target = await db.query.profiles.findFirst({
        where: eq(schema.profiles.userId, userId),
        columns: {
          userId: true,
          displayName: true,
          latitude: true,
          longitude: true,
          embedding: true,
          interests: true,
        },
      });

      if (!target || target.latitude == null || target.longitude == null) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User has no location set",
        });
      }

      const latitude = target.latitude;
      const longitude = target.longitude;

      const latDelta = radiusMeters / 111000;
      const lonDelta = radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLon = longitude - lonDelta;
      const maxLon = longitude + lonDelta;

      const distanceFormula = sql<number>`
        6371000 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${latitude})) * cos(radians(${schema.profiles.latitude})) *
            cos(radians(${schema.profiles.longitude}) - radians(${longitude})) +
            sin(radians(${latitude})) * sin(radians(${schema.profiles.latitude}))
          ))
        )
      `;

      const nearby = await db
        .select({
          userId: schema.profiles.userId,
          displayName: schema.profiles.displayName,
          avatarUrl: schema.profiles.avatarUrl,
          email: schema.user.email,
          interests: schema.profiles.interests,
          embedding: schema.profiles.embedding,
          visibilityMode: schema.profiles.visibilityMode,
          deletedAt: schema.user.deletedAt,
          distance: distanceFormula,
        })
        .from(schema.profiles)
        .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
        .where(
          and(
            ne(schema.profiles.userId, userId),
            between(schema.profiles.latitude, minLat, maxLat),
            between(schema.profiles.longitude, minLon, maxLon),
            sql`${distanceFormula} <= ${radiusMeters}`,
          ),
        )
        .orderBy(distanceFormula)
        .limit(NEARBY_HARD_CAP);

      const nearbyIds = nearby.map((n) => n.userId);

      const analyses = nearbyIds.length
        ? await db
            .select({
              toUserId: schema.connectionAnalyses.toUserId,
              aiMatchScore: schema.connectionAnalyses.aiMatchScore,
              tier: schema.connectionAnalyses.tier,
              shortSnippet: schema.connectionAnalyses.shortSnippet,
            })
            .from(schema.connectionAnalyses)
            .where(
              and(
                eq(schema.connectionAnalyses.fromUserId, userId),
                inArray(schema.connectionAnalyses.toUserId, nearbyIds),
              ),
            )
        : [];

      const analysisMap = new Map(analyses.map((a) => [a.toUserId, a]));

      const targetEmbedding = target.embedding ?? [];
      const targetInterests = target.interests ?? [];

      const results = nearby.map((u) => {
        const proximity = 1 - Math.min(u.distance, radiusMeters) / radiusMeters;

        const similarity =
          targetEmbedding.length && u.embedding?.length ? cosineSimilarity(targetEmbedding, u.embedding) : null;

        const theirInterests = u.interests ?? [];
        const commonInterests = targetInterests.filter((i) => theirInterests.includes(i));
        const interestScore = targetInterests.length > 0 ? commonInterests.length / targetInterests.length : 0;

        const analysis = analysisMap.get(u.userId);

        const matchScoreFraction = analysis
          ? analysis.aiMatchScore / 100
          : similarity != null
            ? 0.7 * similarity + 0.3 * interestScore
            : interestScore;
        const rankScore = 0.6 * matchScoreFraction + 0.4 * proximity;

        const tier: "t1" | "t2" | "t3" = analysis?.tier ?? "t1";

        return {
          userId: u.userId,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          email: u.email,
          distance: Math.round(u.distance),
          matchScore: Math.round(matchScoreFraction * 100),
          rankScore: Math.round(rankScore * 100) / 100,
          commonInterests,
          tier,
          shortSnippet: analysis?.shortSnippet ?? null,
          visibilityMode: u.visibilityMode,
          isDeleted: u.deletedAt != null,
        };
      });

      results.sort((a, b) => b.rankScore - a.rankScore);

      return {
        target: {
          userId: target.userId,
          displayName: target.displayName,
          latitude,
          longitude,
        },
        nearby: results,
        cappedAt: NEARBY_HARD_CAP,
      };
    }),
});
