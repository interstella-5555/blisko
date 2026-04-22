// Sentry must initialize before anything else so request handlers + workers
// loaded below pick up the configured client.
import { initSentry, Sentry } from "./services/sentry";

initSentry();

import { trpcServer } from "@hono/trpc-server";
import { addDays } from "date-fns";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./auth";
import { honoRateLimit } from "./middleware/rateLimit";
import { metricsMiddleware } from "./services/metrics";
import { createContext } from "./trpc/context";
import { appRouter } from "./trpc/router";

const app = new Hono();

// Metrics — must be first to capture full request duration
app.use("*", metricsMiddleware());

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:8081", "exp://localhost:8081", "blisko://"],
    credentials: true,
  }),
);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Debug: Check recent verifications (dev only)
if (process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_LOGIN === "true") {
  app.get("/dev/verifications", async (c) => {
    const { db } = await import("./db");
    const { verification } = await import("./db/schema");
    const { desc } = await import("drizzle-orm");

    const verifications = await db.select().from(verification).orderBy(desc(verification.createdAt)).limit(5);

    return c.json(verifications);
  });
}

// Metrics endpoints (IP rate limited)
app.get("/api/metrics/summary", honoRateLimit("metrics.summary"), async (c) => {
  const { getMetricsSummary } = await import("./services/metrics-summary");
  const windowHours = Number(c.req.query("window") || 24);
  const summary = await getMetricsSummary(windowHours);
  return c.json(summary);
});

app.get("/metrics", honoRateLimit("metrics.prometheus"), async (c) => {
  const { registry } = await import("./services/prometheus");
  const metrics = await registry.metrics();
  return c.text(metrics, 200, { "Content-Type": registry.contentType });
});

// Internal: AI call log ingest (shared-secret auth). Lets the chatbot service
// push AI call events into the same `metrics.ai_calls` pipeline as the API.
// Cost is computed server-side from `model` + tokens — clients don't send it.
app.post("/internal/ai-log", async (c) => {
  const secret = process.env.INTERNAL_AI_LOG_SECRET;
  if (!secret) return c.json({ error: "not configured" }, 503);
  if (c.req.header("x-internal-secret") !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }
  try {
    const body = await c.req.json();
    const { aiCallBuffer } = await import("./services/ai-log-buffer");
    const { estimateCostUsd } = await import("./services/ai-pricing");
    const promptTokens = Number(body.promptTokens ?? 0);
    const completionTokens = Number(body.completionTokens ?? 0);
    const serviceTier = body.serviceTier === "flex" ? "flex" : "standard";
    aiCallBuffer.append({
      jobName: String(body.jobName ?? "unknown"),
      model: String(body.model ?? "unknown"),
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd: estimateCostUsd(String(body.model ?? "unknown"), promptTokens, completionTokens, serviceTier),
      userId: body.userId ?? null,
      targetUserId: body.targetUserId ?? null,
      serviceTier,
      reasoningEffort: body.reasoningEffort ?? null,
      durationMs: Number(body.durationMs ?? 0),
      status: body.status === "failed" ? "failed" : "success",
      errorMessage: body.errorMessage ? String(body.errorMessage).slice(0, 200) : null,
      inputJsonb: body.input ?? null,
      outputJsonb: body.output ?? null,
    });
    return c.json({ ok: true });
  } catch (err) {
    console.error("[internal/ai-log] append failed:", err);
    return c.json({ error: "bad payload" }, 400);
  }
});

// Pre-auth rate limits (by IP, before Better Auth handler)
app.post("/api/auth/sign-in/email-otp", honoRateLimit("auth.otpRequest"));
app.post("/api/auth/email-otp/verify-email", honoRateLimit("auth.otpVerify"));

// Better Auth handler
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// Dev-only: Auto-login for @example.com emails (bypasses magic link)
// Enable with ENABLE_DEV_LOGIN=true for testing on staging/production
if (process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_LOGIN === "true") {
  app.post("/dev/auto-login", async (c) => {
    try {
      const { email } = await c.req.json();

      if (!email?.endsWith("@example.com")) {
        return c.json({ error: "Only @example.com emails allowed" }, 400);
      }

      const { db } = await import("./db");
      const { user, session } = await import("./db/schema");
      const { eq } = await import("drizzle-orm");

      // Find or create user
      let [existingUser] = await db.select().from(user).where(eq(user.email, email)).limit(1);

      if (!existingUser) {
        // Create new user
        [existingUser] = await db
          .insert(user)
          .values({
            id: crypto.randomUUID(),
            email,
            name: email.split("@")[0],
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
      }

      // Create session
      const sessionToken = crypto.randomUUID();
      const expiresAt = addDays(new Date(), 30);

      const [newSession] = await db
        .insert(session)
        .values({
          id: crypto.randomUUID(),
          userId: existingUser.id,
          token: sessionToken,
          expiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return c.json({
        user: existingUser,
        session: newSession,
        token: sessionToken,
      });
    } catch (error) {
      console.error("Auto-login error:", error);
      return c.json({ error: "Failed to auto-login", details: String(error) }, 500);
    }
  });

  // Mark profile as complete (for E2E seed scripts — bypasses profiling flow)
  app.post("/dev/mark-complete", async (c) => {
    try {
      const { userId } = await c.req.json();
      if (!userId) return c.json({ error: "userId required" }, 400);

      const { db } = await import("./db");
      const { profiles } = await import("./db/schema");
      const { eq } = await import("drizzle-orm");

      await db.update(profiles).set({ isComplete: true }).where(eq(profiles.userId, userId));
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: "Failed to mark complete", details: String(error) }, 500);
    }
  });

  // Send message directly (for E2E seed scripts — bypasses rate limiter)
  app.post("/dev/send-message", async (c) => {
    try {
      const { conversationId, senderId, content } = await c.req.json();
      if (!conversationId || !senderId || !content) {
        return c.json({ error: "conversationId, senderId, content required" }, 400);
      }

      const { db } = await import("./db");
      const { messages } = await import("./db/schema");

      const { sql } = await import("drizzle-orm");
      const [msg] = await db
        .insert(messages)
        .values({
          id: crypto.randomUUID(),
          conversationId,
          senderId,
          content,
          type: "text",
          createdAt: new Date(),
          seq: sql`COALESCE((SELECT MAX(${messages.seq}) FROM ${messages} WHERE ${messages.conversationId} = ${conversationId}), 0) + 1`,
        })
        .returning({ id: messages.id });

      return c.json({ ok: true, messageId: msg.id });
    } catch (error) {
      return c.json({ error: "Failed to send message", details: String(error) }, 500);
    }
  });
}

// File uploads — S3-compatible object storage (Bun built-in S3Client)
import { and, eq, gt } from "drizzle-orm";
import { DEFAULT_RATE_LIMIT_MESSAGE, rateLimitMessages, rateLimits } from "./config/rateLimits";
import { db, schema } from "./db";
import { moderateImage } from "./services/moderation";
import { checkRateLimit } from "./services/rate-limiter";
import { s3Client } from "./services/s3";

app.post("/uploads", async (c) => {
  try {
    // Verify auth
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Validate session token and get userId
    const token = authHeader.replace("Bearer ", "");
    const [sessionRow] = await db
      .select({ userId: schema.session.userId })
      .from(schema.session)
      .where(and(eq(schema.session.token, token), gt(schema.session.expiresAt, new Date())));

    if (!sessionRow) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Rate limit uploads
    const rlResult = await checkRateLimit(
      `uploads:${sessionRow.userId}`,
      rateLimits.uploads.limit,
      rateLimits.uploads.window,
    );
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

    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    // Validate size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: "File too large (max 5MB)" }, 400);
    }

    // Validate type
    if (!file.type.startsWith("image/")) {
      return c.json({ error: "Only images allowed" }, 400);
    }

    const buffer = await file.arrayBuffer();

    // First-line visual filter. BLI-68 quarantine preserves evidence for what
    // slips through; this rejects the obvious cases (CSAM, graphic violence,
    // nudity) before anything hits S3.
    const moderation = await moderateImage(buffer, file.type);
    if (moderation.flagged) {
      return c.json({ error: "CONTENT_MODERATED" }, 400);
    }

    const ext = file.name.split(".").pop() || "jpg";
    const key = `uploads/${crypto.randomUUID()}.${ext}`;

    await s3Client.write(key, buffer, { type: file.type });

    // Return a stable source pointer. Mobile stores this in profiles.avatarUrl and
    // renders via the imgproxy helper (packages/shared/src/avatar.ts). Pre-BLI-254
    // we returned a presigned URL that expired in 7 days — which is why old uploads
    // silently 403 across the app.
    const source = `s3://${process.env.BUCKET_NAME}/${key}`;
    return c.json({ source });
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ error: "Upload failed" }, 500);
  }
});

// tRPC
app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
    onError({ error, path, type, ctx }) {
      // Skip expected client errors (validation, auth) — only surface server bugs.
      if (error.code !== "INTERNAL_SERVER_ERROR") return;

      // Mirror the error to stdout so `railway logs --filter '@level:error'` finds
      // it without depending on Bugsink. Batched tRPC requests return HTTP 200 with
      // errors in the body, so the Hono access log shows success — without this
      // line, Railway logs are silent on tRPC failures (BLI-190 incident).
      const cause = error.cause;
      const causeName = cause instanceof Error ? cause.constructor.name : undefined;
      const causeMessage = cause instanceof Error ? cause.message : undefined;
      const stack = cause instanceof Error ? cause.stack : error.stack;
      const userId = (ctx as { userId?: string } | undefined)?.userId ?? "anonymous";
      console.error(
        `[trpc:error] path=${path ?? "unknown"} type=${type} userId=${userId} code=${error.code}` +
          (causeName ? ` cause=${causeName}` : "") +
          ` message=${JSON.stringify(causeMessage ?? error.message)}\n${stack ?? "(no stack)"}`,
      );

      // Capture the underlying cause when present so Bugsink fingerprints by the
      // real stack trace. Capturing the TRPCError wrapper would group every server
      // error as a single issue.
      // Pass `user` per-call (not via Sentry.setUser, which is process-global state
      // and would bleed into concurrent requests) so Bugsink can show "affected
      // users" / filter issues by user.
      Sentry.captureException(cause ?? error, {
        tags: { source: "trpc", path: path ?? "unknown", type },
        user: ctx && (ctx as { userId?: string }).userId ? { id: (ctx as { userId: string }).userId } : undefined,
      });
    },
  }),
);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  // c.req.path is always set and pre-parsed by Hono — `new URL(c.req.url)` can throw
  // on relative/malformed URLs and would crash the global error handler.
  Sentry.captureException(err, {
    tags: { source: "hono.onError", method: c.req.method, path: c.req.path },
  });
  return c.json({ error: "Internal Server Error" }, 500);
});

// Redis pub/sub bridge for cross-replica WebSocket events
import { initWsRedisBridge } from "./ws/redis-bridge";

initWsRedisBridge();

// Start BullMQ workers
import { startAiWorker } from "./services/queue";
import { startMaintenanceWorker } from "./services/queue-maintenance";
import { startOpsWorker } from "./services/queue-ops";

startAiWorker();
startOpsWorker();
startMaintenanceWorker();

const port = Number(process.env.PORT) || 3000;

console.log(`🚀 Server starting on port ${port}`);

// Import WebSocket handler
import { wsHandler } from "./ws/handler";

// Bun runtime with WebSocket support
export default {
  port,
  fetch(req: Request, server: import("bun").Server<import("./ws/handler").WSData>) {
    // WebSocket upgrade for /ws path
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { userId: null, subscriptions: new Set() },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Regular HTTP handled by Hono
    return app.fetch(req, server);
  },
  websocket: wsHandler,
};

export { app };
