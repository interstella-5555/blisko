import { createHash } from "node:crypto";
import { AI_MODELS, cosineSimilarity } from "@repo/shared";
import { type Job, Queue, Worker } from "bullmq";
import { and, between, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import ms from "ms";
import { db, schema } from "@/db";
import { userIsLive } from "@/db/filters";
import { isStatusActive } from "@/lib/status";
import { t } from "@/services/i18n";
import { publishEvent } from "@/ws/redis-bridge";
import {
  analyzeConnection,
  evaluateStatusMatch,
  extractInterests,
  generateEmbedding,
  generatePortrait,
  quickScore,
} from "./ai";
import type { AiLogCtx } from "./ai-log";
import { getCanonicalText, getTranslationsForUsers, translateInline, upsertTranslation } from "./profile-translations";
import { generateNextQuestion, generateProfileFromQA } from "./profiling-ai";
import { sendPushToUser } from "./push";
import { attachWorkerLogger, getConnectionConfig, getRedisPub, QUEUE_NAMES } from "./queue-shared";

// --- Job types ---

interface AnalyzePairJob {
  type: "analyze-pair";
  userAId: string;
  userBId: string;
  nameA?: string;
  nameB?: string;
  /**
   * `true` when the analysis was requested by a user action (tap bubble, wave send).
   * On-demand runs synchronously blocking the UI → we keep Standard tier + minimal
   * reasoning for predictable latency. Batch runs (no flag) get Flex + medium so we
   * trade latency for cost + richer prose.
   */
  isOnDemand?: boolean;
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

interface EvaluateStatusMatchJob {
  type: "evaluate-status-match";
  // The user whose parent-job spawned this child (setter or moving user).
  userId: string;
  // The other user in the pair.
  candidateUserId: string;
  // Pre-resolved LLM inputs — same arg order as evaluateStatusMatch(). The child does
  // no rich-text DB fetch. Setter path: contextA = setter's status text. Proximity:
  // contextA = candidate's status (matchViaStatus) or candidate's profile (!matchViaStatus).
  contextA: string;
  contextB: string;
  matchType: "status" | "profile";
  categoriesA: string[] | null;
  categoriesB: string[] | null;
  // Parent-captured snapshot of userId's profiles.statusSetAt (ISO). Stale children
  // detect a newer status and skip silently — protects the setter-path DELETE+INSERT
  // "replace" semantic from rapid setStatus → setStatus races. null disables the check
  // (used by proximity path where userId is the moving user, not the status setter).
  stalenessKey: string | null;
  // unidirectional = setter path; bidirectional = proximity path.
  insertMode: "unidirectional" | "bidirectional";
  // WS + ambient push recipients. Setter path: [userId]. Proximity: [userId, candidateUserId].
  notifyUserIds: string[];
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
  | EvaluateStatusMatchJob;

// --- Queue (lazy init) ---

let _queue: Queue | null = null;

export function getAiQueueInstance(): Queue | null {
  return _queue;
}

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAMES.ai, {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        removeOnComplete: { count: 200, age: 3600 },
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
    const recipientProfile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, userId),
      columns: { locale: true },
    });
    void sendPushToUser(userId, {
      title: "Blisko",
      body: t("push.ambient.statusMatch.body", recipientProfile?.locale),
      data: { type: "ambient_match" },
      collapseId: "ambient-match",
    });
  }
}

function profileHash(bio: string, lookingFor: string): string {
  return createHash("sha256").update(`${bio}|${lookingFor}`).digest("hex").slice(0, 8);
}

// --- Connection analysis processors (unchanged) ---

/**
 * Writer-side staleness gate for T3 pair analysis.
 *
 * Only a `t3` row with matching hashes counts as "already done" — a `t2` row with
 * matching hashes is NOT up to date, because T2 doesn't write `shortSnippet`/
 * `longDescription`. Skipping on `t2` would make `promotePairAnalysis` a no-op and
 * leave the modal stuck on the `commonInterests` fallback forever (BLI-194).
 */
export function isPairAnalysisUpToDate(
  existing:
    | { tier: "t1" | "t2" | "t3"; fromProfileHash: string | null; toProfileHash: string | null }
    | null
    | undefined,
  hashA: string,
  hashB: string,
): boolean {
  return existing?.tier === "t3" && existing.fromProfileHash === hashA && existing.toProfileHash === hashB;
}

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

  if (isPairAnalysisUpToDate(existingAB, hashA, hashB)) {
    console.log(
      `[queue] analyze-pair done | db-fetch: ${(tFetch - t0).toFixed(0)}ms | total: ${(tFetch - t0).toFixed(0)}ms | pair: ${nameA} → ${nameB} | skipped: true`,
    );
    return;
  }

  // --- ai-call phase ---
  const tAi0 = performance.now();
  const isOnDemand = job.data.isOnDemand === true;

  // Matching pipeline reads canonical PL — UA originals + their cached PL
  // translations cover the same data, the LLM just stays on one language.
  // BLI-279 D6.
  const trMap = await getTranslationsForUsers([userAId, userBId]);
  const trA = trMap.get(userAId) ?? [];
  const trB = trMap.get(userBId) ?? [];
  const portraitA = getCanonicalText(profileA, "portrait", trA) ?? profileA.portrait;
  const portraitB = getCanonicalText(profileB, "portrait", trB) ?? profileB.portrait;
  const lookingForA = getCanonicalText(profileA, "looking_for", trA) ?? profileA.lookingFor;
  const lookingForB = getCanonicalText(profileB, "looking_for", trB) ?? profileB.lookingFor;

  const result = await analyzeConnection(
    {
      portrait: portraitA,
      displayName: profileA.displayName,
      lookingFor: lookingForA,
      superpower: profileA.superpower,
    },
    {
      portrait: portraitB,
      displayName: profileB.displayName,
      lookingFor: lookingForB,
      superpower: profileB.superpower,
    },
    {
      jobName: "analyze-pair",
      userId: userAId,
      targetUserId: userBId,
      model: AI_MODELS.async,
      serviceTier: isOnDemand ? "standard" : "flex",
      reasoningEffort: isOnDemand ? "minimal" : "medium",
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
      tier: "t3",
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
        tier: "t3",
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
      tier: "t3",
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
        tier: "t3",
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

  // Canonical PL — see BLI-279 D6.
  const trMap = await getTranslationsForUsers([userAId, userBId]);
  const trA = trMap.get(userAId) ?? [];
  const trB = trMap.get(userBId) ?? [];
  const portraitA = getCanonicalText(profileA, "portrait", trA) ?? profileA.portrait;
  const portraitB = getCanonicalText(profileB, "portrait", trB) ?? profileB.portrait;
  const lookingForA = getCanonicalText(profileA, "looking_for", trA) ?? profileA.lookingFor;
  const lookingForB = getCanonicalText(profileB, "looking_for", trB) ?? profileB.lookingFor;

  const result = await quickScore(
    {
      portrait: portraitA,
      displayName: profileA.displayName,
      lookingFor: lookingForA,
      superpower: profileA.superpower,
    },
    {
      portrait: portraitB,
      displayName: profileB.displayName,
      lookingFor: lookingForB,
      superpower: profileB.superpower,
    },
    {
      jobName: "quick-score",
      userId: userAId,
      targetUserId: userBId,
      model: AI_MODELS.async,
      serviceTier: "flex",
      reasoningEffort: "minimal",
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
      tier: "t2",
      fromProfileHash: hashA,
      toProfileHash: hashB,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.connectionAnalyses.fromUserId, schema.connectionAnalyses.toUserId],
      set: {
        aiMatchScore: result.scoreForA,
        tier: "t2",
        fromProfileHash: hashA,
        toProfileHash: hashB,
        updatedAt: now,
      },
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
      tier: "t2",
      fromProfileHash: hashB,
      toProfileHash: hashA,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.connectionAnalyses.fromUserId, schema.connectionAnalyses.toUserId],
      set: {
        aiMatchScore: result.scoreForB,
        tier: "t2",
        fromProfileHash: hashB,
        toProfileHash: hashA,
        updatedAt: now,
      },
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
        userIsLive(),
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
  // GPT calls (portrait, interests) run on gpt-5-mini flex minimal.
  // Embedding stays on text-embedding-3-small standard — flex N/A for embeddings.
  const gptCtx: AiLogCtx = {
    jobName: "generate-profile-ai",
    userId,
    model: AI_MODELS.async,
    serviceTier: "flex",
    reasoningEffort: "minimal",
  };
  const embeddingCtx: AiLogCtx = { jobName: "generate-profile-ai", userId };

  // Need contentLocale to (a) generate portrait in the user's language as
  // canonical and (b) feed embedding + interests off the PL version regardless
  // (matching pipeline expects PL — D6 in BLI-279).
  const userProfile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    columns: { contentLocale: true },
  });
  const contentLocale = userProfile?.contentLocale ?? "pl";

  const portraitDual = await generatePortrait(bio, lookingFor, contentLocale, gptCtx);
  const canonicalPortrait = contentLocale === "ua" ? portraitDual.ua : portraitDual.pl;
  const portraitForEmbedding = portraitDual.pl; // matching pipeline = always PL

  const [embedding, interests] = await Promise.all([
    generateEmbedding(portraitForEmbedding, embeddingCtx),
    extractInterests(portraitForEmbedding, gptCtx),
  ]);

  // Translate bio + lookingFor to the non-canonical locale. These are
  // user-editable, so the caller might have written them (profiles.update,
  // applyProfile). Running here keeps the translation/regeneration step
  // unified — viewer sees a coherent profile in their locale once
  // `profileReady` fires.
  const nonCanonicalLocale = contentLocale === "ua" ? "pl" : "ua";
  const translateCtx: AiLogCtx = {
    jobName: "translate-ugc",
    userId,
    model: AI_MODELS.async,
    serviceTier: "flex",
    reasoningEffort: "minimal",
  };
  const [bioTranslated, lookingForTranslated] = await Promise.all([
    translateInline(bio, contentLocale, nonCanonicalLocale, translateCtx),
    translateInline(lookingFor, contentLocale, nonCanonicalLocale, translateCtx),
  ]);

  // Write canonical + translations in one transaction. Mass DELETE of
  // existing rows is safe — profile_translations is regenerated on every AI
  // run, so a partial state never leaks to viewers.
  await db.transaction(async (tx) => {
    await tx
      .update(schema.profiles)
      .set({
        portrait: canonicalPortrait,
        embedding,
        interests,
        updatedAt: new Date(),
      })
      .where(eq(schema.profiles.userId, userId));

    await tx
      .delete(schema.profileTranslations)
      .where(
        and(
          eq(schema.profileTranslations.userId, userId),
          inArray(schema.profileTranslations.field, ["bio", "looking_for", "portrait"]),
        ),
      );

    const nonCanonicalPortrait = contentLocale === "ua" ? portraitDual.pl : portraitDual.ua;
    if (nonCanonicalPortrait && nonCanonicalPortrait !== canonicalPortrait) {
      await upsertTranslation(userId, "portrait", nonCanonicalLocale, nonCanonicalPortrait, tx);
    }
    if (bioTranslated && bioTranslated !== bio) {
      await upsertTranslation(userId, "bio", nonCanonicalLocale, bioTranslated, tx);
    }
    if (lookingForTranslated && lookingForTranslated !== lookingFor) {
      await upsertTranslation(userId, "looking_for", nonCanonicalLocale, lookingForTranslated, tx);
    }
  });

  publishEvent("profileReady", { userId });
}

// --- Profiling question processor ---

async function processGenerateProfilingQuestion(job: GenerateProfilingQuestionJob) {
  const { sessionId, displayName, qaHistory, previousSessionQA, userRequestedMore, directionHint } = job;

  const questionNumber = qaHistory.length + 1;

  const result = await generateNextQuestion(
    displayName,
    qaHistory,
    {
      previousSessionQA,
      userRequestedMore,
      directionHint,
    },
    {
      jobName: "generate-profiling-question",
      userId: job.userId,
      model: AI_MODELS.async,
      serviceTier: "flex",
      reasoningEffort: "minimal",
    },
  );

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

  // Resolve the user's locale up front — the prompt asks the model to write
  // the source-language version in this locale, so it matches what the user
  // sees in their app.
  const userProfile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, job.userId),
    columns: { contentLocale: true },
  });
  const contentLocale = userProfile?.contentLocale ?? "pl";

  const result = await generateProfileFromQA(displayName, qaHistory, previousSessionQA, contentLocale, {
    jobName: "generate-profile-from-qa",
    userId: job.userId,
    model: AI_MODELS.async,
    // User waits on the "Ostatni krok" screen — standard tier for guaranteed
    // capacity; flex can be deferred/downgraded by OpenAI under load.
    serviceTier: "standard",
    // Minimal reasoning leaves the full maxOutputTokens budget for the actual
    // output (portrait is 200-400 PL words, can exceed 800 tokens).
    reasoningEffort: "minimal",
  });

  const canonical = contentLocale === "ua" ? result.ua : result.pl;

  // Session stores the "preview" the user will accept in `applyProfile`.
  // The non-canonical translations are NOT stored on the session — they live
  // on profile_translations after applyProfile commits. Until then, the user
  // is editing the canonical version in the preview UI.
  await db
    .update(schema.profilingSessions)
    .set({
      generatedBio: canonical.bio,
      generatedLookingFor: canonical.lookingFor,
      generatedPortrait: canonical.portrait,
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
  if (user.visibilityMode === "ninja") return;

  // Canonical PL — embedding + LLM reason should be in PL so cross-locale
  // matches use the same vector space. BLI-279 D6.
  const trMap = await getTranslationsForUsers([userId]);
  const userTr = trMap.get(userId) ?? [];
  const statusTextPL = getCanonicalText(user, "current_status", userTr) ?? user.currentStatus;

  // Generate embedding for status text
  const statusEmb = await generateEmbedding(statusTextPL, { jobName: "status-matching", userId });
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
        userIsLive(),
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

  // Replace old matches with new ones BEFORE fan-out. Children only INSERT → the
  // DELETE preserves the setter-path "replace" semantic even when children run in
  // parallel on separate worker slots (BLI-167).
  await db.delete(schema.statusMatches).where(eq(schema.statusMatches.userId, userId));

  // Emit immediately so the client drops stale pulsing bubbles for the old status
  // while LLM evaluation is still in flight. Matches that land later re-fire this.
  publishEvent("statusMatchesReady", { userId, matchedUserIds: [] });

  if (scored.length === 0) return;

  // Invariant: `setStatus` always writes `statusSetAt: new Date()`, and the early
  // `if (!user?.currentStatus)` guard above rejects rows without a status. So in
  // practice `statusSetAt` is non-null here — the fallback to `null` is just a
  // belt-and-suspenders; a null stalenessKey would disable the child-side guard.
  const stalenessKey = user.statusSetAt ? user.statusSetAt.toISOString() : null;

  // Resolve canonical PL bio/lookingFor/currentStatus for every candidate so
  // the downstream LLM prompt is always in one language. BLI-279 D6.
  const candidateIds = scored.map(({ user: u }) => u.userId);
  const candidateTrMap = await getTranslationsForUsers(candidateIds);

  await enqueueEvaluateStatusMatchJobs(
    scored.map(({ user: otherUser, matchViaStatus }) => {
      const tr = candidateTrMap.get(otherUser.userId) ?? [];
      const otherStatusPL = getCanonicalText(otherUser, "current_status", tr) ?? otherUser.currentStatus ?? "";
      const otherBioPL = getCanonicalText(otherUser, "bio", tr) ?? otherUser.bio;
      const otherLookingForPL = getCanonicalText(otherUser, "looking_for", tr) ?? otherUser.lookingFor;
      return {
        type: "evaluate-status-match" as const,
        userId,
        candidateUserId: otherUser.userId,
        contextA: statusTextPL,
        contextB: matchViaStatus ? otherStatusPL : `${otherBioPL}. Szuka: ${otherLookingForPL}`,
        matchType: matchViaStatus ? "status" : "profile",
        categoriesA: user.statusCategories,
        categoriesB: matchViaStatus ? otherUser.statusCategories : null,
        stalenessKey,
        insertMode: "unidirectional",
        notifyUserIds: [userId],
      };
    }),
  );
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
      statusCategories: true,
      statusEmbedding: true,
      statusSetAt: true,
      embedding: true,
      bio: true,
      lookingFor: true,
      contentLocale: true,
    },
  });

  if (!movingUser?.isComplete) return;
  if (movingUser.visibilityMode === "ninja") return;

  // Pre-fetch moving user's translations so embedding + LLM stay in PL.
  // BLI-279 D6.
  const movingTrMap = await getTranslationsForUsers([userId]);
  const movingUserTr = movingTrMap.get(userId) ?? [];
  const movingStatusPL = movingUser.currentStatus
    ? (getCanonicalText(movingUser, "current_status", movingUserTr) ?? movingUser.currentStatus)
    : null;

  // Generate status embedding if moving user has status but no embedding yet
  let movingUserStatusEmb = movingUser.statusEmbedding;
  if (movingStatusPL && !movingUserStatusEmb?.length) {
    movingUserStatusEmb = await generateEmbedding(movingStatusPL, {
      jobName: "proximity-status-matching",
      userId,
    });
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
        statusCategories: schema.profiles.statusCategories,
        statusEmbedding: schema.profiles.statusEmbedding,
        statusSetAt: schema.profiles.statusSetAt,
        embedding: schema.profiles.embedding,
        bio: schema.profiles.bio,
        lookingFor: schema.profiles.lookingFor,
        contentLocale: schema.profiles.contentLocale,
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
        userIsLive(),
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

  console.log(`[queue] proximity-status-matching for ${userId}: fanning out ${scored.length} children`);

  // Canonical PL versions for prompt — BLI-279 D6.
  const movingBioPL = getCanonicalText(movingUser, "bio", movingUserTr) ?? movingUser.bio;
  const movingLookingForPL = getCanonicalText(movingUser, "looking_for", movingUserTr) ?? movingUser.lookingFor;
  const movingContext = movingUserHasStatus
    ? (movingStatusPL ?? movingUser.currentStatus!)
    : `${movingBioPL}. Szuka: ${movingLookingForPL}`;

  const candidateUserIds = scored.map(({ candidate }) => candidate.userId);
  const candidateTrMap = await getTranslationsForUsers(candidateUserIds);

  // Mirror original processProximityStatusMatching arg order to evaluateStatusMatch:
  // (candidateContext, movingContext, ...) — candidate is the "setter" side in proximity
  // (they had an active status that moving user walked into range of).
  await enqueueEvaluateStatusMatchJobs(
    scored.map(({ candidate, matchViaStatus }) => {
      const tr = candidateTrMap.get(candidate.userId) ?? [];
      const candStatusPL = getCanonicalText(candidate, "current_status", tr) ?? candidate.currentStatus ?? "";
      const candBioPL = getCanonicalText(candidate, "bio", tr) ?? candidate.bio;
      const candLookingForPL = getCanonicalText(candidate, "looking_for", tr) ?? candidate.lookingFor;
      return {
        type: "evaluate-status-match" as const,
        userId,
        candidateUserId: candidate.userId,
        contextA: matchViaStatus ? candStatusPL : `${candBioPL}. Szuka: ${candLookingForPL}`,
        contextB: movingContext,
        matchType: matchViaStatus ? "status" : "profile",
        categoriesA: matchViaStatus ? candidate.statusCategories : null,
        categoriesB: movingUserHasStatus ? movingUser.statusCategories : null,
        // No staleness guard for proximity — userId is the moving user, not a status setter.
        // The proximity-status-matching parent itself is debounced 2min, so we accept
        // that a candidate changing their status mid-debounce may yield a match for a
        // slightly-stale status. Rare + self-heals on next setStatus run.
        stalenessKey: null,
        insertMode: "bidirectional",
        notifyUserIds: [userId, candidate.userId],
      };
    }),
  );
}

// --- Per-pair status match evaluation (child of status-matching / proximity-status-matching) ---

async function processEvaluateStatusMatch(job: EvaluateStatusMatchJob) {
  const {
    userId,
    candidateUserId,
    contextA,
    contextB,
    matchType,
    categoriesA,
    categoriesB,
    stalenessKey,
    insertMode,
    notifyUserIds,
  } = job;

  // Staleness guard: if userId's status changed after the parent enqueued this child,
  // skip silently. Setter-path only — proximity passes null.
  if (stalenessKey) {
    const current = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, userId),
      columns: { statusSetAt: true, currentStatus: true },
    });
    const currentIso = current?.statusSetAt ? current.statusSetAt.toISOString() : null;
    if (!current?.currentStatus || currentIso !== stalenessKey) {
      console.log(`[queue] evaluate-status-match stale for ${userId} → ${candidateUserId}, skipping`);
      return;
    }
  }

  const result = await evaluateStatusMatch(contextA, contextB, matchType, categoriesA, categoriesB, {
    jobName: "evaluate-status-match",
    userId,
    targetUserId: candidateUserId,
    model: AI_MODELS.async,
    serviceTier: "flex",
    reasoningEffort: "minimal",
  });

  if (!result.isMatch) return;

  const rows =
    insertMode === "bidirectional"
      ? [
          { userId: candidateUserId, matchedUserId: userId, reason: result.reason, matchedVia: matchType },
          { userId, matchedUserId: candidateUserId, reason: result.reason, matchedVia: matchType },
        ]
      : [{ userId, matchedUserId: candidateUserId, reason: result.reason, matchedVia: matchType }];

  await db
    .insert(schema.statusMatches)
    .values(rows)
    .onConflictDoNothing({ target: [schema.statusMatches.userId, schema.statusMatches.matchedUserId] });

  // Report the OTHER side as the matched user for each recipient. Proximity fires
  // the event for both users, so sending `[candidateUserId]` unconditionally would
  // tell the candidate they matched with themselves.
  for (const uid of notifyUserIds) {
    const otherUserId = uid === userId ? candidateUserId : userId;
    publishEvent("statusMatchesReady", { userId: uid, matchedUserIds: [otherUserId] });
  }

  for (const uid of notifyUserIds) {
    await sendAmbientPushWithCooldown(uid);
  }
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
    case "evaluate-status-match":
      await processEvaluateStatusMatch(data);
      break;
  }
}

// --- Worker ---

let _worker: Worker | null = null;

export function startAiWorker() {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL not set, skipping queue worker");
    return;
  }

  _worker = new Worker(QUEUE_NAMES.ai, processJob, {
    connection: getConnectionConfig(),
    concurrency: 50,
  });

  attachWorkerLogger(_worker, QUEUE_NAMES.ai);

  // Self-healing failure handlers — publish WS events so mobile clients can retry
  _worker.on("failed", (job) => {
    if (!job?.opts.attempts || job.attemptsMade < job.opts.attempts) return;

    const data = job.data as AIJob;
    if (data.type === "analyze-pair" || data.type === "quick-score") {
      publishEvent("analysisFailed", {
        userAId: data.userAId,
        userBId: data.userBId,
      });
    }
    if (data.type === "generate-profiling-question") {
      publishEvent("questionFailed", {
        userId: data.userId,
        sessionId: data.sessionId,
        questionNumber: data.qaHistory.length + 1,
      });
    }
    if (data.type === "generate-profile-from-qa") {
      publishEvent("profilingFailed", {
        userId: data.userId,
        sessionId: data.sessionId,
      });
    }
    if (data.type === "generate-profile-ai") {
      publishEvent("profileFailed", { userId: data.userId });
    }
    if (data.type === "status-matching") {
      publishEvent("statusMatchingFailed", { userId: data.userId });
    }
  });

  console.log("[queue:ai] AI jobs worker started");
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
  const queue = getQueue();
  await queue.add(
    "quick-score",
    { type: "quick-score", userAId: a, userBId: b },
    { deduplication: { id: `quick-score-${a}-${b}` } },
  );
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

  // Add without priority → FIFO queue, processed before all prioritized jobs.
  // `isOnDemand` signals the processor to use Standard tier + minimal reasoning (latency-sensitive).
  await queue.add("analyze-pair", { type: "analyze-pair", userAId: a, userBId: b, isOnDemand: true }, { jobId });
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
    { deduplication: { id: `profiling-q-${sessionId}-${qaHistory.length + 1}` } },
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
    { deduplication: { id: `profile-from-qa-${sessionId}` } },
  );
}

export async function enqueueStatusMatching(userId: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    "status-matching",
    { type: "status-matching", userId },
    {
      deduplication: { id: `status-matching-${userId}` },
    },
  );
}

async function enqueueEvaluateStatusMatchJobs(jobs: EvaluateStatusMatchJob[]) {
  if (!process.env.REDIS_URL) return;
  if (jobs.length === 0) return;

  const queue = getQueue();
  await queue.addBulk(
    jobs.map((data) => ({
      name: "evaluate-status-match",
      data,
      // Dedup id embeds the stalenessKey so a newer setStatus epoch gets fresh children
      // (old-epoch children may still be queued; stale check on run rejects them).
      opts: {
        deduplication: {
          id: `evaluate-status-match-${data.userId}-${data.candidateUserId}-${data.stalenessKey ?? "na"}`,
        },
      },
    })),
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
    },
  );
}
