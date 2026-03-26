import type { Context, MiddlewareHandler } from "hono";
import type { NewRequestEvent } from "@/db";
import { db, schema } from "@/db";
import { createQueryContext, getQueryStats, queryTracker } from "@/services/query-tracker";
import { httpRequestDuration, httpRequestsTotal } from "./prometheus";

// --- Config ---

const BUFFER_HARD_CAP = 5000;
const FLUSH_THRESHOLD = 500;
const FLUSH_INTERVAL_MS = 10_000;
const SKIP_PATHS = new Set(["/metrics", "/api/metrics/summary"]);

// --- Buffer state ---

const buffer: NewRequestEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let isFlushing = false;

// --- Buffer management ---

export function getBufferSize(): number {
  return buffer.length;
}

export async function flushMetrics(): Promise<number> {
  if (buffer.length === 0 || isFlushing) return 0;
  isFlushing = true;
  const batch = buffer.splice(0);
  try {
    await db.insert(schema.requestEvents).values(batch);
    return batch.length;
  } catch (error) {
    console.warn(`[metrics] flush failed (${batch.length} events):`, error instanceof Error ? error.message : error);
    return 0;
  } finally {
    isFlushing = false;
  }
}

function pushEvent(event: NewRequestEvent): void {
  if (buffer.length >= BUFFER_HARD_CAP) {
    const dropCount = Math.floor(BUFFER_HARD_CAP * 0.1);
    buffer.splice(0, dropCount);
    console.warn(`[metrics] buffer at cap, dropped ${dropCount} oldest events`);
  }
  buffer.push(event);
  if (buffer.length >= FLUSH_THRESHOLD) {
    flushMetrics();
  }
}

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushMetrics();
  }, FLUSH_INTERVAL_MS);
}

export function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

// --- Request metadata sharing (Hono <-> tRPC) ---

export const requestMeta = new WeakMap<
  Request,
  {
    requestId: string;
    userId?: string;
    sessionId?: string;
    targetUserId?: string;
    targetGroupId?: string;
  }
>();

export function setTargetUserId(req: Request, targetUserId: string): void {
  const meta = requestMeta.get(req);
  if (meta) {
    meta.targetUserId = targetUserId;
  }
}

export function setTargetGroupId(req: Request, targetGroupId: string): void {
  const meta = requestMeta.get(req);
  if (meta) {
    meta.targetGroupId = targetGroupId;
  }
}

// --- Helpers ---

function extractEndpoint(c: Context): string {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/trpc/")) {
    return path.slice(6);
  }
  return path;
}

function parsePlatform(ua: string | undefined): string | null {
  if (!ua) return null;
  const iosMatch = ua.match(/iOS\s+([\d.]+)/);
  if (iosMatch) return `iOS ${iosMatch[1]}`;
  const androidMatch = ua.match(/Android\s+([\d.]+)/);
  if (androidMatch) return `Android ${androidMatch[1]}`;
  return null;
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || "dev-salt";
  return new Bun.CryptoHasher("sha256").update(ip + salt).digest("hex");
}

function getClientIp(c: Context): string | null {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? null;
}

function truncate(str: string | undefined, max: number): string | null {
  if (!str) return null;
  return str.length > max ? str.slice(0, max) : str;
}

// --- Hono Middleware ---

export function metricsMiddleware(): MiddlewareHandler {
  startFlushTimer();
  return async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (SKIP_PATHS.has(path)) {
      await next();
      return;
    }

    const start = performance.now();
    const requestId = crypto.randomUUID();
    c.header("X-Request-Id", requestId);
    requestMeta.set(c.req.raw, { requestId });

    let errMsg: string | null = null;
    const queryContext = createQueryContext();

    try {
      await queryTracker.run(queryContext, () => next());
    } catch (err) {
      errMsg = truncate(err instanceof Error ? err.message : String(err), 200);
      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - start);
      const meta = requestMeta.get(c.req.raw);
      const queryStats = getQueryStats() ?? queryContext;

      const endpoint = extractEndpoint(c);
      const statusCode = errMsg ? 500 : c.res.status;
      const labels = { method: c.req.method, endpoint, status_code: String(statusCode) };

      httpRequestDuration.observe(labels, durationMs);
      httpRequestsTotal.inc(labels);

      pushEvent({
        timestamp: new Date(),
        requestId,
        method: c.req.method,
        endpoint,
        userId: meta?.userId ?? null,
        durationMs,
        statusCode,
        appVersion: c.req.header("x-app-version") ?? null,
        platform: parsePlatform(c.req.header("user-agent")),
        authProvider: null,
        sessionId: meta?.sessionId ?? null,
        ipHash: hashIp(getClientIp(c)),
        userAgent: truncate(c.req.header("user-agent"), 200),
        errorMessage: errMsg,
        targetUserId: meta?.targetUserId ?? null,
        targetGroupId: meta?.targetGroupId ?? null,
        dbQueryCount: queryStats.queryCount || null,
        dbDurationMs: queryStats.dbDurationMs || null,
      });
      requestMeta.delete(c.req.raw);
    }
  };
}
