# Rate Limiting & Abuse Protection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Protect the Blisko API from abuse, spam, and notification flooding with custom Redis-based rate limiting, wave deduplication, message idempotency, and group push suppression.

**Architecture:** Custom sliding window counter on Redis (Lua scripts). Hono middleware for pre-auth (IP-based), tRPC middleware for post-auth (userId-based), in-memory counters for WebSocket. Group push uses Expo's collapseId for unread suppression. Waves become irreversible (cancel removed).

**Tech Stack:** Bun RedisClient, Redis Lua scripts, Hono middleware, tRPC middleware, Expo Push API (collapseId), Drizzle ORM (unique constraint)

**Design doc:** `docs/plans/2026-03-08-rate-limiting-design.md`

---

## Task 1: Rate limiter engine (Redis sliding window counter)

**Files:**
- Create: `apps/api/src/services/rate-limiter.ts`

**Step 1: Create the rate limiter service**

This is the core engine. Sliding window counter algorithm using Redis Lua script for atomicity.

```ts
import { RedisClient } from "bun";

const redis = new RedisClient(process.env.REDIS_URL!);

// Sliding window counter — atomic Lua script
// Uses two fixed windows with weighted overlap to approximate a true sliding window.
// Lower memory than sliding window log (2 keys per limit vs 1 sorted set per request).
// No boundary burst exploit (unlike pure fixed window).
const SLIDING_WINDOW_SCRIPT = `
local key_prefix = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Calculate window boundaries
local current_window = math.floor(now / window)
local prev_window = current_window - 1
local elapsed = now - (current_window * window)
local weight = elapsed / window

local prev_key = key_prefix .. ":" .. prev_window
local curr_key = key_prefix .. ":" .. current_window

local prev_count = tonumber(redis.call("GET", prev_key) or "0")
local curr_count = tonumber(redis.call("GET", curr_key) or "0")

-- Weighted count: previous window's contribution decays as we move through current window
local estimated = prev_count * (1 - weight) + curr_count

if estimated >= limit then
  -- Calculate seconds until enough capacity frees up
  local retry_after = math.ceil(window - elapsed)
  return {1, retry_after}
end

-- Increment current window counter
redis.call("INCR", curr_key)
-- Set expiry to 2x window (keep previous window alive for overlap calculation)
redis.call("EXPIRE", curr_key, window * 2)

return {0, 0}
`;

export interface RateLimitResult {
  limited: boolean;
  retryAfter: number;
}

/**
 * Check rate limit for a given key and rule.
 *
 * @param key - Unique identifier (e.g. "waves.send:userId123" or "auth.otpRequest:192.168.1.1")
 * @param limit - Max requests allowed in the window
 * @param windowSeconds - Time window in seconds
 * @returns Whether the request is rate limited and how long to wait
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await redis.send(
      "EVAL",
      SLIDING_WINDOW_SCRIPT,
      "1",
      `rl:${key}`,
      String(limit),
      String(windowSeconds),
      String(now),
    );
    const [limited, retryAfter] = result as [number, number];
    return { limited: limited === 1, retryAfter };
  } catch (err) {
    // If Redis is down, fail open (allow the request) — don't block users because of infra issues
    console.error("[rate-limiter] Redis error, failing open:", err);
    return { limited: false, retryAfter: 0 };
  }
}
```

Key design decisions documented in comments:
- Fail open on Redis errors (don't punish users for infra issues)
- 2x window TTL on keys (previous window needed for overlap calculation)
- retryAfter = seconds until current window expires (conservative estimate)

**Step 2: Commit**

```
git add apps/api/src/services/rate-limiter.ts
git commit -m "Add Redis sliding window rate limiter engine"
```

---

## Task 2: Rate limits configuration

**Files:**
- Create: `apps/api/src/config/rateLimits.ts`

**Step 1: Create the central config file**

All limits in one place with documentation. This is the single source of truth.

```ts
/**
 * Rate limit configuration — single source of truth.
 *
 * Each entry defines a rate limit rule:
 * - limit: max requests allowed in the time window
 * - window: time window in seconds
 *
 * Limits are intentionally generous — only abusers should ever hit them.
 * Normal users will never see a rate limit error.
 *
 * When adding new API endpoints, check if they need a rate limit:
 * - Triggers push notifications? Yes.
 * - Enqueues AI jobs? Yes.
 * - Sends emails? Yes.
 * - Writes to S3? Yes.
 * - Could be abused by bots? Yes.
 *
 * See: docs/plans/2026-03-08-rate-limiting-design.md
 */

export const rateLimits = {
  // ── Pre-auth (key: client IP) ─────────────────────────────────────────

  // OTP email send — protects Resend costs (free tier: 3000/month)
  "auth.otpRequest": { limit: 5, window: 15 * 60 },

  // OTP code verification — prevents brute-force (6-digit = 1M combinations)
  "auth.otpVerify": { limit: 8, window: 5 * 60 },

  // ── Post-auth (key: userId) ───────────────────────────────────────────

  // Wave sending — prevents mass-waving bots (Bumble: 25/day, Tinder: ~50/day)
  "waves.send": { limit: 30, window: 4 * 60 * 60 },

  // Wave responding — generous for users catching up on pending waves
  "waves.respond": { limit: 60, window: 60 * 60 },

  // Messages per conversation — prevents flooding a single chat
  "messages.send": { limit: 30, window: 60 },

  // Messages globally — catches cross-conversation spam
  "messages.sendGlobal": { limit: 500, window: 60 * 60 },

  // Profile edits — prevents rapid-fire updates triggering AI jobs
  "profiles.update": { limit: 10, window: 60 * 60 },

  // File uploads — S3 write protection
  uploads: { limit: 10, window: 60 * 60 },

  // Nearby user queries — pull-to-refresh protection
  "profiles.getNearby": { limit: 30, window: 60 },

  // Data export — heavy operation, once per day
  dataExport: { limit: 1, window: 24 * 60 * 60 },

  // Global catch-all — safety net for all authenticated requests
  global: { limit: 200, window: 60 },
} as const;

export type RateLimitName = keyof typeof rateLimits;

/**
 * User-facing error messages per rate limit context.
 * Mobile app maps these to localized toast messages.
 */
export const rateLimitMessages: Record<string, string> = {
  "waves.send": "Wysłałeś dużo zaczepek. Odpocznij chwilę i spróbuj później.",
  "messages.send": "Za dużo wiadomości naraz. Zwolnij trochę.",
  "messages.sendGlobal": "Za dużo wiadomości. Spróbuj ponownie za chwilę.",
  "profiles.update": "Za dużo zmian w profilu. Spróbuj ponownie za chwilę.",
  uploads: "Za dużo przesłanych plików. Spróbuj ponownie za chwilę.",
  dataExport: "Eksport danych jest dostępny raz na 24 godziny.",
  "auth.otpRequest": "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
  "auth.otpVerify": "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
};

export const DEFAULT_RATE_LIMIT_MESSAGE = "Zbyt wiele prób. Spróbuj ponownie za chwilę.";
```

**Step 2: Commit**

```
git add apps/api/src/config/rateLimits.ts
git commit -m "Add centralized rate limit configuration"
```

---

## Task 3: tRPC rate limit middleware (post-auth, userId-based)

**Files:**
- Create: `apps/api/src/trpc/middleware/rateLimit.ts`
- Modify: `apps/api/src/trpc/procedures/waves.ts` — add middleware to send/respond
- Modify: `apps/api/src/trpc/procedures/messages.ts` — add middleware to send/setTyping
- Modify: `apps/api/src/trpc/procedures/profiles.ts` — add middleware to update/getNearby
- Modify: `apps/api/src/trpc/procedures/accounts.ts` — add middleware to requestDataExport
- Modify: `apps/api/src/trpc/trpc.ts` — add global rate limit to protectedProcedure

**Step 1: Create tRPC rate limit middleware**

```ts
import { TRPCError } from "@trpc/server";
import { checkRateLimit } from "@/services/rate-limiter";
import { type RateLimitName, rateLimitMessages, rateLimits, DEFAULT_RATE_LIMIT_MESSAGE } from "@/config/rateLimits";
import { middleware } from "@/trpc/trpc";

/**
 * tRPC middleware that rate limits by userId.
 *
 * Usage: .use(rateLimit("waves.send"))
 *
 * For per-resource limits (e.g. messages per conversation), pass a keySuffix function:
 * .use(rateLimit("messages.send", ({ input }) => input.conversationId))
 */
export function rateLimit(
  name: RateLimitName,
  keySuffix?: (opts: { input: any }) => string,
) {
  const config = rateLimits[name];

  return middleware(async ({ ctx, next, input }) => {
    if (!ctx.userId) return next();

    const suffix = keySuffix ? `:${keySuffix({ input })}` : "";
    const key = `${name}:${ctx.userId}${suffix}`;

    const result = await checkRateLimit(key, config.limit, config.window);

    if (result.limited) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: JSON.stringify({
          error: "RATE_LIMITED",
          context: name,
          message: rateLimitMessages[name] ?? DEFAULT_RATE_LIMIT_MESSAGE,
          retryAfter: result.retryAfter,
        }),
      });
    }

    return next();
  });
}
```

**Step 2: Add global rate limit to protectedProcedure**

In `apps/api/src/trpc/trpc.ts`, add the global rate limit after isAuthed:

```ts
import { checkRateLimit } from "@/services/rate-limiter";
import { rateLimits } from "@/config/rateLimits";

const globalRateLimit = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) return next();

  const result = await checkRateLimit(
    `global:${ctx.userId}`,
    rateLimits.global.limit,
    rateLimits.global.window,
  );

  if (result.limited) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: JSON.stringify({
        error: "RATE_LIMITED",
        context: "global",
        message: "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
        retryAfter: result.retryAfter,
      }),
    });
  }

  return next();
});

export const protectedProcedure = t.procedure.use(isAuthed).use(globalRateLimit);
```

**Step 3: Apply per-procedure rate limits**

In `waves.ts`:
```ts
import { rateLimit } from "@/trpc/middleware/rateLimit";

// On send (after featureGate):
send: protectedProcedure
  .use(featureGate("waves.send"))
  .use(rateLimit("waves.send"))
  // ...

// On respond (after featureGate):
respond: protectedProcedure
  .use(featureGate("waves.respond"))
  .use(rateLimit("waves.respond"))
  // ...
```

In `messages.ts`:
```ts
import { rateLimit } from "@/trpc/middleware/rateLimit";

// On send — two limits: per-conversation + global messages
send: protectedProcedure
  .use(rateLimit("messages.send", ({ input }) => input.conversationId))
  .use(rateLimit("messages.sendGlobal"))
  // ...
```

In `profiles.ts` — apply to update procedures and getNearby.

In `accounts.ts` — apply to requestDataExport.

**Step 4: Commit**

```
git add apps/api/src/trpc/middleware/rateLimit.ts apps/api/src/trpc/trpc.ts \
  apps/api/src/trpc/procedures/waves.ts apps/api/src/trpc/procedures/messages.ts \
  apps/api/src/trpc/procedures/profiles.ts apps/api/src/trpc/procedures/accounts.ts
git commit -m "Add tRPC rate limiting middleware with per-procedure limits"
```

---

## Task 4: Hono rate limit middleware (pre-auth, IP-based)

**Files:**
- Create: `apps/api/src/middleware/rateLimit.ts`
- Modify: `apps/api/src/index.ts` — apply to auth routes

**Step 1: Create Hono middleware**

```ts
import type { Context, Next } from "hono";
import { checkRateLimit } from "@/services/rate-limiter";
import { type RateLimitName, rateLimitMessages, rateLimits, DEFAULT_RATE_LIMIT_MESSAGE } from "@/config/rateLimits";

/**
 * Hono middleware that rate limits by client IP.
 * Used for pre-auth endpoints (OTP request, OTP verify).
 *
 * IP extraction: X-Forwarded-For (Railway proxy) > c.req.header("x-real-ip") > "unknown"
 */
export function honoRateLimit(name: RateLimitName) {
  const config = rateLimits[name];

  return async (c: Context, next: Next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const result = await checkRateLimit(`${name}:${ip}`, config.limit, config.window);

    if (result.limited) {
      return c.json(
        {
          error: "RATE_LIMITED",
          context: name,
          message: rateLimitMessages[name] ?? DEFAULT_RATE_LIMIT_MESSAGE,
          retryAfter: result.retryAfter,
        },
        429,
        { "Retry-After": String(result.retryAfter) },
      );
    }

    await next();
  };
}
```

**Step 2: Apply to auth routes in index.ts**

Better Auth handles `/api/auth/*`. We need to intercept specific auth paths.

OTP request = `POST /api/auth/sign-in/email-otp` (sends email)
OTP verify = `POST /api/auth/email-otp/verify-email`

Check actual Better Auth routes by looking at how the mobile auth client calls them. The emailOTP plugin uses:
- `POST /api/auth/sign-in/email-otp` — send OTP
- `POST /api/auth/email-otp/verify-email` — verify OTP

Add rate limiting middleware before the auth handler:

```ts
import { honoRateLimit } from "./middleware/rateLimit";

// Rate limit OTP endpoints (before Better Auth handler)
app.post("/api/auth/sign-in/email-otp", honoRateLimit("auth.otpRequest"));
app.post("/api/auth/email-otp/verify-email", honoRateLimit("auth.otpVerify"));

// Better Auth handler (existing — must come AFTER rate limit middleware)
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});
```

Also apply upload rate limiting:

```ts
// File upload rate limit (extract userId from Bearer token)
// This needs auth extraction first — implement inline since it's one endpoint
```

For uploads, the endpoint already extracts the auth header. Add rate limiting after auth verification using userId from the session. Since the upload endpoint does its own auth, we need to extract userId first, then check rate limit. Best approach: add the check inline after the Bearer token validation in the existing upload handler.

**Step 3: Commit**

```
git add apps/api/src/middleware/rateLimit.ts apps/api/src/index.ts
git commit -m "Add Hono rate limiting middleware for pre-auth endpoints"
```

---

## Task 5: WebSocket rate limiting (in-memory)

**Files:**
- Modify: `apps/api/src/ws/handler.ts`

**Step 1: Add in-memory rate limiter for WebSocket**

WebSocket connections are stateful and long-lived. Redis isn't needed — simple in-memory counters per connection are sufficient.

Add to `handler.ts`:

```ts
// In-memory sliding window for WebSocket rate limiting
const wsCounters = new Map<string, { count: number; resetAt: number }>();

function checkWsRateLimit(userId: string, type: string, limit: number, windowMs: number): boolean {
  const key = `${type}:${userId}`;
  const now = Date.now();
  const entry = wsCounters.get(key);

  if (!entry || now > entry.resetAt) {
    wsCounters.set(key, { count: 1, resetAt: now + windowMs });
    return false; // not limited
  }

  entry.count++;
  return entry.count > limit; // limited if over
}
```

In the `message` handler, before processing typing events:

```ts
// Rate limit typing indicators: 10 per 10 seconds
if (data.type === "typing" && ws.data.userId && data.conversationId) {
  if (checkWsRateLimit(ws.data.userId, "typing", 10, 10_000)) return; // silent drop
  // ... existing typing logic
}
```

Add general WS message rate limit at the top of the `message` handler:

```ts
async message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
  // Global WS rate limit: 30 messages per minute
  if (ws.data.userId && checkWsRateLimit(ws.data.userId, "ws", 30, 60_000)) return;
  // ... existing logic
}
```

Also add periodic cleanup of stale counter entries (every 5 minutes) to prevent memory leak:

```ts
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of wsCounters) {
    if (now > entry.resetAt) wsCounters.delete(key);
  }
}, 5 * 60 * 1000);
```

**Step 2: Commit**

```
git add apps/api/src/ws/handler.ts
git commit -m "Add in-memory WebSocket rate limiting"
```

---

## Task 6: Remove wave cancel (make waves irreversible)

**Files:**
- Modify: `apps/api/src/trpc/procedures/waves.ts` — remove cancel procedure
- Modify: `apps/mobile/app/(modals)/user/[userId].tsx` — remove cancel UI/logic
- Modify: `packages/shared/src/validators.ts` — remove cancelWaveSchema if exists

**Step 1: Remove cancel from API**

In `apps/api/src/trpc/procedures/waves.ts`, delete the entire `cancel` procedure (lines 161-185).

**Step 2: Remove cancel from mobile**

In `apps/mobile/app/(modals)/user/[userId].tsx`:
- Remove `cancelWaveMutation` (line ~131)
- Remove `handleCancelWave` function (lines ~189-205)
- Change the "Zaczepiono" pill to be non-interactive (just a status indicator, no onPress)

The pill should show "Zaczepiono" with no tap action — user can't undo a wave.

**Step 3: Commit**

```
git add apps/api/src/trpc/procedures/waves.ts \
  apps/mobile/app/(modals)/user/[userId].tsx \
  packages/shared/src/validators.ts
git commit -m "Remove wave cancel — waves are now irreversible"
```

---

## Task 7: Wave send deduplication (unique constraint)

**Files:**
- Modify: `apps/api/src/db/schema.ts` — add unique index
- Run: `npx drizzle-kit generate --name=wave-pending-unique-constraint`
- Run: `npx drizzle-kit migrate`

**Step 1: Add partial unique index in schema**

Drizzle doesn't natively support partial unique indexes (`WHERE status = 'pending'`). Use a raw SQL index via `uniqueIndex().on(...).where(sql...)` or a custom migration.

Best approach: generate a custom migration and write the SQL manually.

```bash
cd apps/api
npx drizzle-kit generate --custom --name=wave-pending-unique-constraint
```

Then write the migration SQL:

```sql
CREATE UNIQUE INDEX waves_pending_unique ON waves ("from_user_id", "to_user_id") WHERE status = 'pending';
```

This prevents the TOCTOU race condition — if two concurrent `waves.send` requests pass the SELECT check, the second INSERT will fail at the DB level with a unique constraint violation.

**Step 2: Handle constraint violation in waves.send**

In `waves.ts`, wrap the INSERT in try/catch to handle the duplicate case gracefully:

```ts
try {
  const [wave] = await db
    .insert(schema.waves)
    .values({ fromUserId: ctx.userId, toUserId: input.toUserId })
    .returning();
  // ... rest of logic
} catch (err: any) {
  if (err?.code === "23505") { // PostgreSQL unique violation
    throw new TRPCError({ code: "CONFLICT", message: "You already waved at this user" });
  }
  throw err;
}
```

**Step 3: Apply migration**

```bash
cd apps/api
npx drizzle-kit migrate
```

**Step 4: Commit**

```
git add apps/api/drizzle/ apps/api/src/trpc/procedures/waves.ts
git commit -m "Add unique constraint on pending waves to prevent race condition"
```

---

## Task 8: Message send idempotency

**Files:**
- Modify: `packages/shared/src/validators.ts` — add idempotencyKey to sendMessageSchema
- Modify: `apps/api/src/trpc/procedures/messages.ts` — check idempotency key in Redis
- Modify: `apps/mobile/` — generate UUID idempotency key on send

**Step 1: Add idempotencyKey to schema**

In `packages/shared/src/validators.ts`, add to `sendMessageSchema`:

```ts
export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1).max(2000),
  type: z.enum(["text", "image", "location"]).default("text"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  replyToId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid().optional(), // Client-generated, prevents duplicate sends on retry
});
```

**Step 2: Check idempotency in messages.send**

In `apps/api/src/trpc/procedures/messages.ts`, at the top of the `send` mutation (after participant check):

```ts
import { RedisClient } from "bun";

const redis = new RedisClient(process.env.REDIS_URL!);

// Inside send mutation, after participant check:
if (input.idempotencyKey) {
  const idemKey = `idem:msg:${ctx.userId}:${input.idempotencyKey}`;
  const existing = await redis.get(idemKey);
  if (existing) {
    // Already processed — return the cached message
    return JSON.parse(existing);
  }
}

// ... existing insert logic ...

// After successful insert, cache the result:
if (input.idempotencyKey) {
  const idemKey = `idem:msg:${ctx.userId}:${input.idempotencyKey}`;
  await redis.set(idemKey, JSON.stringify(message), { ex: 300 }); // 5 min TTL
}
```

**Step 3: Generate idempotency key on mobile**

In the mobile chat send logic, generate a UUID before calling the mutation:

```ts
const idempotencyKey = crypto.randomUUID();
await sendMessageMutation.mutateAsync({
  conversationId,
  content: text,
  idempotencyKey,
});
```

Find the exact file by searching for `sendMessageMutation` or `messages.send.useMutation` in the mobile app. Add `idempotencyKey: crypto.randomUUID()` to the mutation input.

**Step 4: Commit**

```
git add packages/shared/src/validators.ts \
  apps/api/src/trpc/procedures/messages.ts \
  apps/mobile/
git commit -m "Add message idempotency key to prevent duplicate sends"
```

---

## Task 9: Group push notification suppression

**Files:**
- Modify: `apps/api/src/services/push.ts` — add collapseId support + unread suppression
- Modify: `apps/api/src/trpc/procedures/messages.ts` — pass conversation type + unread info to push

**Step 1: Extend push service to support collapseId and suppression**

In `apps/api/src/services/push.ts`, update the `sendPushToUser` function signature:

```ts
export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
    collapseId?: string;       // Expo collapse ID — same ID = silent replacement
  },
): Promise<void> {
```

In the `messages` array builder, add `_contentAvailable` and `channelId`:

```ts
.map((t) => ({
  to: t.token,
  sound: payload.collapseId ? null : ("default" as const), // silent if collapsing
  title: payload.title,
  body: payload.body,
  data: payload.data,
  ...(payload.collapseId && { _id: payload.collapseId }), // Expo collapse ID
}));
```

Note: Expo Push API uses `_id` field for collapse grouping on iOS (maps to `apns-collapse-id`).

**Step 2: Update messages.send to pass unread info**

In `apps/api/src/trpc/procedures/messages.ts`, in the push notification loop (around line 400):

```ts
// Get conversation type
const [conversation] = await db
  .select({ type: schema.conversations.type })
  .from(schema.conversations)
  .where(eq(schema.conversations.id, input.conversationId));

const isGroup = conversation?.type === "group";

for (const p of participants) {
  if (p.userId === ctx.userId) continue;

  if (isGroup) {
    // Group: check if recipient has unread messages (unread suppression)
    const [participant] = await db
      .select({ lastReadAt: schema.conversationParticipants.lastReadAt })
      .from(schema.conversationParticipants)
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, p.userId),
        ),
      );

    // Count unread messages since lastReadAt
    const lastRead = participant?.lastReadAt;
    let unreadCount = 0;
    if (lastRead) {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.conversationId, input.conversationId),
            ne(schema.messages.senderId, p.userId),
            isNull(schema.messages.deletedAt),
            gt(schema.messages.createdAt, lastRead),
          ),
        );
      unreadCount = Number(result?.count || 0);
    }

    const hasUnread = unreadCount > 1; // >1 because current message is already inserted

    void sendPushToUser(p.userId, {
      title: conversation?.name ?? senderProfile?.displayName ?? "Blisko",
      body: hasUnread
        ? `${unreadCount} nowych wiadomości`
        : `${senderProfile?.displayName ?? "Ktoś"}: ${messagePreview}`,
      data: { type: "chat", conversationId: input.conversationId },
      collapseId: hasUnread ? `group:${input.conversationId}` : undefined,
    });
  } else {
    // DM: push every message (like iMessage)
    void sendPushToUser(p.userId, {
      title: senderProfile?.displayName ?? "Ktoś",
      body: messagePreview,
      data: { type: "chat", conversationId: input.conversationId },
    });
  }
}
```

**Step 3: Commit**

```
git add apps/api/src/services/push.ts apps/api/src/trpc/procedures/messages.ts
git commit -m "Add group push notification suppression with collapseId"
```

---

## Task 10: Mobile client error handling

**Files:**
- Modify: `apps/mobile/src/lib/trpc.ts` — add global tRPC error handler
- Modify: `apps/mobile/src/lib/auth.ts` or login screen — add 429 handling for auth
- Create or modify: `apps/mobile/src/lib/rateLimitMessages.ts` — context-to-message mapping

**Step 1: Create rate limit message mapping**

```ts
// apps/mobile/src/lib/rateLimitMessages.ts

const RATE_LIMIT_MESSAGES: Record<string, string> = {
  "waves.send": "Wysłałeś dużo zaczepek. Odpocznij chwilę i spróbuj później.",
  "messages.send": "Za dużo wiadomości naraz. Zwolnij trochę.",
  "messages.sendGlobal": "Za dużo wiadomości. Spróbuj ponownie za chwilę.",
  "profiles.update": "Za dużo zmian w profilu. Spróbuj ponownie za chwilę.",
  uploads: "Za dużo przesłanych plików. Spróbuj ponownie za chwilę.",
  dataExport: "Eksport danych jest dostępny raz na 24 godziny.",
  "auth.otpRequest": "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
  "auth.otpVerify": "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
};

const DEFAULT_MESSAGE = "Zbyt wiele prób. Spróbuj ponownie za chwilę.";

export function getRateLimitMessage(context?: string): string {
  return (context && RATE_LIMIT_MESSAGES[context]) || DEFAULT_MESSAGE;
}
```

**Step 2: Add global tRPC error handler**

In `apps/mobile/src/lib/trpc.ts`, the tRPC client is created with `httpBatchLink`. We need to add error handling. Find where mutations are called and add a global `onError` in the tRPC React setup, or use a custom link.

Best approach: use `TRPCClientError` handling in a wrapper or in `QueryClient`'s `onError`:

In the QueryClient configuration (likely in a provider), add:

```ts
import { getRateLimitMessage } from "@/lib/rateLimitMessages";

// In the mutation cache default options:
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (error) => {
        if (error instanceof TRPCClientError && error.data?.code === "TOO_MANY_REQUESTS") {
          try {
            const parsed = JSON.parse(error.message);
            if (parsed.error === "RATE_LIMITED") {
              showToast({
                type: "error",
                title: getRateLimitMessage(parsed.context),
              });
              return; // Don't propagate to per-mutation onError
            }
          } catch {}
        }
      },
    },
  },
});
```

Find the exact file where `QueryClient` is created and add this global handler.

**Step 3: Add 429 handling for auth flow**

In the login/OTP screen, the Better Auth client calls are made via `authClient.signIn.emailOTP()` and similar. These use fetch internally. When a 429 is returned by the Hono middleware, Better Auth may throw or return an error.

Find the login component (likely `apps/mobile/app/(auth)/login.tsx` or similar) and add error handling:

```ts
try {
  await authClient.signIn.emailOTP({ email });
} catch (error: any) {
  if (error?.status === 429 || error?.message?.includes("RATE_LIMITED")) {
    showToast({
      type: "error",
      title: "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
    });
    return;
  }
  // ... existing error handling
}
```

Check the exact error shape that Better Auth client returns on 429.

**Step 4: Commit**

```
git add apps/mobile/src/lib/rateLimitMessages.ts \
  apps/mobile/src/lib/trpc.ts \
  apps/mobile/app/
git commit -m "Add rate limit error handling on mobile (toast messages)"
```

---

## Task 11: Upload rate limiting

**Files:**
- Modify: `apps/api/src/index.ts` — add rate limit check to upload endpoint

**Step 1: Add rate limiting to upload handler**

The upload endpoint does its own auth (Bearer token). After auth verification, add rate limit check.

In `apps/api/src/index.ts`, inside the `app.post("/uploads", ...)` handler, after the auth header check:

```ts
// After getting the session token, look up userId
const token = authHeader.replace("Bearer ", "");
const [sessionRow] = await db
  .select({ userId: schema.session.userId })
  .from(schema.session)
  .where(and(eq(schema.session.token, token), gt(schema.session.expiresAt, new Date())));

if (!sessionRow) {
  return c.json({ error: "Unauthorized" }, 401);
}

// Rate limit
const rlResult = await checkRateLimit(`uploads:${sessionRow.userId}`, rateLimits.uploads.limit, rateLimits.uploads.window);
if (rlResult.limited) {
  return c.json(
    {
      error: "RATE_LIMITED",
      context: "uploads",
      message: rateLimitMessages.uploads ?? DEFAULT_RATE_LIMIT_MESSAGE,
      retryAfter: rlResult.retryAfter,
    },
    429,
    { "Retry-After": String(rlResult.retryAfter) },
  );
}
```

Note: The current upload handler only checks `authHeader?.startsWith("Bearer ")` but doesn't validate the session. This change also fixes the auth validation. Import `checkRateLimit`, `rateLimits`, `rateLimitMessages`, `DEFAULT_RATE_LIMIT_MESSAGE` from the appropriate modules.

**Step 2: Commit**

```
git add apps/api/src/index.ts
git commit -m "Add rate limiting to file upload endpoint"
```

---

## Task 12: Typecheck and verify

**Step 1: Run typechecks**

```bash
pnpm --filter @repo/api typecheck
pnpm --filter @repo/shared typecheck
pnpm --filter @repo/mobile typecheck
```

Fix any type errors.

**Step 2: Run tests**

```bash
pnpm --filter @repo/api test
```

Fix any test failures.

**Step 3: Run Biome**

```bash
npx @biomejs/biome check .
```

Fix any lint/format errors.

**Step 4: Final commit**

```
git add -A
git commit -m "Fix typecheck and lint issues for rate limiting"
```
