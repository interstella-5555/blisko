import { and, count, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { bullmqQueueDepth } from "./prometheus";
import { getAiQueueInstance } from "./queue";
import { getQueueStats, percentile } from "./queue-metrics";
import { getWsStats } from "./ws-metrics";

const DEFAULT_WINDOW_HOURS = 24;

export async function getMetricsSummary(windowHours = DEFAULT_WINDOW_HOURS) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const [overview, slowest, errors, sloBreaches, queues] = await Promise.all([
    getOverview(since),
    getSlowestEndpoints(since),
    getTopErrors(since),
    checkSloBreaches(since),
    getQueueSummary(),
  ]);

  const websocket = getWsStats();

  return { windowHours, since: since.toISOString(), overview, slowest, errors, sloBreaches, queues, websocket };
}

async function getOverview(since: Date) {
  const rows = await db
    .select({
      totalRequests: count(),
      errorCount: count(sql`CASE WHEN ${schema.requestEvents.statusCode} >= 500 THEN 1 END`),
      p50: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${schema.requestEvents.durationMs})`,
      p95: sql<number>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${schema.requestEvents.durationMs})`,
      p99: sql<number>`percentile_cont(0.99) WITHIN GROUP (ORDER BY ${schema.requestEvents.durationMs})`,
    })
    .from(schema.requestEvents)
    .where(gte(schema.requestEvents.timestamp, since));

  const row = rows[0];
  if (!row || row.totalRequests === 0) {
    return { totalRequests: 0, errorRate: 0, p50: 0, p95: 0, p99: 0 };
  }

  return {
    totalRequests: row.totalRequests,
    errorRate: Number(((row.errorCount / row.totalRequests) * 100).toFixed(2)),
    p50: Math.round(Number(row.p50)),
    p95: Math.round(Number(row.p95)),
    p99: Math.round(Number(row.p99)),
  };
}

async function getSlowestEndpoints(since: Date, limit = 10) {
  return db
    .select({
      endpoint: schema.requestEvents.endpoint,
      requestCount: count(),
      p95: sql<number>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${schema.requestEvents.durationMs})`,
      p50: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${schema.requestEvents.durationMs})`,
    })
    .from(schema.requestEvents)
    .where(gte(schema.requestEvents.timestamp, since))
    .groupBy(schema.requestEvents.endpoint)
    .orderBy(sql`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${schema.requestEvents.durationMs}) DESC`)
    .limit(limit);
}

async function getTopErrors(since: Date, limit = 10) {
  return db
    .select({
      endpoint: schema.requestEvents.endpoint,
      statusCode: schema.requestEvents.statusCode,
      errorMessage: schema.requestEvents.errorMessage,
      errorCount: count(),
    })
    .from(schema.requestEvents)
    .where(and(gte(schema.requestEvents.timestamp, since), gte(schema.requestEvents.statusCode, 500)))
    .groupBy(schema.requestEvents.endpoint, schema.requestEvents.statusCode, schema.requestEvents.errorMessage)
    .orderBy(sql`count(*) DESC`)
    .limit(limit);
}

async function checkSloBreaches(since: Date) {
  const targets = await db
    .select({
      id: schema.sloTargets.id,
      endpoint: schema.sloTargets.endpoint,
      metricType: schema.sloTargets.metricType,
      thresholdMs: schema.sloTargets.thresholdMs,
      thresholdPct: schema.sloTargets.thresholdPct,
    })
    .from(schema.sloTargets);

  const breaches: {
    endpoint: string | null;
    metricType: string;
    threshold: number;
    actual: number;
  }[] = [];

  for (const target of targets) {
    if (target.metricType === "error_rate" && target.thresholdPct) {
      const actual = await getErrorRate(since, target.endpoint);
      const threshold = Number(target.thresholdPct);
      if (actual > threshold) {
        breaches.push({ endpoint: target.endpoint, metricType: "error_rate", threshold, actual });
      }
    } else if (target.metricType === "p95" && target.thresholdMs) {
      const actual = await getPercentile(since, 0.95, target.endpoint);
      if (actual > target.thresholdMs) {
        breaches.push({ endpoint: target.endpoint, metricType: "p95", threshold: target.thresholdMs, actual });
      }
    }
  }

  return breaches;
}

async function getErrorRate(since: Date, endpoint: string | null): Promise<number> {
  const condition = endpoint
    ? and(gte(schema.requestEvents.timestamp, since), eq(schema.requestEvents.endpoint, endpoint))
    : gte(schema.requestEvents.timestamp, since);

  const rows = await db
    .select({
      total: count(),
      errors: count(sql`CASE WHEN ${schema.requestEvents.statusCode} >= 500 THEN 1 END`),
    })
    .from(schema.requestEvents)
    .where(condition);

  const row = rows[0];
  if (!row || row.total === 0) return 0;
  return (row.errors / row.total) * 100;
}

async function getPercentile(since: Date, pct: number, endpoint: string | null): Promise<number> {
  const conditions = [gte(schema.requestEvents.timestamp, since)];
  if (endpoint) {
    conditions.push(eq(schema.requestEvents.endpoint, endpoint));
  }

  const rows = await db
    .select({
      value: sql<number>`percentile_cont(${pct}) WITHIN GROUP (ORDER BY ${schema.requestEvents.durationMs})`,
    })
    .from(schema.requestEvents)
    .where(and(...conditions));

  return Math.round(Number(rows[0]?.value ?? 0));
}

async function getQueueSummary() {
  const allStats = getQueueStats();
  const queue = getAiQueueInstance();
  const results = [];

  for (const [name, s] of allStats) {
    const avgDurationMs =
      s.durations.length > 0 ? Math.round(s.durations.reduce((a, b) => a + b, 0) / s.durations.length) : 0;
    const p95DurationMs = Math.round(percentile(s.durations, 0.95));

    let waiting = 0;
    let active = 0;
    let delayed = 0;

    if (queue) {
      try {
        const counts = await queue.getJobCounts("waiting", "active", "delayed");
        waiting = counts.waiting ?? 0;
        active = counts.active ?? 0;
        delayed = counts.delayed ?? 0;
        bullmqQueueDepth.set({ queue: name, state: "waiting" }, waiting);
        bullmqQueueDepth.set({ queue: name, state: "active" }, active);
        bullmqQueueDepth.set({ queue: name, state: "delayed" }, delayed);
      } catch {
        // Redis might be unavailable
      }
    }

    results.push({
      name,
      completed: s.completed,
      failed: s.failed,
      waiting,
      active,
      delayed,
      avgDurationMs,
      p95DurationMs,
    });
  }

  return results;
}
