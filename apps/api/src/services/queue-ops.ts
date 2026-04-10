import { type Job, Queue, Worker } from "bullmq";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { publishEvent } from "@/ws/redis-bridge";
import { recordJobCompleted, recordJobFailed } from "./queue-metrics";
import { getConnectionConfig, QUEUE_NAMES } from "./queue-shared";
import { restoreUser, softDeleteUser } from "./user-actions";

// --- Job types ---

export interface HardDeleteUserJob {
  type: "hard-delete-user";
  userId: string;
}

export interface ExportUserDataJob {
  type: "export-user-data";
  userId: string;
  email: string;
}

export interface AdminSoftDeleteUserJob {
  type: "admin-soft-delete-user";
  userId: string;
}

export interface AdminRestoreUserJob {
  type: "admin-restore-user";
  userId: string;
}

export interface AdminForceDisconnectJob {
  type: "admin-force-disconnect";
  userId: string;
}

export type OpsJob =
  | HardDeleteUserJob
  | ExportUserDataJob
  | AdminSoftDeleteUserJob
  | AdminRestoreUserJob
  | AdminForceDisconnectJob;

// --- Queue (lazy init) ---

let _queue: Queue | null = null;

export function getOpsQueueInstance(): Queue | null {
  return _queue;
}

function getOpsQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAMES.ops, {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        removeOnComplete: { count: 200, age: 3600 },
        removeOnFail: { age: 7_776_000 },
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return _queue!;
}

// --- Hard delete processor ---

async function processHardDeleteUser(userId: string) {
  console.log(`[queue:ops] anonymize-user starting for ${userId}`);

  // Skip if already anonymized
  const userData = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { anonymizedAt: true },
  });
  if (userData?.anonymizedAt) {
    console.log(`[queue:ops] user ${userId} already anonymized, skipping`);
    return;
  }

  // 1. Get S3 file keys from profile before overwriting
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    columns: { avatarUrl: true, portrait: true },
  });

  // 2. Delete S3 files (avatar, portrait)
  if (profile) {
    const keysToDelete: string[] = [];
    for (const url of [profile.avatarUrl, profile.portrait]) {
      if (url) {
        const match = url.match(/uploads\/[^?]+/);
        if (match) keysToDelete.push(match[0]);
      }
    }
    if (keysToDelete.length > 0) {
      const { S3Client } = await import("bun");
      const s3 = new S3Client({
        accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
        secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
        endpoint: process.env.BUCKET_ENDPOINT!,
        bucket: process.env.BUCKET_NAME!,
      });
      for (const key of keysToDelete) {
        try {
          await s3.delete(key);
          console.log(`[queue:ops] deleted S3 key: ${key}`);
        } catch (err) {
          console.error(`[queue:ops] failed to delete S3 key ${key}:`, err);
        }
      }
    }
  }

  const now = new Date();
  const anonymizedEmail = `${crypto.randomUUID()}@deleted.localhost`;

  // 3. Anonymize user + profile + profiling data in a transaction
  await db.transaction(async (tx) => {
    await tx
      .update(schema.user)
      .set({
        name: "Usunięty użytkownik",
        email: anonymizedEmail,
        emailVerified: false,
        image: null,
        updatedAt: now,
        anonymizedAt: now,
      })
      .where(eq(schema.user.id, userId));

    await tx
      .update(schema.profiles)
      .set({
        displayName: "Usunięty użytkownik",
        avatarUrl: null,
        bio: "",
        lookingFor: "",
        socialLinks: null,
        visibilityMode: "ninja",
        interests: null,
        embedding: null,
        portrait: null,
        portraitSharedForMatching: false,
        isComplete: false,
        currentStatus: null,
        statusExpiresAt: null,
        statusEmbedding: null,
        statusSetAt: null,
        statusVisibility: "public",
        statusCategories: null,
        dateOfBirth: null,
        superpower: null,
        superpowerTags: null,
        offerType: null,
        doNotDisturb: false,
        latitude: null,
        longitude: null,
        lastLocationUpdate: null,
        updatedAt: now,
      })
      .where(eq(schema.profiles.userId, userId));

    await tx
      .update(schema.profilingSessions)
      .set({ generatedBio: null, generatedLookingFor: null, generatedPortrait: null })
      .where(eq(schema.profilingSessions.userId, userId));

    const sessionIds = await tx
      .select({ id: schema.profilingSessions.id })
      .from(schema.profilingSessions)
      .where(eq(schema.profilingSessions.userId, userId));

    if (sessionIds.length > 0) {
      await tx
        .update(schema.profilingQA)
        .set({ answer: null })
        .where(
          inArray(
            schema.profilingQA.sessionId,
            sessionIds.map((s) => s.id),
          ),
        );
    }
  });

  // 4. Anonymize metrics (outside transaction — separate schema, non-critical)
  try {
    await db.update(schema.requestEvents).set({ userId: null }).where(eq(schema.requestEvents.userId, userId));
    await db
      .update(schema.requestEvents)
      .set({ targetUserId: null })
      .where(eq(schema.requestEvents.targetUserId, userId));
  } catch (err) {
    console.error(`[queue:ops] failed to anonymize metrics for ${userId}:`, err);
  }

  console.log(`[queue:ops] anonymize-user completed for ${userId}`);
}

// --- Export user data processor ---

async function processExportUserData(userId: string, email: string) {
  console.log(`[queue:ops] export-user-data starting for ${userId}`);
  const { collectAndExportUserData } = await import("./data-export");
  await collectAndExportUserData(userId, email);
  console.log(`[queue:ops] export-user-data completed for ${userId}`);
}

async function handleExportFailure(userId: string, userEmail: string, jobId: string, errorMessage: string) {
  const { sendEmail, dataExportDelayed } = await import("./email");

  // Send delay email only if no other failed export for this user in the last 7 days
  const queue = getOpsQueue();
  const failedJobs = await queue.getJobs(["failed"]);
  const priorFailed = failedJobs.some(
    (j) =>
      j.data.type === "export-user-data" &&
      j.data.userId === userId &&
      j.id !== jobId &&
      j.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000,
  );
  if (!priorFailed) {
    await sendEmail(userEmail, dataExportDelayed());
  }

  // TODO(BLI-169): Add proper admin alerting (Sentry, Discord webhook, etc.)
  console.error(
    `[queue:ops] GDPR EXPORT FAILED — userId: ${userId}, email: ${userEmail}, job: ${jobId}, error: ${errorMessage}`,
  );
}

// --- Main ops job processor ---

async function processOpsJob(job: Job<OpsJob>) {
  const data = job.data;
  const queueWait = job.processedOn ? job.processedOn - job.timestamp : 0;
  console.log(`[queue:ops] processing ${data.type} | jobId: ${job.id} | wait: ${(queueWait / 1000).toFixed(1)}s`);

  switch (data.type) {
    case "hard-delete-user":
      await processHardDeleteUser(data.userId);
      break;
    case "export-user-data":
      await processExportUserData(data.userId, data.email);
      break;
    case "admin-soft-delete-user":
      await softDeleteUser(data.userId);
      break;
    case "admin-restore-user":
      await restoreUser(data.userId);
      break;
    case "admin-force-disconnect":
      publishEvent("forceDisconnect", { userId: data.userId });
      break;
  }
}

// --- Worker ---

let _worker: Worker | null = null;

export function startOpsWorker() {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL not set, skipping ops queue worker");
    return;
  }

  _worker = new Worker(QUEUE_NAMES.ops, processOpsJob, {
    connection: getConnectionConfig(),
    concurrency: 10,
  });

  _worker.on("completed", (job) => {
    const durationMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    recordJobCompleted(QUEUE_NAMES.ops, durationMs);
    console.log(`[queue:ops] Job ${job.id} completed (${job.data.type}) ${durationMs}ms`);
  });

  _worker.on("failed", (job, err) => {
    recordJobFailed(QUEUE_NAMES.ops);
    console.error(`[queue:ops] Job ${job?.id} failed:`, err.message);

    if (!job || !job.opts.attempts || job.attemptsMade < job.opts.attempts) return;

    const data = job.data as OpsJob;
    if (data.type === "export-user-data") {
      handleExportFailure(data.userId, data.email, job.id ?? "unknown", err.message).catch((e) => {
        console.error("[queue:ops] Failed to send export failure notifications:", e);
      });
    }
  });

  console.log("[queue:ops] Ops worker started");
}

// --- Enqueue functions ---

export async function enqueueHardDeleteUser(userId: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getOpsQueue();
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  await queue.add(
    "hard-delete-user",
    { type: "hard-delete-user", userId },
    {
      jobId: `hard-delete-${userId}`,
      delay: FOURTEEN_DAYS_MS,
    },
  );
}

export async function cancelHardDeleteUser(userId: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getOpsQueue();
  const job = await queue.getJob(`hard-delete-${userId}`);
  if (job) {
    try {
      await job.remove();
    } catch {
      /* job may have already run */
    }
  }
}

export async function enqueueDataExport(userId: string, email: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getOpsQueue();
  await queue.add(
    "export-user-data",
    { type: "export-user-data", userId, email },
    {
      jobId: `export-${userId}-${Date.now()}`,
      // GDPR-critical: aggressive retry (10 attempts over ~8.5h), never auto-remove failures
      attempts: 10,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnFail: false,
    },
  );
}
