# Wave Analysis Priority & Bot Match Waiting

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure wave-triggered analyses run first, bot waits for real match scores, and corrupted 0% data is cleaned up.

**Architecture:** Three changes: (1) `waves.send` promotes the pair analysis job to highest BullMQ priority, (2) API publishes `analysis:ready` to Redis alongside the existing EventEmitter, (3) chatbot subscribes to that Redis channel and defers wave decisions until match score arrives.

**Tech Stack:** BullMQ (priority manipulation), Redis pub/sub (`analysis:ready` channel), Bun Redis client (chatbot subscriber)

---

### Task 1: Clean up corrupted 0% analyses

**Files:**
- Modify: `apps/api/src/services/queue.ts:197-243` (add Redis publish)

**Step 1: Delete corrupted rows from database**

Run against production DB (via Railway):
```sql
DELETE FROM connection_analyses WHERE ai_match_score = 0;
```

Or via dev-cli / drizzle:
```bash
railway run -- psql "$DATABASE_URL" -c "DELETE FROM connection_analyses WHERE ai_match_score = 0;"
```

**Step 2: Verify**

```bash
railway run -- psql "$DATABASE_URL" -c "SELECT count(*) FROM connection_analyses WHERE ai_match_score = 0;"
```

Expected: `0`

---

### Task 2: Promote pair analysis on wave send

When a wave is sent, the pair analysis must jump to the front of the queue. BullMQ jobs without `priority` are processed FIFO **before** any prioritized jobs.

**Files:**
- Modify: `apps/api/src/trpc/procedures/waves.ts:82-94` (after wave insert, before emit)
- Modify: `apps/api/src/services/queue.ts` (export `getQueue` or add new `promotePairAnalysis` function)

**Step 1: Add `promotePairAnalysis` to queue.ts**

Add after the existing `enqueuePairAnalysis` function (~line 539):

```typescript
/** Promote a pair analysis to highest priority (for wave-triggered urgency) */
export async function promotePairAnalysis(userAId: string, userBId: string) {
  if (!process.env.REDIS_URL) return;

  const [a, b] = [userAId, userBId].sort();
  const jobId = `pair-${a}-${b}`;
  const queue = getQueue();

  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'active' || state === 'completed') return; // already processing or done
    await existing.remove();
  }

  // Add without priority → FIFO queue, processed before all prioritized jobs
  await queue.add(
    'analyze-pair',
    { type: 'analyze-pair', userAId: a, userBId: b },
    { jobId }
  );
}
```

**Step 2: Call from waves.send**

In `apps/api/src/trpc/procedures/waves.ts`, after the wave insert (line 88) and before `ee.emit` (line 92), add:

```typescript
import { promotePairAnalysis } from '../../services/queue';

// ... inside send mutation, after wave insert:

// Promote pair analysis to front of queue
await promotePairAnalysis(ctx.userId, input.toUserId);
```

**Step 3: Verify**

Send a wave via dev-cli. Check queue-monitor — the pair job should appear without priority (FIFO) and be picked up before other prioritized jobs.

**Step 4: Commit**

```bash
git add apps/api/src/services/queue.ts apps/api/src/trpc/procedures/waves.ts
git commit -m "Promote pair analysis to front of queue when wave is sent"
```

---

### Task 3: API publishes `analysis:ready` to Redis

The API already emits `analysisReady` via in-process EventEmitter. Add a Redis publish alongside it so the chatbot (separate process) can listen.

**Files:**
- Modify: `apps/api/src/services/queue.ts:14` (import/init Redis client)
- Modify: `apps/api/src/services/queue.ts:197-201,239-243` (add Redis publish after ee.emit)

**Step 1: Add Redis publisher to queue.ts**

Near the top of `queue.ts`, after existing imports (~line 15):

```typescript
import Redis from 'ioredis';

let _redisPub: Redis | null = null;

function getRedisPub(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!_redisPub) {
    _redisPub = new Redis(process.env.REDIS_URL);
  }
  return _redisPub;
}
```

Note: BullMQ already depends on `ioredis` (it's a transitive dep via bullmq), so no new package needed. Verify with `ls node_modules/ioredis` or check if bullmq re-exports it. If ioredis isn't directly available, use bullmq's connection or install ioredis.

**Step 2: Publish after each `ee.emit('analysisReady', ...)`**

After line 201 (first emit) and after line 243 (second emit), add:

```typescript
getRedisPub()?.publish('analysis:ready', JSON.stringify({
  forUserId: userAId,  // (or userBId for the second one)
  aboutUserId: userBId, // (or userAId for the second one)
}));
```

**Step 3: Verify**

Use `redis-cli SUBSCRIBE analysis:ready` in a terminal. Trigger an analysis. Confirm events arrive.

**Step 4: Commit**

```bash
git add apps/api/src/services/queue.ts
git commit -m "Publish analysis:ready to Redis for cross-process subscribers"
```

---

### Task 4: Chatbot waits for match score via Redis subscription

When the bot picks up a wave and match score is `null`, defer the decision until `analysis:ready` fires for that pair (with 60s timeout fallback).

**Files:**
- Modify: `apps/chatbot/src/index.ts:40-45` (add Redis subscriber for `analysis:ready`)
- Modify: `apps/chatbot/src/index.ts:154-208` (handleWave — add wait logic)
- Modify: `apps/chatbot/src/events.ts` (add `analysis:ready` event type to monitor)

**Step 1: Add analysis subscriber and waiting map**

In `apps/chatbot/src/index.ts`, after the events init block (~line 45), add:

```typescript
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
      // Check both directions — analysis is stored as (toUserId→fromUserId) for the recipient
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
```

**Step 2: Modify handleWave to wait when match is null**

In `handleWave`, replace the match score lookup and decision block (lines 197-208):

```typescript
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
      // ... rest unchanged
```

**Step 3: Add monitor event styles for new events**

In `packages/dev-cli/src/chatbot-monitor.ts`, add to `EVENT_STYLES`:

```typescript
  wave_waiting:       { icon: "⏳", color: "\x1b[33m" },   // yellow
  wave_match_ready:   { icon: "🎯", color: "\x1b[32m" },   // green
  wave_match_timeout: { icon: "⏰", color: "\x1b[31m" },   // red
```

**Step 4: Clean up subscriber on shutdown**

In the `SIGINT` handler (~line 461), close the analysis subscriber too. Store it in a module-level variable.

**Step 5: Verify**

1. Start API + chatbot
2. Send wave via dev-cli from a user with no existing analysis
3. Monitor should show: `⏳ wave_waiting` → (analysis completes) → `🎯 wave_match_ready` → `✓ wave_accept` or `✗ wave_decline` with real score
4. If analysis doesn't come within 60s: `⏰ wave_match_timeout` → decision with 50% fallback

**Step 6: Commit**

```bash
git add apps/chatbot/src/index.ts packages/dev-cli/src/chatbot-monitor.ts
git commit -m "Bot waits for match score before responding to waves"
```

---

### Task 5: Final integration test

1. Clean DB of 0% scores (Task 1)
2. Send a wave between two users with no existing analysis
3. Verify in queue-monitor: job appears as FIFO (no priority number)
4. Verify in chatbot-monitor: `wave_waiting` → `wave_match_ready` → accept/decline with real score
5. Send a wave between users who already have analysis — should skip waiting, decide immediately
