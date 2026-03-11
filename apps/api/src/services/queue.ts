import { createHash } from "node:crypto";
import { cosineSimilarity } from "@repo/shared";
import { type Job, Queue, Worker } from "bullmq";
import { RedisClient } from "bun";
import { and, between, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ee } from "@/ws/events";
import { analyzeConnection, evaluateStatusMatch, extractInterests, generateEmbedding, generatePortrait } from "./ai";
import { generateNextQuestion, generateProfileFromQA } from "./profiling-ai";
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
  | AnalyzeUserPairsJob
  | GenerateProfileAIJob
  | GenerateProfilingQuestionJob
  | GenerateProfileFromQAJob
  | StatusMatchingJob
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

// --- Helpers ---

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
    },
    {
      portrait: profileB.portrait,
      displayName: profileB.displayName,
      lookingFor: profileB.lookingFor,
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

  ee.emit("analysisReady", {
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

  ee.emit("analysisReady", {
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
        eq(schema.profiles.visibilityMode, "visible"),
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

  ee.emit("profileReady", { userId });
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

  ee.emit("questionReady", {
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

  ee.emit("profilingComplete", {
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

  // Check if status expired — clean up and return
  if (user.statusExpiresAt && user.statusExpiresAt < new Date()) {
    await db
      .update(schema.profiles)
      .set({
        currentStatus: null,
        statusExpiresAt: null,
        statusEmbedding: null,
        statusSetAt: null,
      })
      .where(eq(schema.profiles.userId, userId));
    await db.delete(schema.statusMatches).where(eq(schema.statusMatches.userId, userId));
    return;
  }

  // Generate embedding for status text
  const statusEmb = await generateEmbedding(user.currentStatus);
  await db.update(schema.profiles).set({ statusEmbedding: statusEmb }).where(eq(schema.profiles.userId, userId));

  if (!statusEmb.length || !user.latitude || !user.longitude) return;

  // Get nearby visible users (~5km bounding box)
  const nearbyRadius = 0.05;
  const nearbyUsers = await db
    .select({ profile: schema.profiles })
    .from(schema.profiles)
    .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
    .where(
      and(
        ne(schema.profiles.userId, userId),
        eq(schema.profiles.visibilityMode, "visible"),
        eq(schema.profiles.isComplete, true),
        isNotNull(schema.profiles.latitude),
        isNotNull(schema.profiles.longitude),
        gte(schema.profiles.latitude, user.latitude - nearbyRadius),
        lte(schema.profiles.latitude, user.latitude + nearbyRadius),
        gte(schema.profiles.longitude, user.longitude - nearbyRadius),
        lte(schema.profiles.longitude, user.longitude + nearbyRadius),
        isNull(schema.user.deletedAt),
      ),
    );

  // Pre-filter by cosine similarity — top 20
  const scored = nearbyUsers
    .map(({ profile: u }) => {
      const hasActiveStatus = u.currentStatus && (!u.statusExpiresAt || u.statusExpiresAt > new Date());

      let similarity = 0;
      if (hasActiveStatus && u.statusEmbedding?.length) {
        similarity = cosineSimilarity(statusEmb, u.statusEmbedding);
      } else if (u.embedding?.length) {
        similarity = cosineSimilarity(statusEmb, u.embedding);
      }

      return {
        user: u,
        similarity,
        hasActiveStatus: Boolean(hasActiveStatus),
      };
    })
    .filter((s) => s.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 20);

  // LLM evaluation for top candidates
  const matches: { matchedUserId: string; reason: string; matchedVia: "status" | "profile" }[] = [];

  await Promise.all(
    scored.map(async ({ user: otherUser, hasActiveStatus }) => {
      const matchType = hasActiveStatus ? "status" : "profile";
      const otherContext = hasActiveStatus
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
  ee.emit("statusMatchesReady", { userId });
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
        visibilityMode: "hidden",
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
    concurrency: 5,
    limiter: { max: 20, duration: 60_000 },
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
    { jobId: `user-pairs-${userId}-${Date.now()}` },
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
    { jobId: `profile-ai-${userId}-${Date.now()}` },
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
