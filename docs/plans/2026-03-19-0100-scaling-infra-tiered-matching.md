# Scaling Infrastructure & Tiered Matching Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Blisko for scaling from POC to 200K MAU — remove artificial BullMQ limits, enable multi-replica WebSocket with Redis pub/sub, introduce tiered matching (T1/T2/T3) to reduce AI costs 12-15x, and add background proximity-triggered status matching.

**Architecture:** Two phases. Phase 1: infrastructure prep (BullMQ concurrency, Redis pub/sub for WS events, separate worker service, profile update debounce). Phase 2: tiered matching architecture replacing O(N²) pre-computation with lazy on-demand analysis, plus ambient background status matching.

**Tech Stack:** Bun, Hono, tRPC, BullMQ, Redis (Bun built-in RedisClient), PostgreSQL/Drizzle, OpenAI gpt-4.1-mini, Vitest

**Spec:** `docs/architecture/SCALING.md`

---

## Phase 1: Infrastructure

### Task 1: BullMQ — remove artificial limits

**Files:**
- Modify: `apps/api/src/services/queue.ts:744-748`

- [ ] **Step 1: Remove rate limiter and increase concurrency**

In `startWorker()`, change the worker config:

```typescript
// Before (line 744-748):
_worker = new Worker("ai-jobs", processJob, {
  connection: getConnectionConfig(),
  concurrency: 5,
  limiter: { max: 20, duration: 60_000 },
});

// After:
_worker = new Worker("ai-jobs", processJob, {
  connection: getConnectionConfig(),
  concurrency: 50,
});
```

Remove `limiter` entirely — it was only there because OpenAI API was throttling us. The actual throttle should be at the AI provider level (OpenAI tier), not at the queue level.

- [ ] **Step 2: Verify worker starts correctly**

Run: `pnpm api:dev`
Expected: Console shows `[queue] AI jobs worker started` without errors.

- [ ] **Step 3: Commit**

```
Increase BullMQ concurrency to 50 and remove rate limiter (BLI-71)
```

---

### Task 2: Redis pub/sub adapter for WebSocket events

Currently `ee` (Node EventEmitter) is process-local — events from tRPC procedures or BullMQ worker don't reach WebSocket clients on other replicas. Replace with Redis pub/sub while keeping the EventEmitter interface for local subscribers.

**Files:**
- Create: `apps/api/src/ws/redis-pub.ts`
- Modify: `apps/api/src/ws/events.ts`

**Important:** The change is at the PUBLISHING side only. Event listeners in `handler.ts` stay on the local EventEmitter. The new module subscribes to Redis channels and re-emits events on the local `ee`. This way `handler.ts` doesn't change at all.

- [ ] **Step 1: Create Redis pub/sub bridge**

Create `apps/api/src/ws/redis-pub.ts`:

```typescript
import { RedisClient } from "bun";
import { ee } from "./events";

const CHANNEL = "ws-events";

let pub: RedisClient | null = null;
let sub: RedisClient | null = null;

export function initWsRedisBridge() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[ws-redis] REDIS_URL not set, using local EventEmitter only");
    return;
  }

  pub = new RedisClient(url);
  sub = new RedisClient(url);

  sub.subscribe(CHANNEL, (message: string) => {
    try {
      const { event, data } = JSON.parse(message);
      // Re-emit on local EventEmitter so handler.ts picks it up
      ee.emit(event, data);
    } catch {
      // Malformed message, ignore
    }
  });

  console.log("[ws-redis] Redis pub/sub bridge initialized");
}

/**
 * Publish an event via Redis (cross-instance).
 * Falls back to local EventEmitter if Redis not configured.
 */
export function publishEvent(event: string, data: unknown) {
  if (pub) {
    pub.publish(CHANNEL, JSON.stringify({ event, data }));
  } else {
    ee.emit(event, data);
  }
}
```

- [ ] **Step 2: Replace `ee.emit()` calls with `publishEvent()` in queue.ts**

In `apps/api/src/services/queue.ts`, add import and replace all `ee.emit()` calls:

```typescript
// Add import at top:
import { publishEvent } from "@/ws/redis-pub";

// Replace every ee.emit() with publishEvent():
// e.g. line ~223:
// Before: ee.emit("analysisReady", { forUserId: userAId, ... });
// After:  publishEvent("analysisReady", { forUserId: userAId, ... });
```

Search for all `ee.emit(` in queue.ts and replace with `publishEvent(`. There should be ~6-8 occurrences covering: `analysisReady`, `profileReady`, `statusMatchesReady`, `questionReady`, `profilingComplete`.

- [ ] **Step 3: Replace `ee.emit()` calls in tRPC procedures**

Replace `ee.emit()` with `publishEvent()` in all tRPC procedure files. Affected files:
- `apps/api/src/trpc/procedures/profiles.ts` — `nearbyChanged` events (~line 153)
- `apps/api/src/trpc/procedures/messages.ts` — `newMessage`, `reaction`, `typing` events
- `apps/api/src/trpc/procedures/waves.ts` — `newWave`, `waveResponded` events
- `apps/api/src/trpc/procedures/groups.ts` — `groupMember`, `groupUpdated`, `topicEvent`, `groupInvited` events
- `apps/api/src/trpc/procedures/profiling.ts` — if any events

In each file: replace `import { ee } from "@/ws/events"` with `import { publishEvent } from "@/ws/redis-pub"` and change `ee.emit("eventName", data)` to `publishEvent("eventName", data)`.

- [ ] **Step 4: Initialize bridge on server start**

In `apps/api/src/index.ts`, add initialization before WebSocket setup:

```typescript
import { initWsRedisBridge } from "@/ws/redis-pub";

// Add before startWorker() call:
initWsRedisBridge();
```

- [ ] **Step 5: Verify events still work locally**

Run: `pnpm api:dev`
Test: Send a message between two seed users using dev-cli and verify WebSocket delivery still works.

- [ ] **Step 6: Commit**

```
Add Redis pub/sub bridge for cross-replica WebSocket events (BLI-71)
```

---

### Task 3: Separate BullMQ worker service

Move the worker out of the API process so it can be deployed as a separate Railway service.

**Files:**
- Create: `apps/api/src/worker.ts`
- Modify: `apps/api/src/index.ts:253` (remove startWorker call)
- Modify: `apps/api/src/services/queue.ts` (export worker start for standalone use)
- Modify: `apps/api/package.json` (add worker script)
- Modify: `package.json` (add root worker script)

- [ ] **Step 1: Create standalone worker entry point**

Create `apps/api/src/worker.ts`:

```typescript
import { startWorker } from "@/services/queue";
import { initWsRedisBridge } from "@/ws/redis-pub";

// Worker needs Redis pub/sub to emit events that reach API instances
initWsRedisBridge();

startWorker();

console.log("[worker] Standalone BullMQ worker running");

// Keep process alive
process.on("SIGTERM", () => {
  console.log("[worker] Shutting down...");
  process.exit(0);
});
```

- [ ] **Step 2: Make worker startup configurable in API**

In `apps/api/src/index.ts`, change the `startWorker()` call to be opt-in:

```typescript
// Before:
startWorker();

// After:
if (process.env.DISABLE_WORKER !== "true") {
  startWorker();
}
```

This way the API still starts the worker by default (for local dev), but in production we can disable it via env var and run the worker separately.

- [ ] **Step 3: Add scripts**

In `apps/api/package.json`:
```json
"worker": "bun run src/worker.ts",
"worker:dev": "bun run --watch src/worker.ts"
```

In root `package.json`:
```json
"api:worker": "pnpm --filter @repo/api worker",
"api:worker:dev": "pnpm --filter @repo/api worker:dev"
```

- [ ] **Step 4: Verify both processes work**

Terminal 1: `DISABLE_WORKER=true pnpm api:dev`
Terminal 2: `pnpm api:worker:dev`
Expected: Both start without errors. Worker logs `[worker] Standalone BullMQ worker running`.

- [ ] **Step 5: Commit**

```
Extract BullMQ worker to standalone service (BLI-71)
```

---

### Task 4: Profile update debounce

Editing bio 5 times = 5 `generate-profile-ai` jobs. Add a 30-second debounce using Redis key with TTL.

**Files:**
- Modify: `apps/api/src/trpc/procedures/profiles.ts` (update procedure)

- [ ] **Step 1: Add debounce logic to profile update**

In the `update` procedure in `profiles.ts`, wrap the `enqueueProfileAI` and `enqueueUserPairAnalysis` calls with a Redis-based debounce:

```typescript
// After the DB update, before enqueueing AI jobs:
import { RedisClient } from "bun";

// Only enqueue AI jobs if user hasn't updated in last 30 seconds
const redisUrl = process.env.REDIS_URL;
if (redisUrl && (updatedBio || updatedLookingFor)) {
  const redis = new RedisClient(redisUrl);
  const debounceKey = `debounce:profile-ai:${ctx.userId}`;
  const existing = await redis.get(debounceKey);
  if (!existing) {
    await redis.set(debounceKey, "1", { expiration: { type: "EX", value: 30 } });
    enqueueProfileAI(ctx.userId, newBio, newLookingFor).catch(() => {});
    enqueueUserPairAnalysis(ctx.userId, profile.latitude, profile.longitude).catch(() => {});
  }
  // If key exists, skip — a previous update already scheduled the job
  // When the key expires in 30s and user edits again, the job will fire
}
```

Note: Check the exact variable names in the update procedure — `updatedBio`/`updatedLookingFor` may be named differently. The point is: only enqueue if bio or lookingFor actually changed AND debounce hasn't fired recently.

- [ ] **Step 2: Verify debounce works**

Run: `pnpm api:dev`
Test: Update a profile bio twice within 30 seconds using dev-cli. Check queue monitor (`pnpm dev-cli:queue-monitor`) — should see only 1 `generate-profile-ai` job, not 2.

- [ ] **Step 3: Commit**

```
Add 30s debounce to profile AI regeneration (BLI-71)
```

---

## Phase 2: Tiered Matching

### Task 5: T2 Quick Score AI function

Add a lightweight LLM function that returns only asymmetric scores (0-100) without generating text snippets. Same model (gpt-4.1-mini) for quality.

**Files:**
- Modify: `apps/api/src/services/ai.ts` (add quickScore function)
- Test: `apps/api/__tests__/ai-quick-score.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/__tests__/ai-quick-score.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { quickScoreSchema } from "@/services/ai";

describe("quickScore schema", () => {
  it("validates correct quick score output", () => {
    const result = quickScoreSchema.safeParse({
      scoreForA: 75,
      scoreForB: 30,
    });
    expect(result.success).toBe(true);
  });

  it("rejects scores outside 0-100", () => {
    const result = quickScoreSchema.safeParse({
      scoreForA: 150,
      scoreForB: -10,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm api:test`
Expected: FAIL — `quickScoreSchema` not exported from `@/services/ai`.

- [ ] **Step 3: Implement quickScore function**

Add to `apps/api/src/services/ai.ts`:

```typescript
export const quickScoreSchema = z.object({
  scoreForA: z.number().min(0).max(100),
  scoreForB: z.number().min(0).max(100),
});

export type QuickScoreResult = z.infer<typeof quickScoreSchema>;

/**
 * T2: Quick asymmetric compatibility score.
 * Same model as full analysis but only returns scores, no text.
 * ~1200 input + ~30 output tokens = ~$0.0005/call.
 */
export async function quickScore(
  profileA: { portrait: string; displayName: string; lookingFor: string },
  profileB: { portrait: string; displayName: string; lookingFor: string },
): Promise<QuickScoreResult | null> {
  if (!isConfigured()) return null;

  try {
    const { object } = await generateObject({
      model: openai(GPT_MODEL),
      schema: quickScoreSchema,
      prompt: `Oceń kompatybilność dwóch osób (0-100, asymetrycznie):

Osoba A — ${profileA.displayName}:
${profileA.portrait}
Szuka: ${profileA.lookingFor}

Osoba B — ${profileB.displayName}:
${profileB.portrait}
Szuka: ${profileB.lookingFor}

scoreForA = jak bardzo B pasuje do potrzeb A (0=wcale, 100=idealnie)
scoreForB = jak bardzo A pasuje do potrzeb B (0=wcale, 100=idealnie)
Weź pod uwagę: 70% spełnienie potrzeb, 20% wspólne zainteresowania, 10% styl życia.`,
      maxOutputTokens: 50,
      temperature: 0.3,
    });

    return object;
  } catch (error) {
    console.error("[ai] quickScore failed:", error);
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm api:test`
Expected: All tests pass including the new schema test.

- [ ] **Step 5: Commit**

```
Add T2 quick score AI function for tiered matching (BLI-71)
```

---

### Task 6: Add quick-score job type to BullMQ + refactor map query

Add `quick-score` job type to the queue. Change `getNearbyUsersForMap` to:
1. Use embedding cosine as T1 score (already computed in code!)
2. Enqueue T2 `quick-score` jobs instead of full `analyze-pair` for missing analyses
3. Return `analysisReady: false` for users without T3 full analysis (client shows "tap for details")

**Files:**
- Modify: `apps/api/src/services/queue.ts` (add quick-score job + processor)
- Modify: `apps/api/src/trpc/procedures/profiles.ts` (refactor getNearbyUsersForMap + updateLocation)

- [ ] **Step 1: Add QuickScoreJob type and processor**

In `apps/api/src/services/queue.ts`, add the job interface alongside existing ones:

```typescript
interface QuickScoreJob {
  type: "quick-score";
  userAId: string;
  userBId: string;
}
```

Add to the `AIJob` union type.

Add processor function:

```typescript
async function processQuickScore(job: Job<QuickScoreJob>) {
  const { userAId, userBId } = job.data;

  // Load both profiles
  const [profileA, profileB] = await Promise.all([
    db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, userAId),
      columns: { portrait: true, displayName: true, lookingFor: true, bio: true },
    }),
    db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, userBId),
      columns: { portrait: true, displayName: true, lookingFor: true, bio: true },
    }),
  ]);

  if (!profileA?.portrait || !profileB?.portrait) return;

  // Check if full analysis already exists (T3 supersedes T2)
  const existing = await db.query.connectionAnalyses.findFirst({
    where: and(
      eq(schema.connectionAnalyses.fromUserId, userAId),
      eq(schema.connectionAnalyses.toUserId, userBId),
    ),
    columns: { id: true },
  });
  if (existing) return; // T3 already done, skip T2

  const result = await quickScore(
    { portrait: profileA.portrait, displayName: profileA.displayName!, lookingFor: profileA.lookingFor ?? "" },
    { portrait: profileB.portrait, displayName: profileB.displayName!, lookingFor: profileB.lookingFor ?? "" },
  );

  if (!result) return;

  // Upsert both directions into connectionAnalyses (score only, no snippets)
  const now = new Date();
  const profileHash = (p: typeof profileA) =>
    new Bun.CryptoHasher("sha256").update(`${p.bio}|${p.lookingFor}`).digest("hex").slice(0, 8);

  const hashA = profileHash(profileA);
  const hashB = profileHash(profileB);

  await db.insert(schema.connectionAnalyses).values([
    {
      fromUserId: userAId,
      toUserId: userBId,
      aiMatchScore: result.scoreForA,
      shortSnippet: null, // T2 doesn't generate text
      longDescription: null,
      fromProfileHash: hashA,
      toProfileHash: hashB,
      createdAt: now,
      updatedAt: now,
    },
    {
      fromUserId: userBId,
      toUserId: userAId,
      aiMatchScore: result.scoreForB,
      shortSnippet: null,
      longDescription: null,
      fromProfileHash: hashB,
      toProfileHash: hashA,
      createdAt: now,
      updatedAt: now,
    },
  ]).onConflictDoUpdate({
    target: [schema.connectionAnalyses.fromUserId, schema.connectionAnalyses.toUserId],
    set: {
      aiMatchScore: sql`EXCLUDED.ai_match_score`,
      fromProfileHash: sql`EXCLUDED.from_profile_hash`,
      toProfileHash: sql`EXCLUDED.to_profile_hash`,
      updatedAt: now,
    },
    // Only update if snippets are still null (don't overwrite T3 results)
    where: isNull(schema.connectionAnalyses.shortSnippet),
  });

  // Emit to both users
  publishEvent("analysisReady", { forUserId: userAId, aboutUserId: userBId, shortSnippet: "" });
  publishEvent("analysisReady", { forUserId: userBId, aboutUserId: userAId, shortSnippet: "" });
}
```

Add to `processJob()` switch statement:
```typescript
case "quick-score":
  return processQuickScore(job as Job<QuickScoreJob>);
```

Add enqueue helper:
```typescript
export async function enqueueQuickScore(userAId: string, userBId: string) {
  const [a, b] = [userAId, userBId].sort();
  const jobId = `qs-${a}-${b}`;
  await safeEnqueuePairJob(jobId, { type: "quick-score", userAId, userBId });
}
```

- [ ] **Step 2: Refactor getNearbyUsersForMap — use T2 instead of T3 for safety net**

In `apps/api/src/trpc/procedures/profiles.ts`, change the safety net (lines 410-416):

```typescript
// Before:
const missingAnalysisUserIds = results
  .filter((r) => !analysisMap.has(r.profile.userId))
  .map((r) => r.profile.userId);

for (const theirUserId of missingAnalysisUserIds) {
  enqueuePairAnalysis(ctx.userId, theirUserId).catch(() => {});
}

// After:
const missingAnalysisUserIds = results
  .filter((r) => !analysisMap.has(r.profile.userId))
  .map((r) => r.profile.userId);

for (const theirUserId of missingAnalysisUserIds) {
  enqueueQuickScore(ctx.userId, theirUserId).catch(() => {});
}
```

Import `enqueueQuickScore` from `@/services/queue`.

- [ ] **Step 3: Stop pre-computing 100 analyses on location update**

In `apps/api/src/trpc/procedures/profiles.ts`, change `updateLocation` (line 130-132):

```typescript
// Before:
if (!input.skipAnalysis) {
  enqueueUserPairAnalysis(ctx.userId, input.latitude, input.longitude).catch(() => {});
}

// After:
// T1/T2 handles scoring on-demand via getNearbyUsersForMap.
// No more pre-computing 100 pair analyses on every location update.
// Status matching is handled by proximity trigger (Task 8).
```

Simply remove or comment out the `enqueueUserPairAnalysis` call. The `getNearbyUsersForMap` safety net (Step 2) will lazily enqueue T2 when the user opens the map.

- [ ] **Step 4: Verify map still shows scores**

Run: `pnpm api:dev`
Test: Open the app, verify map loads with % scores on bubbles. Users without analysis should show embedding-based fallback score (already handled at line 374-378 of profiles.ts).

- [ ] **Step 5: Commit**

```
Implement tiered matching: T2 quick-score replaces pre-computed T3 (BLI-71)
```

---

### Task 7: On-demand T3 full analysis

Add a tRPC procedure that triggers full analysis (T3) when user taps a bubble. The current `ensureAnalysis` procedure (line 432) is close but enqueues a regular `analyze-pair` — we need to make it return the result when ready.

**Files:**
- Modify: `apps/api/src/trpc/procedures/profiles.ts` (enhance ensureAnalysis or add new procedure)

- [ ] **Step 1: Add getDetailedAnalysis procedure**

Add to the profiles router in `profiles.ts`:

```typescript
  // T3: On-demand full analysis — triggered when user taps a bubble
  getDetailedAnalysis: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check if full analysis (with snippets) already exists
      const existing = await db.query.connectionAnalyses.findFirst({
        where: and(
          eq(schema.connectionAnalyses.fromUserId, ctx.userId),
          eq(schema.connectionAnalyses.toUserId, input.userId),
        ),
        columns: {
          aiMatchScore: true,
          shortSnippet: true,
          longDescription: true,
          updatedAt: true,
        },
      });

      if (existing?.shortSnippet) {
        // Full T3 analysis already exists
        return {
          status: "ready" as const,
          matchScore: existing.aiMatchScore,
          snippet: existing.shortSnippet,
          description: existing.longDescription,
        };
      }

      // No full analysis yet — promote to full pair analysis (high priority)
      await promotePairAnalysis(ctx.userId, input.userId);

      return {
        status: "queued" as const,
        matchScore: existing?.aiMatchScore ?? null, // T2 score if available
        snippet: null,
        description: null,
      };
    }),
```

The client calls this when user taps a bubble. If status is "queued", the client listens for `analysisReady` WebSocket event and re-queries.

- [ ] **Step 2: Verify procedure works**

Run: `pnpm api:dev`
Test: Call `getDetailedAnalysis` for a user without full analysis — should return `{ status: "queued" }`. After a few seconds, the `analysisReady` WS event should fire, and calling again should return `{ status: "ready" }` with snippets.

- [ ] **Step 3: Commit**

```
Add on-demand T3 getDetailedAnalysis procedure (BLI-71)
```

---

### Task 8: Proximity-triggered status matching

When user B moves near user A who has an active status, evaluate status match even though neither changed their status. This is the core "ambient" feature.

**Files:**
- Modify: `apps/api/src/services/queue.ts` (add proximity-status-matching job)
- Modify: `apps/api/src/trpc/procedures/profiles.ts` (trigger on updateLocation)

- [ ] **Step 1: Add proximity status matching job type**

In `apps/api/src/services/queue.ts`, add job interface:

```typescript
interface ProximityStatusMatchingJob {
  type: "proximity-status-matching";
  userId: string; // The user who moved
  latitude: number;
  longitude: number;
}
```

Add to union type. Add processor:

```typescript
async function processProximityStatusMatching(job: Job<ProximityStatusMatchingJob>) {
  const { userId, latitude, longitude } = job.data;

  // Load the moving user's profile
  const movingUser = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    columns: {
      currentStatus: true,
      statusExpiresAt: true,
      statusEmbedding: true,
      portrait: true,
      embedding: true,
    },
  });

  const now = new Date();

  // Find nearby users with ACTIVE status
  const latDelta = 5000 / 111000;
  const lonDelta = 5000 / (111000 * Math.cos((latitude * Math.PI) / 180));

  const nearbyWithStatus = await db
    .select({
      userId: schema.profiles.userId,
      currentStatus: schema.profiles.currentStatus,
      statusEmbedding: schema.profiles.statusEmbedding,
      portrait: schema.profiles.portrait,
      embedding: schema.profiles.embedding,
    })
    .from(schema.profiles)
    .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
    .where(
      and(
        ne(schema.profiles.userId, userId),
        eq(schema.profiles.visibilityMode, "visible"),
        isNotNull(schema.profiles.currentStatus),
        between(schema.profiles.latitude, latitude - latDelta, latitude + latDelta),
        between(schema.profiles.longitude, longitude - lonDelta, longitude + lonDelta),
        isNull(schema.user.deletedAt),
        // Status not expired
        or(
          isNull(schema.profiles.statusExpiresAt),
          gt(schema.profiles.statusExpiresAt, now),
        ),
      ),
    );

  if (nearbyWithStatus.length === 0) return;

  // Check which pairs already have recent status matches (skip those)
  const existingMatches = await db
    .select({ matchedUserId: schema.statusMatches.matchedUserId })
    .from(schema.statusMatches)
    .where(eq(schema.statusMatches.userId, userId));
  const alreadyMatchedIds = new Set(existingMatches.map((m) => m.matchedUserId));

  // Also check reverse: are we already matched FROM them?
  const reverseMatches = await db
    .select({ smUserId: schema.statusMatches.userId })
    .from(schema.statusMatches)
    .where(eq(schema.statusMatches.matchedUserId, userId));
  const reverseMatchedIds = new Set(reverseMatches.map((m) => m.smUserId));

  // Filter to only new potential matches
  const candidates = nearbyWithStatus.filter(
    (u) => !alreadyMatchedIds.has(u.userId) && !reverseMatchedIds.has(u.userId),
  );

  if (candidates.length === 0) return;

  // Evaluate status matches for new candidates
  const movingUserHasStatus =
    movingUser?.currentStatus && (!movingUser.statusExpiresAt || movingUser.statusExpiresAt > now);

  for (const candidate of candidates.slice(0, 10)) {
    // If moving user has status → evaluate both directions
    if (movingUserHasStatus && movingUser.currentStatus) {
      const result = await evaluateStatusMatch(
        movingUser.currentStatus,
        candidate.currentStatus!,
        "status",
      );

      if (result.isMatch) {
        // Save match for both users
        await db.insert(schema.statusMatches).values([
          { userId, matchedUserId: candidate.userId, reason: result.reason, matchedVia: "status" },
          { userId: candidate.userId, matchedUserId: userId, reason: result.reason, matchedVia: "status" },
        ]).onConflictDoNothing();

        // Notify both users
        publishEvent("statusMatchesReady", { userId });
        publishEvent("statusMatchesReady", { userId: candidate.userId });
      }
    }

    // If moving user has NO status but has a profile, check profile vs candidate status
    if (!movingUserHasStatus && movingUser?.portrait) {
      const result = await evaluateStatusMatch(
        candidate.currentStatus!,
        movingUser.portrait,
        "profile",
      );

      if (result.isMatch) {
        await db.insert(schema.statusMatches).values({
          userId: candidate.userId,
          matchedUserId: userId,
          reason: result.reason,
          matchedVia: "profile",
        }).onConflictDoNothing();

        publishEvent("statusMatchesReady", { userId: candidate.userId });
      }
    }
  }
}
```

Add to `processJob()` switch and add enqueue helper:
```typescript
export async function enqueueProximityStatusMatching(userId: string, lat: number, lon: number) {
  const queue = await getQueue();
  await queue.add("proximity-status-matching", {
    type: "proximity-status-matching" as const,
    userId,
    latitude: lat,
    longitude: lon,
  }, {
    jobId: `prox-sm-${userId}-${Date.now()}`,
  });
}
```

- [ ] **Step 2: Trigger on location update**

In `apps/api/src/trpc/procedures/profiles.ts`, add to `updateLocation` (after the location DB update):

```typescript
// Ambient: check for status matches with nearby users who have active status
enqueueProximityStatusMatching(ctx.userId, input.latitude, input.longitude).catch(() => {});
```

Import `enqueueProximityStatusMatching` from `@/services/queue`.

- [ ] **Step 3: Verify proximity matching works**

Run: `pnpm api:dev`
Test:
1. Using dev-cli, create two users with complementary statuses
2. Scatter them far apart (no match expected)
3. Move one near the other via dev-cli location update
4. Check queue monitor for `proximity-status-matching` job
5. Verify `statusMatches` table has a new entry

- [ ] **Step 4: Commit**

```
Add proximity-triggered status matching for ambient experience (BLI-71)
```

---

## Dependency Map

```
Task 1 (BullMQ concurrency)      → independent
Task 2 (Redis pub/sub)           → independent
Task 3 (Separate worker)         → depends on Task 2
Task 4 (Profile debounce)        → independent
Task 5 (T2 AI function)          → independent
Task 6 (Tiered map query)        → depends on Task 5
Task 7 (On-demand T3)            → depends on Task 6
Task 8 (Proximity status match)  → depends on Task 2
```

**Parallel execution groups:**
- Group A: Tasks 1, 4, 5 (fully independent)
- Group B: Task 2 (enables Tasks 3 and 8)
- Group C: Task 6 → Task 7 (sequential)
- Group D: Tasks 3, 8 (after Task 2)

---

## Future Work (not in this plan)

- **HA Postgres** — Railway UI config, no code change
- **pgvector extension** — when T1 cosine queries become slow at scale (~S4)
- **TTL + batch refresh** — nightly cron to refresh stale analyses (>7 days) via Batch API
- **Daily digest push** — "widzieliśmy X ciekawych osób w okolicy" cron job
- **Multiple API replicas** — Railway scaling after Redis pub/sub is in place
