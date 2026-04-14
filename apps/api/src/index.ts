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
import { S3Client } from "bun";
import { and, eq, gt } from "drizzle-orm";
import { DEFAULT_RATE_LIMIT_MESSAGE, rateLimitMessages, rateLimits } from "./config/rateLimits";
import { db, schema } from "./db";
import { checkRateLimit } from "./services/rate-limiter";

const s3 = new S3Client({
  accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
  secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
  endpoint: process.env.BUCKET_ENDPOINT!,
  bucket: process.env.BUCKET_NAME!,
});

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

    const ext = file.name.split(".").pop() || "jpg";
    const key = `uploads/${crypto.randomUUID()}.${ext}`;

    const buffer = await file.arrayBuffer();
    await s3.write(key, buffer, { type: file.type });

    // Generate a presigned URL for reading (7 days)
    const url = s3.presign(key, {
      expiresIn: 7 * 24 * 60 * 60,
    });

    return c.json({ url, key });
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ error: "Upload failed" }, 500);
  }
});

app.get("/uploads/:key", async (c) => {
  const key = c.req.param("key");
  if (key.includes("..")) {
    return c.json({ error: "Invalid key" }, 400);
  }

  try {
    const file = s3.file(`uploads/${key}`);
    const url = file.presign({ expiresIn: 7 * 24 * 60 * 60 });
    return c.redirect(url);
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

// tRPC
app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
  }),
);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
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
