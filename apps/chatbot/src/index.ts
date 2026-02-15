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

// ── Config ───────────────────────────────────────────────────────────

const POLL_INTERVAL = Number(process.env.BOT_POLL_INTERVAL_MS) || 3000;
const WAVE_DELAY_MIN = 10_000;
const WAVE_DELAY_MAX = 30_000;
const MSG_DELAY_MIN = 5_000;
const MSG_DELAY_MAX = 30_000;
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

// ── State ────────────────────────────────────────────────────────────

let lastWaveCheck = new Date();
let lastMessageCheck = new Date();
const pendingWaves = new Set<string>(); // wave IDs with scheduled responses
const pendingConversations = new Map<string, Timer>(); // conversationId → debounce timer
// ── Helpers ──────────────────────────────────────────────────────────

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

function isSeedEmail(email: string): boolean {
  return email.endsWith('@example.com');
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
  // We want the score as seen by toUserId (the bot) about fromUserId (the waver)
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
function shouldAcceptWave(matchScore: number | null): boolean {
  if (matchScore === null) {
    // No analysis available — 50/50 fallback
    return Math.random() < 0.5;
  }

  // matchScore is 0-100
  // >= 75 → always accept
  // Linear interpolation: 0 → 10% chance, 75 → 100% chance
  if (matchScore >= 75) return true;

  const acceptProbability = 0.1 + (matchScore / 75) * 0.9;
  return Math.random() < acceptProbability;
}

/** Decide if bot initiates conversation after accepting a wave */
function shouldInitiateConversation(matchScore: number | null): boolean {
  if (matchScore === null) return Math.random() < 0.3;
  if (matchScore >= 75) return true;
  // Linear: 0 → 5%, 75 → 100%
  return Math.random() < 0.05 + (matchScore / 75) * 0.95;
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
  try {
    // Re-check wave still pending
    const [current] = await db
      .select({ status: waves.status })
      .from(waves)
      .where(eq(waves.id, wave.id))
      .limit(1);

    if (!current || current.status !== 'pending') {
      console.log(`[bot] Wave ${wave.id.slice(0, 8)} no longer pending, skipping`);
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

    // Look up sender for logging
    const [sender] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, wave.fromUserId))
      .limit(1);

    // Activity guard
    if (await isHumanControlled(wave.toUserId)) {
      console.log(`[bot] ${seedUser.email} has human activity, skipping wave`);
      pendingWaves.delete(wave.id);
      return;
    }

    const { token } = await getToken(seedUser.email);

    // Match-based acceptance
    const matchScore = await getMatchScore(wave.fromUserId, wave.toUserId);
    const accept = shouldAcceptWave(matchScore);

    const scoreStr = matchScore !== null ? `${matchScore.toFixed(0)}%` : 'unknown';
    console.log(
      `[bot] ${seedUser.email} ${accept ? 'accepted' : 'declined'} wave from ${sender?.email ?? wave.fromUserId.slice(0, 8)} (match: ${scoreStr})`,
    );

    const result = await respondToWave(token, wave.id, accept);

    if (accept && result.conversationId) {
      if (shouldInitiateConversation(matchScore)) {
        // Send opening message after extra delay
        const openingDelay = randomDelay(OPENING_DELAY_MIN, OPENING_DELAY_MAX);
        console.log(
          `[bot] ${seedUser.email} initiating conversation (match: ${scoreStr}), opening in ${(openingDelay / 1000).toFixed(0)}s`,
        );

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
            console.log(
              `[bot] ${seedUser.email} sent opening: "${content.slice(0, 50)}..."`,
            );
          } catch (err) {
            console.error('[bot] Opening message error:', err);
          }
        }, openingDelay);
      } else {
        console.log(
          `[bot] ${seedUser.email} accepted wave, waiting for first message (match: ${scoreStr})`,
        );
      }
    }
  } catch (err) {
    console.error(`[bot] handleWave error:`, err);
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
  try {
    // Activity guard
    if (await isHumanControlled(seedUserId, conversationId)) {
      console.log(`[bot] ${seedEmail} has human activity in conv, skipping`);
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

    // Seed-to-seed guard: don't reply if the other user is also a seed user without human activity
    const [otherUser] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, otherUserId))
      .limit(1);

    if (otherUser && isSeedEmail(otherUser.email)) {
      const otherHasHuman = await isHumanControlled(otherUserId, conversationId);
      if (!otherHasHuman) {
        console.log(`[bot] Seed-to-seed conv without human, skipping reply`);
        return;
      }
    }

    const otherProfile = await getProfileByUserId(otherUserId);
    if (!otherProfile) return;

    const content = await generateBotMessage(botProfile, otherProfile, history, false);

    await sendMessage(token, conversationId, content);
    console.log(
      `[bot] ${seedEmail} replied in ${conversationId.slice(0, 8)}: "${content.slice(0, 50)}..."`,
    );
  } catch (err) {
    console.error(`[bot] handleMessage error:`, err);
  }
}

// ── Polling ──────────────────────────────────────────────────────────

async function pollWaves() {
  try {
    // Find pending waves to seed users
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
      console.log(
        `[bot] Scheduling wave response for ${wave.toUserId.slice(0, 8)} in ${(delay / 1000).toFixed(0)}s`,
      );
      setTimeout(() => handleWave(wave), delay);
    }
  } catch (err) {
    console.error('[bot] pollWaves error:', err);
  }
}

async function pollMessages() {
  try {
    // Find conversations where a seed user is a participant
    // and there's a new message from someone else since last check
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

    // Group by conversation, find which ones have seed user participants
    const convIds = [...new Set(newMessages.map((m) => m.conversationId))];
    if (convIds.length === 0) return;

    // For each conversation, check if a seed user is a participant and the message isn't from them
    for (const convId of convIds) {
      const participants = await db
        .select({
          userId: conversationParticipants.userId,
          email: user.email,
        })
        .from(conversationParticipants)
        .innerJoin(user, eq(conversationParticipants.userId, user.id))
        .where(eq(conversationParticipants.conversationId, convId));

      const seedParticipant = participants.find((p) => isSeedEmail(p.email));
      if (!seedParticipant) continue;

      // Check if the new messages are from the other person (not the seed user)
      const convMessages = newMessages.filter(
        (m) => m.conversationId === convId && m.senderId !== seedParticipant.userId,
      );
      if (convMessages.length === 0) continue;

      // Debounce: cancel previous timer for this conversation
      const existingTimer = pendingConversations.get(convId);
      if (existingTimer) clearTimeout(existingTimer);

      const delay = randomDelay(MSG_DELAY_MIN, MSG_DELAY_MAX);
      console.log(
        `[bot] Scheduling reply for ${seedParticipant.email} in conv ${convId.slice(0, 8)} in ${(delay / 1000).toFixed(0)}s`,
      );

      const timer = setTimeout(() => {
        pendingConversations.delete(convId);
        handleMessage(convId, seedParticipant.userId, seedParticipant.email);
      }, delay);

      pendingConversations.set(convId, timer);
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

  // Set initial timestamps to now so we only process new events
  lastWaveCheck = new Date();
  lastMessageCheck = new Date();

  setInterval(async () => {
    await pollWaves();
    await pollMessages();
  }, POLL_INTERVAL);

  console.log('[bot] Ready. Waiting for waves and messages...');
}

main().catch((err) => {
  console.error('[bot] Fatal error:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n[bot] Shutting down...');
  for (const timer of pendingConversations.values()) clearTimeout(timer);
  client.end();
  process.exit(0);
});
