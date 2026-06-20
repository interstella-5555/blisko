import {
  AI_MODELS,
  cosineSimilarity,
  createProfileSchema,
  extractOurS3Key,
  getNearbyMapMarkersSchema,
  getNearbyUsersForMapSchema,
  getNearbyUsersSchema,
  type LocaleCode,
  localeCodeSchema,
  MATCH_QUALITY_THRESHOLD,
  NEARBY_DEFAULT_RADIUS_METERS,
  setStatusSchema,
  translateContentSchema,
  updateLocationSchema,
  updateProfileSchema,
} from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { differenceInMinutes, subHours } from "date-fns";
import { and, between, eq, gte, inArray, isNotNull, isNull, lte, ne, or, placeholder, sql } from "drizzle-orm";
import { z } from "zod";
import { DECLINE_COOLDOWN_HOURS } from "@/config/pingLimits";
import { db, preparedName, schema } from "@/db";
import { userIsVisibleTo } from "@/db/filters";
import { roundDistance, toGridCenter } from "@/lib/grid";
import { isStatusActive } from "@/lib/status";
import { setTargetUserId } from "@/services/metrics";
import { moderateContent } from "@/services/moderation";
import {
  deleteAllTranslationsForUser,
  deleteTranslationsForField,
  getTranslationsForUser,
  getViewerText,
  type ProfileTranslationRow,
  translateInline,
  upsertTranslation,
} from "@/services/profile-translations";
import {
  enqueuePairAnalysis,
  enqueueProfileAI,
  enqueueProximityStatusMatching,
  enqueueQuickScore,
  enqueueStatusMatching,
  enqueueUserPairAnalysis,
  promotePairAnalysis,
} from "@/services/queue";
import { quarantineAvatarKey } from "@/services/s3";
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
    if (!profile) return null;

    // Translations are typically irrelevant for `me` (user sees their own
    // canonical text), but we return them anyway so the UI can show a preview
    // of how other-locale viewers will see it. BLI-279.
    const translations = await getTranslationsForUser(ctx.userId);
    return { ...profile, translations };
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
      // Fetch the current row once and reuse for displayName lock, avatar
      // quarantine, and the bio/lookingFor change check below. We need the
      // current bio/lookingFor values to tell whether the client echoed the
      // existing value (no real change → no AI re-enqueue / no translation
      // wipe) vs. a real edit.
      const needsExisting =
        input.displayName !== undefined ||
        input.avatarUrl !== undefined ||
        input.bio !== undefined ||
        input.lookingFor !== undefined;
      const existing = needsExisting
        ? await db.query.profiles.findFirst({
            where: eq(schema.profiles.userId, ctx.userId),
            columns: {
              displayName: true,
              createdAt: true,
              avatarUrl: true,
              bio: true,
              lookingFor: true,
              locale: true,
            },
          })
        : null;

      // Lock displayName after initial setup (5 min grace period)
      if (input.displayName && existing) {
        const graceExpired = differenceInMinutes(new Date(), existing.createdAt) > 5;
        if (graceExpired && existing.displayName !== input.displayName) {
          throw new TRPCError({ code: "FORBIDDEN", message: "display_name_locked" });
        }
      }

      const fieldsToModerate = [input.displayName, input.bio, input.lookingFor].filter(Boolean);
      if (fieldsToModerate.length > 0) {
        await moderateContent(fieldsToModerate.join("\n\n"));
      }

      // Quarantine the previous avatar (only when it's our upload). Fire-and-
      // forget: a quarantine error must not fail the user's profile update.
      if (input.avatarUrl !== undefined && existing && existing.avatarUrl !== input.avatarUrl) {
        const oldKey = extractOurS3Key(existing.avatarUrl);
        if (oldKey) {
          quarantineAvatarKey(oldKey, ctx.userId).catch((err) => {
            console.error(`[s3:quarantine] profiles.update failed for user ${ctx.userId}, key ${oldKey}:`, err);
          });
        }
      }

      // Real UGC change check — `input.bio !== undefined` alone is a presence
      // check, not a diff. A mobile client that echoes the full profile shape
      // on any edit (display name change, avatar swap) would otherwise wipe
      // translations + re-enqueue AI on every save. Compare against the
      // fetched row so we only treat actual edits as UGC changes.
      const bioChanged = input.bio !== undefined && existing != null && existing.bio !== input.bio;
      const lookingForChanged =
        input.lookingFor !== undefined && existing != null && existing.lookingFor !== input.lookingFor;
      const ugcChanged = bioChanged || lookingForChanged;

      // When UGC changes, rewrite content_locale to the user's UI locale —
      // that's the language they wrote in. Translations get wiped and
      // re-populated by the AI pipeline below (D5/D7 in BLI-279). Use the
      // already-fetched `existing.locale` instead of a second round-trip.
      const contentLocaleUpdate: { contentLocale: "pl" | "ua" } | undefined = ugcChanged
        ? { contentLocale: existing?.locale ?? "pl" }
        : undefined;

      // Wrap the profiles update + translations wipe in a single transaction
      // (per `profile-translations.ts` JSDoc on `deleteAllTranslationsForUser`)
      // so a concurrent viewer can never read fresh `profiles.bio` while the
      // old translation rows are still present — the two writes must be
      // observed atomically. The BullMQ enqueue stays outside the tx; Redis
      // is a separate system and the tx only covers DB.
      const profile = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.profiles)
          .set({
            ...input,
            ...(contentLocaleUpdate ?? {}),
            updatedAt: new Date(),
          })
          .where(eq(schema.profiles.userId, ctx.userId))
          .returning();

        if (ugcChanged) {
          await deleteAllTranslationsForUser(ctx.userId, tx);
        }

        return row;
      });

      // If bio or lookingFor actually changed, re-run AI pipeline (debounced
      // 30s by BullMQ). Translations get rewritten by the worker after dual-
      // language generation — until then the rows we just dropped force
      // "Przetłumacz" instead of stale text. BLI-279 D5.
      if (ugcChanged) {
        await enqueueProfileAI(ctx.userId, profile.bio, profile.lookingFor);

        // Also re-analyze connections (profile changed → analyses stale)
        if (profile.latitude && profile.longitude) {
          await enqueueUserPairAnalysis(ctx.userId, profile.latitude, profile.longitude);
        }
      }

      return profile;
    }),

  // Update user's preferred UI language. Cross-device sync — mobile seeds
  // localeStore from this value on session start when set. BLI-277.
  updateLocale: protectedProcedure.input(z.object({ locale: localeCodeSchema })).mutation(async ({ ctx, input }) => {
    const [profile] = await db
      .update(schema.profiles)
      .set({ locale: input.locale, updatedAt: new Date() })
      .where(eq(schema.profiles.userId, ctx.userId))
      .returning({ locale: schema.profiles.locale });

    if (!profile) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
    }

    return { locale: profile.locale };
  }),

  // Update location
  updateLocation: protectedProcedure.input(updateLocationSchema).mutation(async ({ ctx, input }) => {
    // Review accounts (Apple/Google store) are pinned to a fixed location set
    // during admin provisioning so reviewers see a consistent Warsaw-center
    // experience across test sessions. BLI-271.
    if (ctx.userType === "review") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Review accounts have a fixed location for App Store testing.",
      });
    }

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
    const radiusMeters = NEARBY_DEFAULT_RADIUS_METERS;
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
          userIsVisibleTo(ctx.userType),
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
            userIsVisibleTo(ctx.userType),
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

      // People we declined within the cooldown window are hidden from discovery,
      // mirroring getNearbyUsersForMap (the list endpoint). BLI-295 — without
      // this the map kept showing a declined person the list already hid.
      const cooldownCutoff = subHours(new Date(), DECLINE_COOLDOWN_HOURS);

      // Parallel: blocked users (both directions), cooldown declines, nearby profiles, current user profile, status matches, discoverable groups
      const [
        blockedUsers,
        blockedByUsers,
        cooldownDeclines,
        nearbyProfiles,
        currentProfile,
        myStatusMatchRows,
        nearbyGroups,
      ] = await Promise.all([
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
        db
          .select({
            userId: schema.profiles.userId,
            displayName: schema.profiles.displayName,
            avatarUrl: schema.profiles.avatarUrl,
            latitude: schema.profiles.latitude,
            longitude: schema.profiles.longitude,
            currentStatus: schema.profiles.currentStatus,
            doNotDisturb: schema.profiles.doNotDisturb,
            createdAt: schema.profiles.createdAt,
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
              userIsVisibleTo(ctx.userType),
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
        ...cooldownDeclines.map((d) => d.toUserId),
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
      const dnd: (0 | 1)[] = [];
      const isNew: (0 | 1)[] = [];

      // "NEW" bubble badge window (BLI-294): profile created within the last 24h.
      const newCutoff = subHours(new Date(), 24);

      for (const u of nearbyProfiles) {
        if (allBlockedIds.has(u.userId)) continue;

        ids.push(u.userId);
        names.push(u.displayName ?? "");
        avatars.push(u.avatarUrl ? u.avatarUrl : null);
        lats.push(u.latitude!);
        lngs.push(u.longitude!);

        const theirStatusActive = isStatusActive(u);
        statusMatch.push(myStatusActive && theirStatusActive && statusMatchSet.has(u.userId) ? 1 : 0);
        dnd.push(u.doNotDisturb ? 1 : 0);
        isNew.push(u.createdAt > newCutoff ? 1 : 0);
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
        users: { ids, names, avatars, lats, lngs, statusMatch, dnd, isNew },
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
        userIsVisibleTo(ctx.userType),
        ...(input.photoOnly ? [isNotNull(schema.profiles.avatarUrl)] : []),
      );

      // Get blocked users + cooldown users + current profile + analyses + status matches + totalCount + qualityCount in parallel
      const cooldownCutoff = subHours(new Date(), DECLINE_COOLDOWN_HOURS);
      const [
        blockedUsers,
        blockedByUsers,
        cooldownDeclines,
        currentProfile,
        analyses,
        myStatusMatchRows,
        countResult,
        qualityCountResult,
      ] = await Promise.all([
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
        // Quality count (BLI-294): in-range people whose connection analysis FROM the
        // current user scores >= MATCH_QUALITY_THRESHOLD. INNER JOIN to connectionAnalyses
        // restricts to scored pairs; reuses the same baseWhere as the total count.
        db
          .select({ count: sql<number>`count(*)` })
          .from(schema.profiles)
          .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
          .innerJoin(
            schema.connectionAnalyses,
            and(
              eq(schema.connectionAnalyses.fromUserId, ctx.userId),
              eq(schema.connectionAnalyses.toUserId, schema.profiles.userId),
              gte(schema.connectionAnalyses.aiMatchScore, MATCH_QUALITY_THRESHOLD),
            ),
          )
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

      // Quality count never exceeds the total; clamp to [0, totalCount] (BLI-294).
      const rawQualityCount = Number(qualityCountResult[0]?.count ?? 0);
      const qualityCount = Math.max(0, Math.min(rawQualityCount, totalCount));

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

      // Resolve bio essence + status to the VIEWER's locale (BLI-304). Fetch only
      // the two fields the list renders, only for the viewer's locale — one
      // indexed query. Users whose content_locale already matches the viewer read
      // the canonical column directly (no row here), so this is empty in the
      // common single-language case.
      const viewerLocale: LocaleCode = currentProfile?.locale ?? "pl";
      const nearbyUserIds = nearbyUsers.map((u) => u.profile.userId);
      const viewerTranslationRows =
        nearbyUserIds.length > 0
          ? await db
              .select({
                userId: schema.profileTranslations.userId,
                field: schema.profileTranslations.field,
                locale: schema.profileTranslations.locale,
                content: schema.profileTranslations.content,
              })
              .from(schema.profileTranslations)
              .where(
                and(
                  inArray(schema.profileTranslations.userId, nearbyUserIds),
                  inArray(schema.profileTranslations.field, ["bio_essence", "current_status"]),
                  eq(schema.profileTranslations.locale, viewerLocale),
                ),
              )
          : [];
      const viewerTranslationMap = new Map<string, ProfileTranslationRow[]>();
      for (const row of viewerTranslationRows) {
        const list = viewerTranslationMap.get(row.userId) ?? [];
        list.push({ field: row.field, locale: row.locale, content: row.content });
        viewerTranslationMap.set(row.userId, list);
      }

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

        const viewerTr = viewerTranslationMap.get(u.profile.userId) ?? [];

        results.push({
          profile: {
            id: u.profile.id,
            userId: u.profile.userId,
            displayName: u.profile.displayName,
            bio: u.profile.bio,
            lookingFor: u.profile.lookingFor,
            avatarUrl: u.profile.avatarUrl,
            currentStatus: theirStatusActive
              ? getViewerText(u.profile, "current_status", viewerTr, viewerLocale)
              : null,
            // One-sentence bio essence in the viewer's locale — nearby-list
            // subtitle fallback when there's no active status (BLI-304).
            bioEssence: getViewerText(u.profile, "bio_essence", viewerTr, viewerLocale),
            lastActiveAt: u.profile.lastActiveAt,
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

      return { users: results, totalCount, qualityCount, nextCursor, myStatus };
    }),

  // Ensure T3 analysis exists — lightweight "poke" to re-enqueue if stuck/failed.
  // A T2 row is NOT "ready" — still promote to T3. Silent no-op for blocked/incomplete/
  // inactive target (soft-deleted or suspended — returns "ready" so mobile self-heal
  // stops without revealing state).
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
      .where(and(eq(schema.profiles.userId, input.userId), userIsVisibleTo(ctx.userType)));
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

    // Active-user filter: inner-join user so a soft-deleted or suspended target
    // disappears even if the map query raced and handed the userId to mobile
    // before the state landed.
    const [target] = await db
      .select({ isComplete: schema.profiles.isComplete })
      .from(schema.profiles)
      .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
      .where(and(eq(schema.profiles.userId, input.userId), userIsVisibleTo(ctx.userType)));
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

    // Suspended users are returned with `isSuspended: true` so the mobile UI
    // can render the "Konto zawieszone" badge and disable composer. Soft-
    // deleted users stay hidden (null) — their profile data is stale / about
    // to be anonymized.
    const [result] = await db
      .select({ profile: schema.profiles, suspendedAt: schema.user.suspendedAt })
      .from(schema.profiles)
      .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
      .where(and(eq(schema.profiles.userId, input.userId), isNull(schema.user.deletedAt)));
    const profile = result?.profile;

    if (!profile) return null;

    const showStatus = isStatusActive(profile);

    // Profile translations — UI uses `pickDisplayText` to pick original vs
    // translation based on viewer locale. We always ship them; rows are
    // small (text only) and the lookup is one indexed query. BLI-279.
    let translations = await getTranslationsForUser(input.userId);
    // Strip current_status translation rows if the status isn't visible to the
    // viewer — symmetric with `currentStatus: null` above.
    if (!showStatus) {
      translations = translations.filter((t) => t.field !== "current_status");
    }

    return {
      ...profile,
      currentStatus: showStatus ? profile.currentStatus : null,
      statusSetAt: showStatus ? profile.statusSetAt : null,
      isSuspended: result.suspendedAt !== null,
      translations,
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

    // Two locales in play:
    //   - userLocale = what UI language the user is typing in right now
    //   - contentLocale = the anchor locale of the rest of their UGC (bio /
    //     lookingFor / portrait). `getCanonicalText` keys off contentLocale to
    //     pick which side of profile_translations to read.
    // The two CAN differ — user wrote bio in UA last week, switched their
    // phone UI to PL, and is typing today's status in PL. We must NOT touch
    // profiles.contentLocale here or the bio's source-language tracking
    // breaks (the matching pipeline would read raw UA text as if it were
    // PL).
    //
    // To keep the invariant "profiles.currentStatus is in contentLocale"
    // we translate the typed status into contentLocale before storing it
    // there, and write the user-typed version into profile_translations as
    // the userLocale row. When userLocale === contentLocale this collapses
    // to the obvious case (no translation needed for the column write; just
    // translate to the OTHER locale for the translation row). BLI-279.
    const userLocaleRow = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, ctx.userId),
      columns: { locale: true, contentLocale: true },
    });
    const userLocale: LocaleCode = userLocaleRow?.locale ?? "pl";
    const contentLocale: LocaleCode = userLocaleRow?.contentLocale ?? userLocale;
    const otherLocale: LocaleCode = userLocale === "ua" ? "pl" : "ua";

    let canonicalStatus = input.text;
    let translationRow: { locale: LocaleCode; content: string } | null = null;

    if (userLocale === contentLocale) {
      // Straight case — column write is what the user typed; translate to
      // the only other locale we support today.
      const translated = await translateInline(input.text, userLocale, otherLocale, {
        jobName: "translate-status",
        userId: ctx.userId,
        model: AI_MODELS.sync,
      });
      if (translated && translated !== input.text) {
        translationRow = { locale: otherLocale, content: translated };
      }
    } else {
      // Cross-locale case — column needs the contentLocale version, so
      // translate userLocale → contentLocale and store the user-typed text
      // as the userLocale translation row.
      const translatedToContent = await translateInline(input.text, userLocale, contentLocale, {
        jobName: "translate-status",
        userId: ctx.userId,
        model: AI_MODELS.sync,
      });
      canonicalStatus = translatedToContent || input.text;
      translationRow = { locale: userLocale, content: input.text };
    }

    const profile = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.profiles)
        .set({
          currentStatus: canonicalStatus,
          statusExpiresAt: null,
          statusCategories: input.categories,
          statusSetAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.profiles.userId, ctx.userId))
        .returning();

      // Wipe + re-populate the current_status translation row only — bio /
      // lookingFor / portrait stay untouched. D5 invalidation rule.
      await deleteTranslationsForField(ctx.userId, "current_status", tx);

      if (translationRow) {
        await upsertTranslation(ctx.userId, "current_status", translationRow.locale, translationRow.content, tx);
      }

      return row;
    });

    if (profile.isComplete) {
      enqueueStatusMatching(ctx.userId).catch((err) => {
        console.error("[profiles] Failed to enqueue status matching:", err);
      });
    }

    return profile;
  }),

  // Clear status "na teraz"
  clearStatus: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.profiles)
        .set({
          currentStatus: null,
          statusExpiresAt: null,
          statusEmbedding: null,
          statusCategories: null,
          statusSetAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.profiles.userId, ctx.userId))
        .returning();

      await tx
        .delete(schema.statusMatches)
        .where(or(eq(schema.statusMatches.userId, ctx.userId), eq(schema.statusMatches.matchedUserId, ctx.userId)));

      // Drop any stored status translations — the original is gone. BLI-279.
      await deleteTranslationsForField(ctx.userId, "current_status", tx);

      return row;
    });

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
      })
      .from(schema.statusMatches)
      .innerJoin(schema.profiles, eq(schema.statusMatches.matchedUserId, schema.profiles.userId))
      .innerJoin(schema.user, eq(schema.statusMatches.matchedUserId, schema.user.id))
      .where(and(eq(schema.statusMatches.userId, ctx.userId), userIsVisibleTo(ctx.userType)));

    return rows.map((row) => ({
      id: row.id,
      matchedUserId: row.matchedUserId,
      reason: row.reason,
      matchedVia: row.matchedVia,
      createdAt: row.createdAt,
    }));
  }),

  // On-demand UGC translation — viewer hit "Przetłumacz" on a profile field
  // (bio / lookingFor / portrait / currentStatus) where no cached translation
  // exists. Calls OpenAI inline, caches the result on `profile_translations`,
  // returns the translated content. Returns the cached row instantly if it
  // already exists (no AI call) — same shape so the mobile client can refetch
  // the profile and see the new translation. BLI-279.
  translateContent: protectedProcedure
    .use(rateLimit("profiles.translateContent"))
    .input(translateContentSchema)
    .mutation(async ({ ctx, input }) => {
      setTargetUserId(ctx.req, input.userId);

      // Need the profile + viewer's locale to know source (contentLocale) and
      // target (viewer's locale). Soft-deleted users must be invisible — join
      // user table and filter `deletedAt IS NULL` per
      // `.claude/rules/security.md#security/filter-soft-deleted`. Otherwise a
      // viewer could trigger an OpenAI call against a profile mid-grace-period.
      const [targetRows, viewer] = await Promise.all([
        db
          .select({
            bio: schema.profiles.bio,
            lookingFor: schema.profiles.lookingFor,
            portrait: schema.profiles.portrait,
            currentStatus: schema.profiles.currentStatus,
            contentLocale: schema.profiles.contentLocale,
          })
          .from(schema.profiles)
          .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
          .where(and(eq(schema.profiles.userId, input.userId), isNull(schema.user.deletedAt)))
          .limit(1),
        db.query.profiles.findFirst({
          where: eq(schema.profiles.userId, ctx.userId),
          columns: { locale: true },
        }),
      ]);

      const target = targetRows[0];
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
      }

      // Block check — never translate something blocked viewers shouldn't see.
      if (input.userId !== ctx.userId) {
        const block = await db.query.blocks.findFirst({
          where: or(
            and(eq(schema.blocks.blockerId, ctx.userId), eq(schema.blocks.blockedId, input.userId)),
            and(eq(schema.blocks.blockerId, input.userId), eq(schema.blocks.blockedId, ctx.userId)),
          ),
        });
        if (block) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
      }

      const viewerLocale = viewer?.locale ?? "pl";
      const sourceLocale = target.contentLocale;

      // Already in the viewer's locale → no translation needed.
      if (viewerLocale === sourceLocale) {
        return { field: input.field, locale: viewerLocale, content: null, alreadyInLocale: true as const };
      }

      // Map snake_case field → profiles column name
      const sourceText =
        input.field === "bio"
          ? target.bio
          : input.field === "looking_for"
            ? target.lookingFor
            : input.field === "portrait"
              ? target.portrait
              : target.currentStatus;

      if (!sourceText) {
        return { field: input.field, locale: viewerLocale, content: null, alreadyInLocale: false as const };
      }

      // Check cache first — translation may have been written by the AI
      // pipeline already.
      const cached = await db.query.profileTranslations.findFirst({
        where: and(
          eq(schema.profileTranslations.userId, input.userId),
          eq(schema.profileTranslations.field, input.field),
          eq(schema.profileTranslations.locale, viewerLocale),
        ),
        columns: { content: true },
      });
      if (cached) {
        return { field: input.field, locale: viewerLocale, content: cached.content, alreadyInLocale: false as const };
      }

      // Cache miss → inline OpenAI call → upsert.
      const translated = await translateInline(sourceText, sourceLocale, viewerLocale, {
        jobName: "translate-ugc-ondemand",
        userId: ctx.userId,
        targetUserId: input.userId,
        model: AI_MODELS.sync,
      });

      // Only persist meaningful translations — if the model returned the
      // original (fallback path), we don't pollute the cache with no-ops.
      if (translated && translated !== sourceText) {
        await upsertTranslation(input.userId, input.field, viewerLocale, translated);
      }

      return {
        field: input.field,
        locale: viewerLocale,
        content: translated && translated !== sourceText ? translated : null,
        alreadyInLocale: false as const,
      };
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
