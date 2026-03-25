import { createHash } from "node:crypto";
import { cosineSimilarity } from "@repo/shared";
import { type Job, Queue, Worker } from "bullmq";
import { RedisClient } from "bun";
import { and, between, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import ms from "ms";
import { db, schema } from "@/db";
import { isStatusActive } from "@/lib/status";
import { publishEvent } from "@/ws/redis-bridge";
import {
  analyzeConnection,
  evaluateStatusMatch,
  extractInterests,
  generateEmbedding,
  generatePortrait,
  quickScore,
} from "./ai";
import { generateNextQuestion, generateProfileFromQA } from "./profiling-ai";
import { sendPushToUser } from "./push";
import { recordJobCompleted, recordJobFailed } from "./queue-metrics";

function getConnectionConfig() {
  const url = new URL(process.env.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

let _redisPub: RedisClient | null = null;

function getRedisPub(): RedisClient | null {
  if (!process.env.REDIS_URL) return null;
  if (!_redisPub) {
    _redisPub = new RedisClient(process.env.REDIS_URL);
  }
  return _redisPub;
}

// --- Job types ---

interface AnalyzePairJob {
  type: "analyze-pair";
  userAId: string;
  userBId: string;
  nameA?: string;
  nameB?: string;
}

interface QuickScoreJob {
  type: "quick-score";
  userAId: string;
  userBId: string;
}

interface AnalyzeUserPairsJob {
  type: "analyze-user-pairs";
  userId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

interface GenerateProfileAIJob {
  type: "generate-profile-ai";
  userId: string;
  bio: string;
  lookingFor: string;
}

interface GenerateProfilingQuestionJob {
  type: "generate-profiling-question";
  sessionId: string;
  userId: string;
  displayName: string;
  qaHistory: { question: string; answer: string }[];
  previousSessionQA?: { question: string; answer: string }[];
  userRequestedMore?: boolean;
  directionHint?: string;
}

interface GenerateProfileFromQAJob {
  type: "generate-profile-from-qa";
  sessionId: string;
  userId: string;
  displayName: string;
  qaHistory: { question: string; answer: string }[];
  previousSessionQA?: { question: string; answer: string }[];
}

interface StatusMatchingJob {
  type: "status-matching";
  userId: string;
}

interface ProximityStatusMatchingJob {
  type: "proximity-status-matching";
  userId: string;
  latitude: number;
  longitude: number;
}

interface HardDeleteUserJob {
  type: "hard-delete-user";
  userId: string;
}

interface ExportUserDataJob {
  type: "export-user-data";
  userId: string;
  email: string;
}

type AIJob =
  | AnalyzePairJob
  | QuickScoreJob
  | AnalyzeUserPairsJob
  | GenerateProfileAIJob
  | GenerateProfilingQuestionJob
  | GenerateProfileFromQAJob
  | StatusMatchingJob
  | ProximityStatusMatchingJob
  | HardDeleteUserJob
  | ExportUserDataJob;

// --- Queue (lazy init) ---

let _queue: Queue | null = null;

export function getQueueInstance(): Queue | null {
  return _queue;
}

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue("ai-jobs", {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: { count: 100 },
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return _queue!;
}

// --- Constants ---

const NEARBY_RADIUS_DEG = 0.05; // ~5km bounding box

// --- Helpers ---

async function sendAmbientPushWithCooldown(userId: string) {
  const redis = getRedisPub();
  if (!redis) return;
  const cooldownKey = `ambient-push:${userId}`;
  const alreadySent = await redis.get(cooldownKey);
  if (!alreadySent) {
    await redis.send("SET", [cooldownKey, "1", "EX", "3600"]);
    void sendPushToUser(userId, {
      title: "Blisko",
      body: "Ktoś z pasującym profilem jest w pobliżu",
      data: { type: "ambient_match" },
      collapseId: "ambient-match",
    });
  }
}

function profileHash(bio: string, lookingFor: string): string {
  return createHash("sha256").update(`${bio}|${lookingFor}`).digest("hex").slice(0, 8);
}

// --- Connection analysis processors (unchanged) ---

async function processAnalyzePair(job: Job<AnalyzePairJob>, userAId: string, userBId: string) {
  const t0 = performance.now();

  // --- db-fetch phase ---
  const profileA = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userAId),
  });
  const profileB = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userBId),
  });

  const nameA = job.data.nameA ?? profileA?.displayName ?? userAId.slice(0, 8);
  const nameB = job.data.nameB ?? profileB?.displayName ?? userBId.slice(0, 8);

  if (!profileA?.portrait || !profileB?.portrait || !profileA.isComplete || !profileB.isComplete) {
    console.log(
      `[queue] analyze-pair skip (incomplete profile) | db-fetch: ${(performance.now() - t0).toFixed(0)}ms | pair: ${nameA} → ${nameB}`,
    );
    return;
  }

  const hashA = profileHash(profileA.bio, profileA.lookingFor);
  const hashB = profileHash(profileB.bio, profileB.lookingFor);

  const [existingAB] = await db
    .select()
    .from(schema.connectionAnalyses)
    .where(and(eq(schema.connectionAnalyses.fromUserId, userAId), eq(schema.connectionAnalyses.toUserId, userBId)));

  const tFetch = performance.now();

  if (existingAB && existingAB.fromProfileHash === hashA && existingAB.toProfileHash === hashB) {
    console.log(
      `[queue] analyze-pair done | db-fetch: ${(tFetch - t0).toFixed(0)}ms | total: ${(tFetch - t0).toFixed(0)}ms | pair: ${nameA} → ${nameB} | skipped: true`,
    );
    return;
  }

  // --- ai-call phase ---
  const tAi0 = performance.now();
  const result = await analyzeConnection(
    {
      portrait: profileA.portrait,
      displayName: profileA.displayName,
      lookingFor: profileA.lookingFor,
      superpower: profileA.superpower,
    },
    {
      portrait: profileB.portrait,
      displayName: profileB.displayName,
      lookingFor: profileB.lookingFor,
      superpower: profileB.superpower,
    },
  );
  const tAi = performance.now();

  // --- db-write phase ---
  const tWrite0 = performance.now();
  const now = new Date();

  await db
    .insert(schema.connectionAnalyses)
    .values({
      fromUserId: userAId,
      toUserId: userBId,
      shortSnippet: result.snippetForA,
      longDescription: result.descriptionForA,
      aiMatchScore: result.matchScoreForA,
      fromProfileHash: hashA,
      toProfileHash: hashB,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.connectionAnalyses.fromUserId, schema.connectionAnalyses.toUserId],
      set: {
        shortSnippet: result.snippetForA,
        longDescription: result.descriptionForA,
        aiMatchScore: result.matchScoreForA,
        fromProfileHash: hashA,
        toProfileHash: hashB,
        updatedAt: now,
      },
    });

  publishEvent("analysisReady", {
    forUserId: userAId,
    aboutUserId: userBId,
    shortSnippet: result.snippetForA,
  });

  getRedisPub()?.publish(
    "analysis:ready",
    JSON.stringify({
      forUserId: userAId,
      aboutUserId: userBId,
    }),
  );

  await db
    .insert(schema.connectionAnalyses)
    .values({
      fromUserId: userBId,
      toUserId: userAId,
      shortSnippet: result.snippetForB,
      longDescription: result.descriptionForB,
      aiMatchScore: result.matchScoreForB,
      fromProfileHash: hashB,
      toProfileHash: hashA,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.connectionAnalyses.fromUserId, schema.connectionAnalyses.toUserId],
      set: {
        shortSnippet: result.snippetForB,
        longDescription: result.descriptionForB,
        aiMatchScore: result.matchScoreForB,
        fromProfileHash: hashB,
        toProfileHash: hashA,
        updatedAt: now,
      },
    });

  publishEvent("analysisReady", {
    forUserId: userBId,
    aboutUserId: userAId,
    shortSnippet: result.snippetForB,
  });

  getRedisPub()?.publish(
    "analysis:ready",
    JSON.stringify({
      forUserId: userBId,
      aboutUserId: userAId,
    }),
  );

  const tWrite = performance.now();

  console.log(
    `[queue] analyze-pair done | db-fetch: ${(tFetch - t0).toFixed(0)}ms | ai: ${(tAi - tAi0).toFixed(0)}ms | db-write: ${(tWrite - tWrite0).toFixed(0)}ms | total: ${(tWrite - t0).toFixed(0)}ms | pair: ${nameA} → ${nameB} | skipped: false`,
  );
}

async function processQuickScore(userAId: string, userBId: string) {
  const t0 = performance.now();

  const [profileA, profileB] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(schema.profiles.userId, userAId) }),
    db.query.profiles.findFirst({ where: eq(schema.profiles.userId, userBId) }),
  ]);

  if (!profileA?.portrait || !profileB?.portrait || !profileA.isComplete || !profileB.isComplete) {
    console.log(
      `[queue] quick-score skip (incomplete profile) | pair: ${userAId.slice(0, 8)} → ${userBId.slice(0, 8)}`,
    );
    return;
  }

  // Skip if T3 full analysis already exists (has shortSnippet)
  const [existingAB] = await db
    .select({ shortSnippet: schema.connectionAnalyses.shortSnippet })
    .from(schema.connectionAnalyses)
    .where(and(eq(schema.connectionAnalyses.fromUserId, userAId), eq(schema.connectionAnalyses.toUserId, userBId)));

  if (existingAB?.shortSnippet) {
    console.log(`[queue] quick-score skip (T3 exists) | pair: ${profileA.displayName} → ${profileB.displayName}`);
    return;
  }

  const tAi0 = performance.now();
  const result = await quickScore(
    {
      portrait: profileA.portrait,
      displayName: profileA.displayName,
      lookingFor: profileA.lookingFor,
      superpower: profileA.superpower,
    },
    {
      portrait: profileB.portrait,
      displayName: profileB.displayName,
      lookingFor: profileB.lookingFor,
      superpower: profileB.superpower,
    },
  );
  const tAi = performance.now();

  const now = new Date();
  const hashA = profileHash(profileA.bio, profileA.lookingFor);
  const hashB = profileHash(profileB.bio, profileB.lookingFor);

  // Upsert A→B (only if T3 hasn't filled it since we checked)
  await db
    .insert(schema.connectionAnalyses)
    .values({
      fromUserId: userAId,
      toUserId: userBId,
      shortSnippet: null,
      longDescription: null,
      aiMatchScore: result.scoreForA,
      fromProfileHash: hashA,
      toProfileHash: hashB,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.connectionAnalyses.fromUserId, schema.connectionAnalyses.toUserId],
      set: { aiMatchScore: result.scoreForA, fromProfileHash: hashA, toProfileHash: hashB, updatedAt: now },
      setWhere: isNull(schema.connectionAnalyses.shortSnippet),
    });

  publishEvent("analysisReady", { forUserId: userAId, aboutUserId: userBId, shortSnippet: null });

  // Upsert B→A
  await db
    .insert(schema.connectionAnalyses)
    .values({
      fromUserId: userBId,
      toUserId: userAId,
      shortSnippet: null,
      longDescription: null,
      aiMatchScore: result.scoreForB,
      fromProfileHash: hashB,
      toProfileHash: hashA,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.connectionAnalyses.fromUserId, schema.connectionAnalyses.toUserId],
      set: { aiMatchScore: result.scoreForB, fromProfileHash: hashB, toProfileHash: hashA, updatedAt: now },
      setWhere: isNull(schema.connectionAnalyses.shortSnippet),
    });

  publishEvent("analysisReady", { forUserId: userBId, aboutUserId: userAId, shortSnippet: null });

  console.log(
    `[queue] quick-score done | ai: ${(tAi - tAi0).toFixed(0)}ms | total: ${(performance.now() - t0).toFixed(0)}ms | pair: ${profileA.displayName} ↔ ${profileB.displayName} | scores: ${result.scoreForA}/${result.scoreForB}`,
  );
}

async function processAnalyzeUserPairs(userId: string, latitude: number, longitude: number, radiusMeters: number) {
  const queue = getQueue();

  const latDelta = radiusMeters / 111000;
  const lonDelta = radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

  const minLat = latitude - latDelta;
  const maxLat = latitude + latDelta;
  const minLon = longitude - lonDelta;
  const maxLon = longitude + lonDelta;

  const [blockedUsers, blockedByUsers] = await Promise.all([
    db.select({ blockedId: schema.blocks.blockedId }).from(schema.blocks).where(eq(schema.blocks.blockerId, userId)),
    db.select({ blockerId: schema.blocks.blockerId }).from(schema.blocks).where(eq(schema.blocks.blockedId, userId)),
  ]);

  const allBlockedIds = new Set([...blockedUsers.map((b) => b.blockedId), ...blockedByUsers.map((b) => b.blockerId)]);

  // Fetch current user's embedding & interests for ranking
  const myProfile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    columns: {
      displayName: true,
      embedding: true,
      interests: true,
    },
  });

  const myEmbedding = myProfile?.embedding ?? [];
  const myInterests = new Set(myProfile?.interests ?? []);

  // Find nearby users with data needed for priority ranking
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
      userId: schema.profiles.userId,
      displayName: schema.profiles.displayName,
      embedding: schema.profiles.embedding,
      interests: schema.profiles.interests,
      distance: distanceFormula,
    })
    .from(schema.profiles)
    .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
    .where(
      and(
        ne(schema.profiles.userId, userId),
        ne(schema.profiles.visibilityMode, "ninja"),
        eq(schema.profiles.isComplete, true),
        between(schema.profiles.latitude, minLat, maxLat),
        between(schema.profiles.longitude, minLon, maxLon),
        lte(distanceFormula, radiusMeters),
        isNull(schema.user.deletedAt),
      ),
    )
    .limit(100);

  // Score and sort so top-of-list users get analyzed first
  const scored = nearbyUsers
    .filter((u) => !allBlockedIds.has(u.userId))
    .map((u) => {
      let similarity = 0;
      if (myEmbedding.length && u.embedding?.length) {
        similarity = cosineSimilarity(myEmbedding, u.embedding);
      }
      const theirInterests = u.interests ?? [];
      const common = theirInterests.filter((i) => myInterests.has(i)).length;
      const interestScore = myInterests.size > 0 ? common / myInterests.size : 0;

      const matchScore = similarity > 0 ? 0.7 * similarity + 0.3 * interestScore : interestScore;
      const proximity = 1 - Math.min(u.distance, radiusMeters) / radiusMeters;
      const rankScore = 0.6 * matchScore + 0.4 * proximity;

      return { userId: u.userId, displayName: u.displayName, rankScore };
    })
    .sort((a, b) => b.rankScore - a.rankScore);

  const myName = myProfile?.displayName ?? userId.slice(0, 8);

  // Queue analyze-pair jobs — priority 1 (highest) for top-ranked users
  for (let i = 0; i < scored.length; i++) {
    const other = scored[i];
    const [a, b] = [userId, other.userId].sort();
    const nameA = a === userId ? myName : other.displayName;
    const nameB = b === userId ? myName : other.displayName;
    await safeEnqueuePairJob(
      queue,
      { type: "analyze-pair", userAId: a, userBId: b, nameA, nameB, requestedBy: myName },
      { priority: i + 1 },
    );
  }
}

// --- Profile AI processor (refactored from sync) ---

async function processGenerateProfileAI(userId: string, bio: string, lookingFor: string) {
  const portrait = await generatePortrait(bio, lookingFor);
  const [embedding, interests] = await Promise.all([generateEmbedding(portrait), extractInterests(portrait)]);

  await db
    .update(schema.profiles)
    .set({
      portrait,
      embedding,
      interests,
      updatedAt: new Date(),
    })
    .where(eq(schema.profiles.userId, userId));

  publishEvent("profileReady", { userId });
}

// --- Profiling question processor ---

async function processGenerateProfilingQuestion(job: GenerateProfilingQuestionJob) {
  const { sessionId, displayName, qaHistory, previousSessionQA, userRequestedMore, directionHint } = job;

  const questionNumber = qaHistory.length + 1;

  const result = await generateNextQuestion(displayName, qaHistory, {
    previousSessionQA,
    userRequestedMore,
    directionHint,
  });

  await db.insert(schema.profilingQA).values({
    sessionId,
    questionNumber,
    question: result.question,
    sufficient: result.sufficient,
  });

  publishEvent("questionReady", {
    userId: job.userId,
    sessionId,
    questionNumber,
  });
}

// --- Profile from Q&A processor ---

async function processGenerateProfileFromQA(job: GenerateProfileFromQAJob) {
  const { sessionId, displayName, qaHistory, previousSessionQA } = job;

  const result = await generateProfileFromQA(displayName, qaHistory, previousSessionQA);

  await db
    .update(schema.profilingSessions)
    .set({
      generatedBio: result.bio,
      generatedLookingFor: result.lookingFor,
      generatedPortrait: result.portrait,
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(schema.profilingSessions.id, sessionId));

  publishEvent("profilingComplete", {
    userId: job.userId,
    sessionId,
  });
}

// --- Status matching processor ---

async function processStatusMatching(userId: string) {
  const user = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });

  if (!user?.currentStatus) return;
  if (!user.isComplete) return;

  // Generate embedding for status text
  const statusEmb = await generateEmbedding(user.currentStatus);
  await db.update(schema.profiles).set({ statusEmbedding: statusEmb }).where(eq(schema.profiles.userId, userId));

  if (!statusEmb.length || !user.latitude || !user.longitude) return;

  // Get nearby visible users (~5km bounding box)
  const nearbyUsers = await db
    .select({ profile: schema.profiles })
    .from(schema.profiles)
    .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
    .where(
      and(
        ne(schema.profiles.userId, userId),
        ne(schema.profiles.visibilityMode, "ninja"),
        eq(schema.profiles.isComplete, true),
        isNotNull(schema.profiles.latitude),
        isNotNull(schema.profiles.longitude),
        gte(schema.profiles.latitude, user.latitude - NEARBY_RADIUS_DEG),
        lte(schema.profiles.latitude, user.latitude + NEARBY_RADIUS_DEG),
        gte(schema.profiles.longitude, user.longitude - NEARBY_RADIUS_DEG),
        lte(schema.profiles.longitude, user.longitude + NEARBY_RADIUS_DEG),
        isNull(schema.user.deletedAt),
      ),
    );

  // Pre-filter by cosine similarity — top 20
  // Private statuses are matched via profile embedding only — their status text never enters the LLM reason
  const scored = nearbyUsers
    .map(({ profile: u }) => {
      const hasPublicStatus = isStatusActive(u) && u.statusVisibility !== "private";

      let similarity = 0;
      if (hasPublicStatus && u.statusEmbedding?.length) {
        similarity = cosineSimilarity(statusEmb, u.statusEmbedding);
      } else if (u.embedding?.length) {
        similarity = cosineSimilarity(statusEmb, u.embedding);
      }

      return {
        user: u,
        similarity,
        matchViaStatus: Boolean(hasPublicStatus),
      };
    })
    .filter((s) => s.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 20);

  // LLM evaluation for top candidates
  const matches: { matchedUserId: string; reason: string; matchedVia: "status" | "profile" }[] = [];

  await Promise.all(
    scored.map(async ({ user: otherUser, matchViaStatus }) => {
      const matchType = matchViaStatus ? "status" : "profile";
      const otherContext = matchViaStatus
        ? otherUser.currentStatus!
        : `${otherUser.bio}. Szuka: ${otherUser.lookingFor}`;

      const result = await evaluateStatusMatch(user.currentStatus!, otherContext, matchType);

      if (result.isMatch) {
        matches.push({
          matchedUserId: otherUser.userId,
          reason: result.reason,
          matchedVia: matchType,
        });
      }
    }),
  );

  // Replace old matches with new ones
  await db.delete(schema.statusMatches).where(eq(schema.statusMatches.userId, userId));

  if (matches.length > 0) {
    await db.insert(schema.statusMatches).values(
      matches.map((m) => ({
        userId,
        matchedUserId: m.matchedUserId,
        reason: m.reason,
        matchedVia: m.matchedVia,
      })),
    );
  }

  // Emit WS event
  publishEvent("statusMatchesReady", { userId });

  if (matches.length > 0) {
    await sendAmbientPushWithCooldown(userId);
  }
}

// --- Proximity status matching processor ---

async function processProximityStatusMatching(userId: string, latitude: number, longitude: number) {
  console.log(`[queue] proximity-status-matching starting for ${userId}`);

  const movingUser = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    columns: {
      userId: true,
      isComplete: true,
      visibilityMode: true,
      currentStatus: true,
      statusVisibility: true,
      statusEmbedding: true,
      embedding: true,
      bio: true,
      lookingFor: true,
    },
  });

  if (!movingUser?.isComplete) return;
  if (movingUser.visibilityMode === "ninja") return;

  // Generate status embedding if moving user has status but no embedding yet
  let movingUserStatusEmb = movingUser.statusEmbedding;
  if (movingUser.currentStatus && (!movingUserStatusEmb || !movingUserStatusEmb.length)) {
    movingUserStatusEmb = await generateEmbedding(movingUser.currentStatus);
    if (movingUserStatusEmb.length) {
      await db
        .update(schema.profiles)
        .set({ statusEmbedding: movingUserStatusEmb })
        .where(eq(schema.profiles.userId, userId));
    }
  }

  const movingEmb = movingUserStatusEmb?.length ? movingUserStatusEmb : movingUser.embedding;
  if (!movingEmb?.length) return;

  const nearbyUsers = await db
    .select({
      profile: {
        userId: schema.profiles.userId,
        currentStatus: schema.profiles.currentStatus,
        statusVisibility: schema.profiles.statusVisibility,
        statusEmbedding: schema.profiles.statusEmbedding,
        embedding: schema.profiles.embedding,
        bio: schema.profiles.bio,
        lookingFor: schema.profiles.lookingFor,
      },
    })
    .from(schema.profiles)
    .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
    .where(
      and(
        ne(schema.profiles.userId, userId),
        ne(schema.profiles.visibilityMode, "ninja"),
        eq(schema.profiles.isComplete, true),
        isNotNull(schema.profiles.currentStatus),
        isNotNull(schema.profiles.latitude),
        isNotNull(schema.profiles.longitude),
        gte(schema.profiles.latitude, latitude - NEARBY_RADIUS_DEG),
        lte(schema.profiles.latitude, latitude + NEARBY_RADIUS_DEG),
        gte(schema.profiles.longitude, longitude - NEARBY_RADIUS_DEG),
        lte(schema.profiles.longitude, longitude + NEARBY_RADIUS_DEG),
        isNull(schema.user.deletedAt),
      ),
    )
    .limit(100);

  if (nearbyUsers.length === 0) return;

  // Filter out already-matched pairs (either direction involving this user)
  const candidateIds = nearbyUsers.map(({ profile }) => profile.userId);
  const existingMatches = await db
    .select({
      userId: schema.statusMatches.userId,
      matchedUserId: schema.statusMatches.matchedUserId,
    })
    .from(schema.statusMatches)
    .where(
      or(
        and(eq(schema.statusMatches.userId, userId), inArray(schema.statusMatches.matchedUserId, candidateIds)),
        and(inArray(schema.statusMatches.userId, candidateIds), eq(schema.statusMatches.matchedUserId, userId)),
      ),
    );

  const matchedPairs = new Set(existingMatches.map((m) => `${m.userId}:${m.matchedUserId}`));

  const newCandidates = nearbyUsers.filter(({ profile }) => {
    return !matchedPairs.has(`${userId}:${profile.userId}`) && !matchedPairs.has(`${profile.userId}:${userId}`);
  });

  if (newCandidates.length === 0) return;

  const movingUserHasStatus = isStatusActive(movingUser);

  // Private statuses are matched via profile embedding only — their status text never enters the LLM reason
  const scored = newCandidates
    .map(({ profile: candidate }) => {
      const hasPublicStatus = isStatusActive(candidate) && candidate.statusVisibility !== "private";

      let similarity = 0;
      if (hasPublicStatus && candidate.statusEmbedding?.length) {
        similarity = cosineSimilarity(movingEmb, candidate.statusEmbedding);
      } else if (candidate.embedding?.length) {
        similarity = cosineSimilarity(movingEmb, candidate.embedding);
      }
      return {
        candidate,
        similarity,
        matchViaStatus: Boolean(hasPublicStatus),
      };
    })
    .filter((s) => s.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10);

  if (scored.length === 0) return;

  const matches: { candidateId: string; reason: string; matchedVia: "status" | "profile" }[] = [];

  await Promise.all(
    scored.map(async ({ candidate, matchViaStatus }) => {
      const matchType = matchViaStatus ? "status" : "profile";
      const movingContext = movingUserHasStatus
        ? movingUser.currentStatus!
        : `${movingUser.bio}. Szuka: ${movingUser.lookingFor}`;
      const candidateContext = matchViaStatus
        ? candidate.currentStatus!
        : `${candidate.bio}. Szuka: ${candidate.lookingFor}`;

      const result = await evaluateStatusMatch(candidateContext, movingContext, matchType);

      if (result.isMatch) {
        matches.push({
          candidateId: candidate.userId,
          reason: result.reason,
          matchedVia: matchType,
        });
      }
    }),
  );

  if (matches.length === 0) {
    console.log(`[queue] proximity-status-matching for ${userId}: ${scored.length} candidates, 0 matches`);
    return;
  }

  console.log(
    `[queue] proximity-status-matching for ${userId}: ${matches.length} matches from ${scored.length} candidates`,
  );

  const matchRows = matches.flatMap((m) => [
    { userId: m.candidateId, matchedUserId: userId, reason: m.reason, matchedVia: m.matchedVia },
    { userId, matchedUserId: m.candidateId, reason: m.reason, matchedVia: m.matchedVia },
  ]);

  await db
    .insert(schema.statusMatches)
    .values(matchRows)
    .onConflictDoNothing({ target: [schema.statusMatches.userId, schema.statusMatches.matchedUserId] });

  const notifiedUserIds = new Set<string>();
  for (const m of matches) {
    notifiedUserIds.add(m.candidateId);
  }
  notifiedUserIds.add(userId);

  for (const uid of notifiedUserIds) {
    publishEvent("statusMatchesReady", { userId: uid });
  }

  for (const uid of notifiedUserIds) {
    await sendAmbientPushWithCooldown(uid);
  }
}

// --- Hard delete processor ---

async function processHardDeleteUser(userId: string) {
  console.log(`[queue] anonymize-user starting for ${userId}`);

  // Skip if already anonymized
  const userData = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { anonymizedAt: true },
  });
  if (userData?.anonymizedAt) {
    console.log(`[queue] user ${userId} already anonymized, skipping`);
    return;
  }

  // 1. Get S3 file keys from profile before overwriting
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    columns: { avatarUrl: true, portrait: true },
  });

  // 2. Delete S3 files (avatar, portrait)
  if (profile) {
    const keysToDelete: string[] = [];
    for (const url of [profile.avatarUrl, profile.portrait]) {
      if (url) {
        const match = url.match(/uploads\/[^?]+/);
        if (match) keysToDelete.push(match[0]);
      }
    }
    if (keysToDelete.length > 0) {
      const { S3Client } = await import("bun");
      const s3 = new S3Client({
        accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
        secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
        endpoint: process.env.BUCKET_ENDPOINT!,
        bucket: process.env.BUCKET_NAME!,
      });
      for (const key of keysToDelete) {
        try {
          await s3.delete(key);
          console.log(`[queue] deleted S3 key: ${key}`);
        } catch (err) {
          console.error(`[queue] failed to delete S3 key ${key}:`, err);
        }
      }
    }
  }

  const now = new Date();
  const anonymizedEmail = `${crypto.randomUUID()}@deleted.localhost`;

  // 3. Anonymize user + profile + profiling data in a transaction
  await db.transaction(async (tx) => {
    await tx
      .update(schema.user)
      .set({
        name: "Usunięty użytkownik",
        email: anonymizedEmail,
        emailVerified: false,
        image: null,
        updatedAt: now,
        anonymizedAt: now,
      })
      .where(eq(schema.user.id, userId));

    await tx
      .update(schema.profiles)
      .set({
        displayName: "Usunięty użytkownik",
        avatarUrl: null,
        bio: "",
        lookingFor: "",
        socialLinks: null,
        visibilityMode: "ninja",
        interests: null,
        embedding: null,
        portrait: null,
        portraitSharedForMatching: false,
        isComplete: false,
        currentStatus: null,
        statusExpiresAt: null,
        statusEmbedding: null,
        statusSetAt: null,
        latitude: null,
        longitude: null,
        lastLocationUpdate: null,
        updatedAt: now,
      })
      .where(eq(schema.profiles.userId, userId));

    await tx
      .update(schema.profilingSessions)
      .set({ generatedBio: null, generatedLookingFor: null, generatedPortrait: null })
      .where(eq(schema.profilingSessions.userId, userId));

    const sessionIds = await tx
      .select({ id: schema.profilingSessions.id })
      .from(schema.profilingSessions)
      .where(eq(schema.profilingSessions.userId, userId));

    if (sessionIds.length > 0) {
      await tx
        .update(schema.profilingQA)
        .set({ answer: null })
        .where(
          inArray(
            schema.profilingQA.sessionId,
            sessionIds.map((s) => s.id),
          ),
        );
    }
  });

  // 4. Anonymize metrics (outside transaction — separate schema, non-critical)
  try {
    await db.update(schema.requestEvents).set({ userId: null }).where(eq(schema.requestEvents.userId, userId));
    await db
      .update(schema.requestEvents)
      .set({ targetUserId: null })
      .where(eq(schema.requestEvents.targetUserId, userId));
  } catch (err) {
    console.error(`[queue] failed to anonymize metrics for ${userId}:`, err);
  }

  console.log(`[queue] anonymize-user completed for ${userId}`);
}

// --- Export user data processor ---

async function processExportUserData(userId: string, email: string) {
  console.log(`[queue] export-user-data starting for ${userId}`);
  const { collectAndExportUserData } = await import("./data-export");
  await collectAndExportUserData(userId, email);
  console.log(`[queue] export-user-data completed for ${userId}`);
}

// --- Main job processor ---

async function processJob(job: Job<AIJob>) {
  const data = job.data;
  const queueWait = job.processedOn ? job.processedOn - job.timestamp : 0;
  console.log(`[queue] processing ${data.type} | jobId: ${job.id} | wait: ${(queueWait / 1000).toFixed(1)}s`);

  switch (data.type) {
    case "analyze-pair":
      await processAnalyzePair(job as Job<AnalyzePairJob>, data.userAId, data.userBId);
      break;
    case "quick-score":
      await processQuickScore(data.userAId, data.userBId);
      break;
    case "analyze-user-pairs":
      await processAnalyzeUserPairs(data.userId, data.latitude, data.longitude, data.radiusMeters);
      break;
    case "generate-profile-ai":
      await processGenerateProfileAI(data.userId, data.bio, data.lookingFor);
      break;
    case "generate-profiling-question":
      await processGenerateProfilingQuestion(data);
      break;
    case "generate-profile-from-qa":
      await processGenerateProfileFromQA(data);
      break;
    case "status-matching":
      await processStatusMatching(data.userId);
      break;
    case "proximity-status-matching":
      await processProximityStatusMatching(data.userId, data.latitude, data.longitude);
      break;
    case "hard-delete-user":
      await processHardDeleteUser(data.userId);
      break;
    case "export-user-data":
      await processExportUserData(data.userId, data.email);
      break;
  }
}

// --- Worker ---

let _worker: Worker | null = null;

export function startWorker() {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL not set, skipping queue worker");
    return;
  }

  _worker = new Worker("ai-jobs", processJob, {
    connection: getConnectionConfig(),
    concurrency: 50,
  });

  _worker.on("completed", (job) => {
    const durationMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    recordJobCompleted("ai-jobs", durationMs);
    console.log(`[queue] Job ${job.id} completed (${job.data.type}) ${durationMs}ms`);
  });

  _worker.on("failed", (job, err) => {
    recordJobFailed("ai-jobs");
    console.error(`[queue] Job ${job?.id} failed:`, err.message);
  });

  console.log("[queue] AI jobs worker started");
}

// --- Helpers for safe job enqueue ---

async function safeEnqueuePairJob(
  queue: Queue,
  data: {
    type: "analyze-pair";
    userAId: string;
    userBId: string;
    nameA?: string;
    nameB?: string;
    requestedBy?: string;
  },
  opts?: { priority?: number },
) {
  const jobId = `pair-${data.userAId}-${data.userBId}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "completed") return;
    if ((state === "waiting" || state === "delayed") && !opts?.priority) return;
    // Remove failed/stale job before re-adding (try-catch for TOCTOU race)
    try {
      await existing.remove();
    } catch {
      return;
    }
  }
  await queue.add("analyze-pair", data, { jobId, ...opts });
}

// --- Enqueue functions ---

export async function enqueueUserPairAnalysis(
  userId: string,
  latitude: number,
  longitude: number,
  radiusMeters: number = 5000,
) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    "analyze-user-pairs",
    {
      type: "analyze-user-pairs",
      userId,
      latitude,
      longitude,
      radiusMeters,
    },
    {
      jobId: `user-pairs-${userId}-${Date.now()}`,
      debounce: { id: `user-pairs-${userId}`, ttl: ms("30s") },
    },
  );
}

export async function enqueuePairAnalysis(
  userAId: string,
  userBId: string,
  opts?: { nameA?: string; nameB?: string; requestedBy?: string },
) {
  if (!process.env.REDIS_URL) return;

  const [a, b] = [userAId, userBId].sort();
  // Match names to sorted order
  const nameA = a === userAId ? opts?.nameA : opts?.nameB;
  const nameB = b === userAId ? opts?.nameA : opts?.nameB;
  const queue = getQueue();
  await safeEnqueuePairJob(queue, {
    type: "analyze-pair",
    userAId: a,
    userBId: b,
    nameA,
    nameB,
    requestedBy: opts?.requestedBy,
  });
}

export async function enqueueQuickScore(userAId: string, userBId: string) {
  if (!process.env.REDIS_URL) return;

  const [a, b] = [userAId, userBId].sort();
  const jobId = `quick-score-${a}-${b}`;
  const queue = getQueue();
  await queue.add("quick-score", { type: "quick-score", userAId: a, userBId: b }, { jobId });
}

/** Promote a pair analysis to highest priority (for wave-triggered urgency) */
export async function promotePairAnalysis(userAId: string, userBId: string) {
  if (!process.env.REDIS_URL) return;

  const [a, b] = [userAId, userBId].sort();
  const jobId = `pair-${a}-${b}`;
  const queue = getQueue();

  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "completed") return; // already processing or done
    await existing.remove();
  }

  // Add without priority → FIFO queue, processed before all prioritized jobs
  await queue.add("analyze-pair", { type: "analyze-pair", userAId: a, userBId: b }, { jobId });
}

export async function enqueueProfileAI(userId: string, bio: string, lookingFor: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    "generate-profile-ai",
    { type: "generate-profile-ai", userId, bio, lookingFor },
    {
      jobId: `profile-ai-${userId}-${Date.now()}`,
      debounce: { id: `profile-ai-${userId}`, ttl: ms("30s") },
    },
  );
}

export async function enqueueProfilingQuestion(
  sessionId: string,
  userId: string,
  displayName: string,
  qaHistory: { question: string; answer: string }[],
  options?: {
    previousSessionQA?: { question: string; answer: string }[];
    userRequestedMore?: boolean;
    directionHint?: string;
  },
) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    "generate-profiling-question",
    {
      type: "generate-profiling-question",
      sessionId,
      userId,
      displayName,
      qaHistory,
      previousSessionQA: options?.previousSessionQA,
      userRequestedMore: options?.userRequestedMore,
      directionHint: options?.directionHint,
    },
    { jobId: `profiling-q-${sessionId}-${qaHistory.length + 1}` },
  );
}

export async function enqueueProfileFromQA(
  sessionId: string,
  userId: string,
  displayName: string,
  qaHistory: { question: string; answer: string }[],
  previousSessionQA?: { question: string; answer: string }[],
) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    "generate-profile-from-qa",
    {
      type: "generate-profile-from-qa",
      sessionId,
      userId,
      displayName,
      qaHistory,
      previousSessionQA,
    },
    { jobId: `profile-from-qa-${sessionId}` },
  );
}

export async function enqueueStatusMatching(userId: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    "status-matching",
    { type: "status-matching", userId },
    { jobId: `status-matching-${userId}`, removeOnComplete: true },
  );
}

export async function enqueueProximityStatusMatching(userId: string, latitude: number, longitude: number) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    "proximity-status-matching",
    { type: "proximity-status-matching", userId, latitude, longitude },
    {
      jobId: `proximity-status-${userId}-${Date.now()}`,
      debounce: { id: `proximity-status-${userId}`, ttl: ms("2m") },
      removeOnComplete: true,
    },
  );
}

export async function enqueueHardDeleteUser(userId: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  await queue.add(
    "hard-delete-user",
    { type: "hard-delete-user", userId },
    {
      jobId: `hard-delete-${userId}`,
      delay: FOURTEEN_DAYS_MS,
      removeOnComplete: true,
    },
  );
}

export async function cancelHardDeleteUser(userId: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  const job = await queue.getJob(`hard-delete-${userId}`);
  if (job) {
    try {
      await job.remove();
    } catch {
      /* job may have already run */
    }
  }
}

export async function enqueueDataExport(userId: string, email: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    "export-user-data",
    { type: "export-user-data", userId, email },
    {
      jobId: `export-${userId}-${Date.now()}`,
      removeOnComplete: true,
    },
  );
}
