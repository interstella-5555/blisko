// One-shot read-only recon: find stuck profiling sessions, their AI call errors,
// and BullMQ state for the `generate-profile-from-qa` job.
// Usage: bun --env-file=apps/api/.env.production run apps/api/scripts/debug-profiling-stuck.ts

import { RedisClient } from "bun";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import ms from "ms";
import { db, schema } from "../src/db";

async function main() {
  const oneHourAgo = new Date(Date.now() - ms("1 hour"));
  const oneDayAgo = new Date(Date.now() - ms("1 day"));

  // Recent active (non-completed) sessions in last 24h — what's stuck?
  const stuck = await db
    .select({
      id: schema.profilingSessions.id,
      userId: schema.profilingSessions.userId,
      status: schema.profilingSessions.status,
      hasBio: schema.profilingSessions.generatedBio,
      hasLookingFor: schema.profilingSessions.generatedLookingFor,
      createdAt: schema.profilingSessions.createdAt,
      email: schema.user.email,
    })
    .from(schema.profilingSessions)
    .innerJoin(schema.user, eq(schema.user.id, schema.profilingSessions.userId))
    .where(and(gt(schema.profilingSessions.createdAt, oneDayAgo), isNull(schema.profilingSessions.generatedBio)))
    .orderBy(desc(schema.profilingSessions.createdAt))
    .limit(10);

  console.log(`\n=== ${stuck.length} sessions created in last 24h WITHOUT generatedBio ===`);
  for (const s of stuck) {
    console.log({
      id: s.id,
      user: s.email,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      ageMin: Math.round((Date.now() - s.createdAt.getTime()) / 60_000),
    });
  }

  // Recent AI call errors across all users (last 1h)
  const errors = await db
    .select({
      id: schema.aiCalls.id,
      timestamp: schema.aiCalls.timestamp,
      jobName: schema.aiCalls.jobName,
      model: schema.aiCalls.model,
      status: schema.aiCalls.status,
      errorMessage: schema.aiCalls.errorMessage,
      durationMs: schema.aiCalls.durationMs,
      userId: schema.aiCalls.userId,
    })
    .from(schema.aiCalls)
    .where(and(gt(schema.aiCalls.timestamp, oneHourAgo)))
    .orderBy(desc(schema.aiCalls.timestamp))
    .limit(30);

  const failed = errors.filter((e) => e.status !== "success");
  console.log(`\n=== AI calls in last 1h: ${errors.length} total, ${failed.length} errors ===`);
  for (const e of failed) {
    console.log({
      ts: e.timestamp.toISOString(),
      job: e.jobName,
      model: e.model,
      status: e.status,
      durationMs: e.durationMs,
      userId: e.userId,
      error: e.errorMessage?.slice(0, 300) ?? null,
    });
  }

  // By job name breakdown in last 1h
  const byJob = new Map<string, { ok: number; err: number }>();
  for (const e of errors) {
    const stat = byJob.get(e.jobName) ?? { ok: 0, err: 0 };
    if (e.status === "success") stat.ok++;
    else stat.err++;
    byJob.set(e.jobName, stat);
  }
  console.log(`\n=== By job name (last 1h) ===`);
  for (const [name, stat] of byJob) {
    console.log(`  ${name}: ok=${stat.ok}, err=${stat.err}`);
  }

  if (!process.env.REDIS_URL) return;
  const redis = new RedisClient(process.env.REDIS_URL);
  try {
    const queueName = "ai";
    console.log(`\n=== BullMQ "${queueName}" queue counts ===`);
    for (const state of ["waiting", "active", "delayed", "failed", "completed", "paused"]) {
      const key = `bull:${queueName}:${state}`;
      const len = await redis.send("LLEN", [key]).catch(() => null);
      const zcard = len == null ? await redis.send("ZCARD", [key]).catch(() => 0) : null;
      console.log(`  ${state}: ${len ?? zcard}`);
    }

    // Sample last 10 failed jobs — inspect error payloads
    const failedJobIds = (await redis.send("LRANGE", [`bull:${queueName}:failed`, "0", "9"])) as string[] | null;
    if (failedJobIds?.length) {
      console.log(`\n=== Last ${failedJobIds.length} failed jobs ===`);
      for (const jobId of failedJobIds) {
        const data = (await redis.send("HGETALL", [`bull:${queueName}:${jobId}`])) as Record<string, string>;
        console.log({
          jobId,
          name: data.name,
          failedReason: data.failedReason?.slice(0, 300),
          attemptsMade: data.attemptsMade,
          finishedOn: data.finishedOn ? new Date(Number(data.finishedOn)).toISOString() : null,
          data: data.data ? (JSON.parse(data.data)?.sessionId ?? JSON.parse(data.data)?.userId) : null,
        });
      }
    }

    // For each stuck session, show dedup state
    if (stuck.length > 0) {
      console.log(`\n=== Dedup keys for stuck sessions ===`);
      for (const s of stuck.slice(0, 5)) {
        const dedupKey = `bull:${queueName}:de:profile-from-qa-${s.id}`;
        const dedupJobId = await redis.get(dedupKey);
        console.log(`  ${s.id} -> dedup: ${dedupJobId ?? "(released)"}`);
      }
    }
  } finally {
    redis.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
