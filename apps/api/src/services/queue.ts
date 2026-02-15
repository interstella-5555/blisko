import { Queue, Worker, type Job } from 'bullmq';
import { createHash } from 'crypto';
import { eq, and, ne, sql } from 'drizzle-orm';
import { cosineSimilarity } from '@repo/shared';
import { db } from '../db';
import { profiles, connectionAnalyses, blocks, profilingSessions, profilingQA } from '../db/schema';
import {
  analyzeConnection,
  generateSocialProfile,
  generateEmbedding,
  extractInterests,
} from './ai';
import { generateNextQuestion, generateProfileFromQA } from './profiling-ai';
import { ee } from '../ws/events';

function getConnectionConfig() {
  const url = new URL(process.env.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

// --- Job types ---

interface AnalyzePairJob {
  type: 'analyze-pair';
  userAId: string;
  userBId: string;
}

interface AnalyzeUserPairsJob {
  type: 'analyze-user-pairs';
  userId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

interface GenerateProfileAIJob {
  type: 'generate-profile-ai';
  userId: string;
  bio: string;
  lookingFor: string;
}

interface GenerateProfilingQuestionJob {
  type: 'generate-profiling-question';
  sessionId: string;
  userId: string;
  displayName: string;
  qaHistory: { question: string; answer: string }[];
  previousSessionQA?: { question: string; answer: string }[];
  userRequestedMore?: boolean;
  directionHint?: string;
}

interface GenerateProfileFromQAJob {
  type: 'generate-profile-from-qa';
  sessionId: string;
  userId: string;
  displayName: string;
  qaHistory: { question: string; answer: string }[];
  previousSessionQA?: { question: string; answer: string }[];
}

type AIJob =
  | AnalyzePairJob
  | AnalyzeUserPairsJob
  | GenerateProfileAIJob
  | GenerateProfilingQuestionJob
  | GenerateProfileFromQAJob;

// --- Queue (lazy init) ---

let _queue: Queue | null = null;

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue('ai-jobs', {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        removeOnComplete: { count: 500, age: 3600 },
        removeOnFail: { count: 100 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return _queue!;
}

// --- Helpers ---

function profileHash(bio: string, lookingFor: string): string {
  return createHash('sha256')
    .update(`${bio}|${lookingFor}`)
    .digest('hex')
    .slice(0, 8);
}

// --- Connection analysis processors (unchanged) ---

async function processAnalyzePair(job: Job<AnalyzePairJob>, userAId: string, userBId: string) {
  const t0 = performance.now();

  // --- db-fetch phase ---
  const [profileA] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userAId));
  const [profileB] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userBId));

  const nameA = job.data.nameA ?? profileA?.displayName ?? userAId.slice(0, 8);
  const nameB = job.data.nameB ?? profileB?.displayName ?? userBId.slice(0, 8);

  if (!profileA?.socialProfile || !profileB?.socialProfile) {
    console.log(`[queue] analyze-pair skip (no profile) | db-fetch: ${(performance.now() - t0).toFixed(0)}ms | pair: ${nameA} → ${nameB}`);
    return;
  }

  const hashA = profileHash(profileA.bio, profileA.lookingFor);
  const hashB = profileHash(profileB.bio, profileB.lookingFor);

  const [existingAB] = await db
    .select()
    .from(connectionAnalyses)
    .where(
      and(
        eq(connectionAnalyses.fromUserId, userAId),
        eq(connectionAnalyses.toUserId, userBId)
      )
    );

  const tFetch = performance.now();

  if (
    existingAB &&
    existingAB.fromProfileHash === hashA &&
    existingAB.toProfileHash === hashB
  ) {
    console.log(`[queue] analyze-pair done | db-fetch: ${(tFetch - t0).toFixed(0)}ms | total: ${(tFetch - t0).toFixed(0)}ms | pair: ${nameA} → ${nameB} | skipped: true`);
    return;
  }

  // --- ai-call phase ---
  const tAi0 = performance.now();
  const result = await analyzeConnection(
    {
      socialProfile: profileA.socialProfile,
      displayName: profileA.displayName,
      lookingFor: profileA.lookingFor,
    },
    {
      socialProfile: profileB.socialProfile,
      displayName: profileB.displayName,
      lookingFor: profileB.lookingFor,
    }
  );
  const tAi = performance.now();

  // --- db-write phase ---
  const tWrite0 = performance.now();
  const now = new Date();

  if (existingAB) {
    await db
      .update(connectionAnalyses)
      .set({
        shortSnippet: result.snippetForA,
        longDescription: result.descriptionForA,
        aiMatchScore: result.matchScoreForA,
        fromProfileHash: hashA,
        toProfileHash: hashB,
        updatedAt: now,
      })
      .where(eq(connectionAnalyses.id, existingAB.id));
  } else {
    await db.insert(connectionAnalyses).values({
      fromUserId: userAId,
      toUserId: userBId,
      shortSnippet: result.snippetForA,
      longDescription: result.descriptionForA,
      aiMatchScore: result.matchScoreForA,
      fromProfileHash: hashA,
      toProfileHash: hashB,
      createdAt: now,
      updatedAt: now,
    });
  }

  ee.emit('analysisReady', {
    forUserId: userAId,
    aboutUserId: userBId,
    shortSnippet: result.snippetForA,
  });

  const [existingBA] = await db
    .select()
    .from(connectionAnalyses)
    .where(
      and(
        eq(connectionAnalyses.fromUserId, userBId),
        eq(connectionAnalyses.toUserId, userAId)
      )
    );

  if (existingBA) {
    await db
      .update(connectionAnalyses)
      .set({
        shortSnippet: result.snippetForB,
        longDescription: result.descriptionForB,
        aiMatchScore: result.matchScoreForB,
        fromProfileHash: hashB,
        toProfileHash: hashA,
        updatedAt: now,
      })
      .where(eq(connectionAnalyses.id, existingBA.id));
  } else {
    await db.insert(connectionAnalyses).values({
      fromUserId: userBId,
      toUserId: userAId,
      shortSnippet: result.snippetForB,
      longDescription: result.descriptionForB,
      aiMatchScore: result.matchScoreForB,
      fromProfileHash: hashB,
      toProfileHash: hashA,
      createdAt: now,
      updatedAt: now,
    });
  }

  ee.emit('analysisReady', {
    forUserId: userBId,
    aboutUserId: userAId,
    shortSnippet: result.snippetForB,
  });

  const tWrite = performance.now();

  console.log(`[queue] analyze-pair done | db-fetch: ${(tFetch - t0).toFixed(0)}ms | ai: ${(tAi - tAi0).toFixed(0)}ms | db-write: ${(tWrite - tWrite0).toFixed(0)}ms | total: ${(tWrite - t0).toFixed(0)}ms | pair: ${nameA} → ${nameB} | skipped: false`);
}

async function processAnalyzeUserPairs(
  userId: string,
  latitude: number,
  longitude: number,
  radiusMeters: number
) {
  const queue = getQueue();

  const latDelta = radiusMeters / 111000;
  const lonDelta =
    radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

  const minLat = latitude - latDelta;
  const maxLat = latitude + latDelta;
  const minLon = longitude - lonDelta;
  const maxLon = longitude + lonDelta;

  const [blockedUsers, blockedByUsers] = await Promise.all([
    db
      .select({ blockedId: blocks.blockedId })
      .from(blocks)
      .where(eq(blocks.blockerId, userId)),
    db
      .select({ blockerId: blocks.blockerId })
      .from(blocks)
      .where(eq(blocks.blockedId, userId)),
  ]);

  const allBlockedIds = new Set([
    ...blockedUsers.map((b) => b.blockedId),
    ...blockedByUsers.map((b) => b.blockerId),
  ]);

  // Fetch current user's embedding & interests for ranking
  const [myProfile] = await db
    .select({
      displayName: profiles.displayName,
      embedding: profiles.embedding,
      interests: profiles.interests,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId));

  const myEmbedding = myProfile?.embedding ?? [];
  const myInterests = new Set(myProfile?.interests ?? []);

  // Find nearby users with data needed for priority ranking
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
      userId: profiles.userId,
      displayName: profiles.displayName,
      embedding: profiles.embedding,
      interests: profiles.interests,
      distance: distanceFormula,
    })
    .from(profiles)
    .where(
      and(
        ne(profiles.userId, userId),
        eq(profiles.isHidden, false),
        sql`${profiles.latitude} BETWEEN ${minLat} AND ${maxLat}`,
        sql`${profiles.longitude} BETWEEN ${minLon} AND ${maxLon}`,
        sql`${distanceFormula} <= ${radiusMeters}`
      )
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

      const matchScore = similarity > 0
        ? 0.7 * similarity + 0.3 * interestScore
        : interestScore;
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
    await queue.add(
      'analyze-pair',
      { type: 'analyze-pair', userAId: a, userBId: b, nameA, nameB, requestedBy: myName },
      { jobId: `pair-${a}-${b}`, priority: i + 1 }
    );
  }
}


// --- Profile AI processor (refactored from sync) ---

async function processGenerateProfileAI(userId: string, bio: string, lookingFor: string) {
  const socialProfile = await generateSocialProfile(bio, lookingFor);
  const [embedding, interests] = await Promise.all([
    generateEmbedding(socialProfile),
    extractInterests(socialProfile),
  ]);

  await db
    .update(profiles)
    .set({
      socialProfile,
      embedding,
      interests,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, userId));

  ee.emit('profileReady', { userId });
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

  await db.insert(profilingQA).values({
    sessionId,
    questionNumber,
    question: result.question,
    suggestions: result.suggestions,
    sufficient: result.sufficient,
  });

  ee.emit('questionReady', {
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
    .update(profilingSessions)
    .set({
      generatedBio: result.bio,
      generatedLookingFor: result.lookingFor,
      generatedPortrait: result.portrait,
      status: 'completed',
      completedAt: new Date(),
    })
    .where(eq(profilingSessions.id, sessionId));

  ee.emit('profilingComplete', {
    userId: job.userId,
    sessionId,
  });
}

// --- Main job processor ---

async function processJob(job: Job<AIJob>) {
  const data = job.data;
  const queueWait = job.processedOn ? job.processedOn - job.timestamp : 0;
  console.log(`[queue] processing ${data.type} | jobId: ${job.id} | wait: ${(queueWait / 1000).toFixed(1)}s`);

  switch (data.type) {
    case 'analyze-pair':
      await processAnalyzePair(job as Job<AnalyzePairJob>, data.userAId, data.userBId);
      break;
    case 'analyze-user-pairs':
      await processAnalyzeUserPairs(
        data.userId,
        data.latitude,
        data.longitude,
        data.radiusMeters
      );
      break;
    case 'generate-profile-ai':
      await processGenerateProfileAI(data.userId, data.bio, data.lookingFor);
      break;
    case 'generate-profiling-question':
      await processGenerateProfilingQuestion(data);
      break;
    case 'generate-profile-from-qa':
      await processGenerateProfileFromQA(data);
      break;
  }
}

// --- Worker ---

let _worker: Worker | null = null;

export function startWorker() {
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not set, skipping queue worker');
    return;
  }

  _worker = new Worker('ai-jobs', processJob, {
    connection: getConnectionConfig(),
    concurrency: 5,
    limiter: { max: 20, duration: 60_000 },
  });

  _worker.on('completed', (job) => {
    console.log(`[queue] Job ${job.id} completed (${job.data.type})`);
  });

  _worker.on('failed', (job, err) => {
    console.error(`[queue] Job ${job?.id} failed:`, err.message);
  });

  console.log('[queue] AI jobs worker started');
}

// --- Enqueue functions ---

export async function enqueueUserPairAnalysis(
  userId: string,
  latitude: number,
  longitude: number,
  radiusMeters: number = 5000
) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    'analyze-user-pairs',
    {
      type: 'analyze-user-pairs',
      userId,
      latitude,
      longitude,
      radiusMeters,
    },
    { jobId: `user-pairs-${userId}-${Date.now()}` }
  );
}

export async function enqueuePairAnalysis(
  userAId: string,
  userBId: string,
  opts?: { nameA?: string; nameB?: string; requestedBy?: string }
) {
  if (!process.env.REDIS_URL) return;

  const [a, b] = [userAId, userBId].sort();
  // Match names to sorted order
  const nameA = a === userAId ? opts?.nameA : opts?.nameB;
  const nameB = b === userAId ? opts?.nameA : opts?.nameB;
  const queue = getQueue();
  await queue.add(
    'analyze-pair',
    { type: 'analyze-pair', userAId: a, userBId: b, nameA, nameB, requestedBy: opts?.requestedBy },
    { jobId: `pair-${a}-${b}` }
  );
}

export async function enqueueProfileAI(
  userId: string,
  bio: string,
  lookingFor: string
) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    'generate-profile-ai',
    { type: 'generate-profile-ai', userId, bio, lookingFor },
    { jobId: `profile-ai-${userId}-${Date.now()}` }
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
  }
) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    'generate-profiling-question',
    {
      type: 'generate-profiling-question',
      sessionId,
      userId,
      displayName,
      qaHistory,
      previousSessionQA: options?.previousSessionQA,
      userRequestedMore: options?.userRequestedMore,
      directionHint: options?.directionHint,
    },
    { jobId: `profiling-q-${sessionId}-${qaHistory.length + 1}` }
  );
}

export async function enqueueProfileFromQA(
  sessionId: string,
  userId: string,
  displayName: string,
  qaHistory: { question: string; answer: string }[],
  previousSessionQA?: { question: string; answer: string }[]
) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    'generate-profile-from-qa',
    {
      type: 'generate-profile-from-qa',
      sessionId,
      userId,
      displayName,
      qaHistory,
      previousSessionQA,
    },
    { jobId: `profile-from-qa-${sessionId}` }
  );
}
