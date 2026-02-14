import { Queue, Worker, type Job } from 'bullmq';
import { createHash } from 'crypto';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import { profiles, connectionAnalyses, blocks } from '../db/schema';
import { analyzeConnection } from './ai';
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

// Job types
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

type AnalysisJob = AnalyzePairJob | AnalyzeUserPairsJob;

// Queue (lazy init)
let _queue: Queue | null = null;

function getAnalysisQueue(): Queue {
  if (!_queue) {
    _queue = new Queue('connection-analysis', {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    });
  }
  return _queue!;
}

function profileHash(bio: string, lookingFor: string): string {
  return createHash('sha256')
    .update(`${bio}|${lookingFor}`)
    .digest('hex')
    .slice(0, 8);
}

async function processAnalyzePair(userAId: string, userBId: string) {
  // Fetch both profiles
  const [profileA] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userAId));
  const [profileB] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userBId));

  if (!profileA?.socialProfile || !profileB?.socialProfile) return;

  const hashA = profileHash(profileA.bio, profileA.lookingFor);
  const hashB = profileHash(profileB.bio, profileB.lookingFor);

  // Check if analysis exists and is fresh (A→B direction)
  const [existingAB] = await db
    .select()
    .from(connectionAnalyses)
    .where(
      and(
        eq(connectionAnalyses.fromUserId, userAId),
        eq(connectionAnalyses.toUserId, userBId)
      )
    );

  if (
    existingAB &&
    existingAB.fromProfileHash === hashA &&
    existingAB.toProfileHash === hashB
  ) {
    return; // Fresh, skip
  }

  // Call AI — one call for both perspectives
  const result = await analyzeConnection(
    {
      socialProfile: profileA.socialProfile,
      displayName: profileA.displayName,
    },
    {
      socialProfile: profileB.socialProfile,
      displayName: profileB.displayName,
    }
  );

  const now = new Date();

  // Upsert A→B
  if (existingAB) {
    await db
      .update(connectionAnalyses)
      .set({
        shortSnippet: result.snippetForA,
        longDescription: result.descriptionForA,
        aiMatchScore: result.matchScore,
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
      aiMatchScore: result.matchScore,
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

  // Upsert B→A
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
        aiMatchScore: result.matchScore,
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
      aiMatchScore: result.matchScore,
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
}

async function processAnalyzeUserPairs(
  userId: string,
  latitude: number,
  longitude: number,
  radiusMeters: number
) {
  const queue = getAnalysisQueue();

  // Calculate bounding box (same logic as profiles.ts)
  const latDelta = radiusMeters / 111000;
  const lonDelta =
    radiusMeters / (111000 * Math.cos((latitude * Math.PI) / 180));

  const minLat = latitude - latDelta;
  const maxLat = latitude + latDelta;
  const minLon = longitude - lonDelta;
  const maxLon = longitude + lonDelta;

  // Get blocked user IDs
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

      return { userId: u.userId, rankScore };
    })
    .sort((a, b) => b.rankScore - a.rankScore);

  // Queue analyze-pair jobs — priority 1 (highest) for top-ranked users
  for (let i = 0; i < scored.length; i++) {
    const [a, b] = [userId, scored[i].userId].sort();
    await queue.add(
      'analyze-pair',
      { type: 'analyze-pair', userAId: a, userBId: b },
      { jobId: `pair-${a}-${b}`, priority: i + 1 }
    );
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function processJob(job: Job<AnalysisJob>) {
  const data = job.data;

  if (data.type === 'analyze-pair') {
    await processAnalyzePair(data.userAId, data.userBId);
  } else if (data.type === 'analyze-user-pairs') {
    await processAnalyzeUserPairs(
      data.userId,
      data.latitude,
      data.longitude,
      data.radiusMeters
    );
  }
}

let _worker: Worker | null = null;

export function startWorker() {
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not set, skipping queue worker');
    return;
  }

  _worker = new Worker('connection-analysis', processJob, {
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

  console.log('[queue] Connection analysis worker started');
}

export async function enqueueUserPairAnalysis(
  userId: string,
  latitude: number,
  longitude: number,
  radiusMeters: number = 5000
) {
  if (!process.env.REDIS_URL) return;

  const queue = getAnalysisQueue();
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
  userBId: string
) {
  if (!process.env.REDIS_URL) return;

  const [a, b] = [userAId, userBId].sort();
  const queue = getAnalysisQueue();
  await queue.add(
    'analyze-pair',
    { type: 'analyze-pair', userAId: a, userBId: b },
    { jobId: `pair-${a}-${b}` }
  );
}
