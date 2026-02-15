import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, gt, desc, sql } from 'drizzle-orm';
import {
  user,
  profiles,
  waves,
  messages,
  conversationParticipants,
  connectionAnalyses,
} from '../../api/src/db/schema';
import { getToken, respondToWave, sendMessage } from './api-client';
import { generateBotMessage } from './ai';
import { initEvents, closeEvents, emit } from './events';

// ── Config ───────────────────────────────────────────────────────────

const POLL_INTERVAL = Number(process.env.BOT_POLL_INTERVAL_MS) || 3000;
const WAVE_DELAY_MIN = 10_000;
const WAVE_DELAY_MAX = 30_000;
const OPENING_DELAY_MIN = 3_000;
const OPENING_DELAY_MAX = 15_000;
const ACTIVITY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ── DB connection ────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[bot] DATABASE_URL not set');
  process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client);

// ── Events (Redis pub/sub — optional) ───────────────────────────────

if (process.env.REDIS_URL) {
  initEvents(process.env.REDIS_URL);
  console.log('[bot] Events: publishing to Redis');
} else {
  console.log('[bot] Events: REDIS_URL not set, events disabled');
}

// ── Analysis-ready subscription ─────────────────────────────────────

const MATCH_WAIT_TIMEOUT = 60_000; // 60s max wait for analysis

/** Waves waiting for match score: key = `${fromUserId}-${toUserId}` */
const wavesWaitingForMatch = new Map<string, {
  wave: { id: string; fromUserId: string; toUserId: string };
  resolve: () => void;
  timer: Timer;
}>();

if (process.env.REDIS_URL) {
  const analysisSub = new Bun.RedisClient(process.env.REDIS_URL);
  analysisSub.subscribe('analysis:ready', (message: string) => {
    try {
      const event = JSON.parse(message);
      // Check both directions — we need the recipient's view
      const key1 = `${event.aboutUserId}-${event.forUserId}`;
      const key2 = `${event.forUserId}-${event.aboutUserId}`;
      for (const key of [key1, key2]) {
        const waiting = wavesWaitingForMatch.get(key);
        if (waiting) {
          waiting.resolve();
        }
      }
    } catch {}
  });
}

// ── State ────────────────────────────────────────────────────────────

let lastWaveCheck = new Date();
let lastMessageCheck = new Date();
const pendingWaves = new Set<string>(); // wave IDs with scheduled responses

// ── Helpers ──────────────────────────────────────────────────────────

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

function isSeedEmail(email: string): boolean {
  return email.endsWith('@example.com');
}

async function getDisplayName(userId: string): Promise<string> {
  const [p] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return p?.displayName ?? userId.slice(0, 8);
}

/** Check if a seed user has recent human activity (non-bot messages) */
async function isHumanControlled(
  seedUserId: string,
  conversationId?: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - ACTIVITY_WINDOW_MS);
  const conditions = [
    eq(messages.senderId, seedUserId),
    gt(messages.createdAt, cutoff),
    sql`${messages.deletedAt} IS NULL`,
    sql`(${messages.metadata} IS NULL OR ${messages.metadata}->>'source' != 'chatbot')`,
  ];
  if (conversationId) {
    conditions.push(eq(messages.conversationId, conversationId));
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(and(...conditions));

  return Number(result?.count ?? 0) > 0;
}

/** Get match score from connection_analyses for the wave recipient's view */
async function getMatchScore(
  fromUserId: string,
  toUserId: string,
): Promise<number | null> {
  const [analysis] = await db
    .select({ aiMatchScore: connectionAnalyses.aiMatchScore })
    .from(connectionAnalyses)
    .where(
      and(
        eq(connectionAnalyses.fromUserId, toUserId),
        eq(connectionAnalyses.toUserId, fromUserId),
      ),
    )
    .limit(1);

  return analysis?.aiMatchScore ?? null;
}

/** Decide whether to accept a wave based on match score */
function shouldAcceptWave(matchScore: number | null): { accept: boolean; probability: number } {
  if (matchScore === null) {
    const roll = Math.random();
    return { accept: roll < 0.5, probability: 0.5 };
  }

  if (matchScore >= 75) return { accept: true, probability: 1 };

  const probability = 0.1 + (matchScore / 75) * 0.9;
  const roll = Math.random();
  return { accept: roll < probability, probability };
}

/** Decide if bot initiates conversation after accepting a wave */
function shouldInitiateConversation(matchScore: number | null): { initiate: boolean; probability: number } {
  if (matchScore === null) {
    const roll = Math.random();
    return { initiate: roll < 0.3, probability: 0.3 };
  }
  if (matchScore >= 75) return { initiate: true, probability: 1 };

  const probability = 0.05 + (matchScore / 75) * 0.95;
  const roll = Math.random();
  return { initiate: roll < probability, probability };
}

async function getProfileByUserId(userId: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return profile;
}

// ── Wave handling ────────────────────────────────────────────────────

async function handleWave(wave: {
  id: string;
  fromUserId: string;
  toUserId: string;
}) {
  const botName = await getDisplayName(wave.toUserId);
  const fromName = await getDisplayName(wave.fromUserId);

  try {
    // Re-check wave still pending
    const [current] = await db
      .select({ status: waves.status })
      .from(waves)
      .where(eq(waves.id, wave.id))
      .limit(1);

    if (!current || current.status !== 'pending') {
      emit({ type: 'wave_expired', bot: botName, from: fromName, reason: 'no longer pending' });
      pendingWaves.delete(wave.id);
      return;
    }

    // Get seed user email for token
    const [seedUser] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, wave.toUserId))
      .limit(1);

    if (!seedUser) {
      pendingWaves.delete(wave.id);
      return;
    }

    // Activity guard
    if (await isHumanControlled(wave.toUserId)) {
      emit({ type: 'wave_skip', bot: botName, from: fromName, reason: 'human controlling this user' });
      pendingWaves.delete(wave.id);
      return;
    }

    const { token } = await getToken(seedUser.email);

    // Match-based acceptance
    let matchScore = await getMatchScore(wave.fromUserId, wave.toUserId);

    // If no match score yet, wait for analysis to complete
    if (matchScore === null) {
      const waitKey = `${wave.fromUserId}-${wave.toUserId}`;
      emit({ type: 'wave_waiting', bot: botName, from: fromName, reason: 'waiting for match score' });

      const gotScore = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          wavesWaitingForMatch.delete(waitKey);
          resolve(false);
        }, MATCH_WAIT_TIMEOUT);

        wavesWaitingForMatch.set(waitKey, {
          wave,
          resolve: () => {
            clearTimeout(timer);
            wavesWaitingForMatch.delete(waitKey);
            resolve(true);
          },
          timer,
        });
      });

      if (gotScore) {
        matchScore = await getMatchScore(wave.fromUserId, wave.toUserId);
        emit({ type: 'wave_match_ready', bot: botName, from: fromName, matchScore: matchScore !== null ? `${matchScore.toFixed(0)}%` : null });
      } else {
        emit({ type: 'wave_match_timeout', bot: botName, from: fromName, reason: `no score after ${MATCH_WAIT_TIMEOUT / 1000}s` });
      }
    }

    const { accept, probability: acceptProb } = shouldAcceptWave(matchScore);
    const scoreStr = matchScore !== null ? `${matchScore.toFixed(0)}%` : null;

    emit({
      type: accept ? 'wave_accept' : 'wave_decline',
      bot: botName,
      from: fromName,
      matchScore: scoreStr,
      probability: `${(acceptProb * 100).toFixed(0)}%`,
    });

    const result = await respondToWave(token, wave.id, accept);

    if (accept && result.conversationId) {
      const { initiate, probability: initProb } = shouldInitiateConversation(matchScore);

      if (initiate) {
        const openingDelay = randomDelay(OPENING_DELAY_MIN, OPENING_DELAY_MAX);
        emit({
          type: 'opening_scheduled',
          bot: botName,
          from: fromName,
          delay: `${(openingDelay / 1000).toFixed(0)}s`,
          probability: `${(initProb * 100).toFixed(0)}%`,
        });

        setTimeout(async () => {
          try {
            const botProfile = await getProfileByUserId(wave.toUserId);
            const otherProfile = await getProfileByUserId(wave.fromUserId);

            if (!botProfile || !otherProfile) return;

            const content = await generateBotMessage(
              botProfile,
              otherProfile,
              [],
              true,
            );

            await sendMessage(token, result.conversationId!, content);
            emit({ type: 'opening_sent', bot: botName, from: fromName, message: content.slice(0, 80) });
          } catch (err: any) {
            emit({ type: 'opening_error', bot: botName, from: fromName, error: err.message?.slice(0, 100) });
          }
        }, openingDelay);
      } else {
        emit({
          type: 'opening_skip',
          bot: botName,
          from: fromName,
          reason: `probability ${(initProb * 100).toFixed(0)}% — waiting for first message`,
        });
      }
    }
  } catch (err: any) {
    emit({ type: 'wave_error', bot: botName, from: fromName, error: err.message?.slice(0, 100) });
  } finally {
    pendingWaves.delete(wave.id);
  }
}

// ── Message handling ─────────────────────────────────────────────────

async function handleMessage(
  conversationId: string,
  seedUserId: string,
  seedEmail: string,
) {
  const botName = await getDisplayName(seedUserId);

  try {
    // Activity guard
    if (await isHumanControlled(seedUserId, conversationId)) {
      emit({ type: 'reply_skip', bot: botName, reason: 'human controlling this user' });
      return;
    }

    const { token } = await getToken(seedEmail);

    // Fetch last 10 messages for context
    const recentMessages = await db
      .select({
        senderId: messages.senderId,
        content: messages.content,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(10);

    const history = recentMessages.reverse().map((m) => ({
      senderId: m.senderId === seedUserId ? 'bot' : 'other',
      content: m.content,
    }));

    // Get profiles
    const botProfile = await getProfileByUserId(seedUserId);

    // Find the other participant
    const participants = await db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));

    const otherUserId = participants.find((p) => p.userId !== seedUserId)?.userId;
    if (!otherUserId || !botProfile) return;

    const otherName = await getDisplayName(otherUserId);

    // Seed-to-seed guard
    const [otherUser] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, otherUserId))
      .limit(1);

    if (otherUser && isSeedEmail(otherUser.email)) {
      const otherHasHuman = await isHumanControlled(otherUserId, conversationId);
      if (!otherHasHuman) {
        emit({ type: 'reply_skip', bot: botName, from: otherName, reason: 'seed-to-seed without human' });
        return;
      }
    }

    const otherProfile = await getProfileByUserId(otherUserId);
    if (!otherProfile) return;

    const content = await generateBotMessage(botProfile, otherProfile, history, false);

    await sendMessage(token, conversationId, content);
    emit({ type: 'reply_sent', bot: botName, from: otherName, message: content.slice(0, 80) });
  } catch (err: any) {
    emit({ type: 'reply_error', bot: botName, error: err.message?.slice(0, 100) });
  }
}

// ── Polling ──────────────────────────────────────────────────────────

async function pollWaves() {
  try {
    const pendingWavesList = await db
      .select({
        id: waves.id,
        fromUserId: waves.fromUserId,
        toUserId: waves.toUserId,
      })
      .from(waves)
      .innerJoin(user, eq(waves.toUserId, user.id))
      .where(
        and(
          eq(waves.status, 'pending'),
          gt(waves.createdAt, lastWaveCheck),
          sql`${user.email} LIKE '%@example.com'`,
        ),
      );

    lastWaveCheck = new Date();

    for (const wave of pendingWavesList) {
      if (pendingWaves.has(wave.id)) continue;
      pendingWaves.add(wave.id);

      const delay = randomDelay(WAVE_DELAY_MIN, WAVE_DELAY_MAX);
      const botName = await getDisplayName(wave.toUserId);
      const fromName = await getDisplayName(wave.fromUserId);
      emit({ type: 'wave_received', bot: botName, from: fromName, delay: `${(delay / 1000).toFixed(0)}s` });

      setTimeout(() => handleWave(wave), delay);
    }
  } catch (err) {
    console.error('[bot] pollWaves error:', err);
  }
}

async function pollMessages() {
  try {
    const newMessages = await db
      .select({
        conversationId: messages.conversationId,
        senderId: messages.senderId,
      })
      .from(messages)
      .where(
        and(
          gt(messages.createdAt, lastMessageCheck),
          sql`${messages.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(100);

    lastMessageCheck = new Date();

    const convIds = [...new Set(newMessages.map((m) => m.conversationId))];
    if (convIds.length === 0) return;
    console.log(`[bot] pollMessages: ${newMessages.length} new messages in ${convIds.length} conversations`);

    for (const convId of convIds) {
      const participants = await db
        .select({
          userId: conversationParticipants.userId,
          email: user.email,
        })
        .from(conversationParticipants)
        .innerJoin(user, eq(conversationParticipants.userId, user.id))
        .where(eq(conversationParticipants.conversationId, convId));

      const seedParticipants = participants.filter((p) => isSeedEmail(p.email));
      if (seedParticipants.length === 0) {
        console.log(`[bot] pollMessages: no seed participant in conv ${convId.slice(0, 8)}, emails: ${participants.map((p) => p.email).join(', ')}`);
        continue;
      }

      // Find the seed user who did NOT send the new message — that's the bot
      const senderIds = new Set(newMessages.filter((m) => m.conversationId === convId).map((m) => m.senderId));
      const seedParticipant = seedParticipants.find((p) => !senderIds.has(p.userId)) ?? seedParticipants[0];

      const convMessages = newMessages.filter(
        (m) => m.conversationId === convId && m.senderId !== seedParticipant.userId,
      );
      if (convMessages.length === 0) continue;

      const botName = await getDisplayName(seedParticipant.userId);
      const senderName = await getDisplayName(convMessages[0].senderId);
      emit({ type: 'message_received', bot: botName, from: senderName });

      handleMessage(convId, seedParticipant.userId, seedParticipant.email);
    }
  } catch (err) {
    console.error('[bot] pollMessages error:', err);
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('[bot] Starting seed user chatbot...');
  console.log(`[bot] Polling every ${POLL_INTERVAL}ms`);
  console.log(`[bot] API: ${process.env.API_URL || 'http://localhost:3000'}`);
  console.log(
    `[bot] OpenAI: ${process.env.OPENAI_API_KEY ? 'configured' : 'NOT SET (using fallbacks)'}`,
  );

  lastWaveCheck = new Date();
  lastMessageCheck = new Date();

  let pollCount = 0;
  setInterval(async () => {
    await pollWaves();
    await pollMessages();
    pollCount++;
    if (pollCount % 100 === 0) {
      console.log(`[bot] heartbeat: ${pollCount} polls completed`);
    }
  }, POLL_INTERVAL);

  console.log('[bot] Ready. Waiting for waves and messages...');
}

main().catch((err) => {
  console.error('[bot] Fatal error:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n[bot] Shutting down...');
  closeEvents();
  client.end();
  process.exit(0);
});
