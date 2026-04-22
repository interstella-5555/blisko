import { extractOurS3Key } from "@repo/shared";
import { type Job, Queue, Worker } from "bullmq";
import { subDays } from "date-fns";
import { and, eq, inArray } from "drizzle-orm";
import ms from "ms";
import { db, schema } from "@/db";
import { publishEvent } from "@/ws/redis-bridge";
import { attachWorkerLogger, getConnectionConfig, QUEUE_NAMES } from "./queue-shared";
import { purgeUserQuarantine, s3Client } from "./s3";
import { restoreUser, softDeleteUser, suspendUser, unsuspendUser } from "./user-actions";

// --- Job types ---

interface HardDeleteUserJob {
  type: "hard-delete-user";
  userId: string;
}

interface ExportUserDataJob {
  type: "export-user-data";
  userId: string;
  email: string;
}

interface AdminSoftDeleteUserJob {
  type: "admin-soft-delete-user";
  userId: string;
}

interface AdminRestoreUserJob {
  type: "admin-restore-user";
  userId: string;
}

interface AdminForceDisconnectJob {
  type: "admin-force-disconnect";
  userId: string;
}

interface AdminRemoveFlaggedUploadJob {
  type: "admin-remove-flagged-upload";
  moderationResultId: string;
  reviewedBy: string;
  reviewNotes?: string;
}

interface AdminSuspendUserJob {
  type: "admin-suspend-user";
  userId: string;
  reason: string;
}

interface AdminUnsuspendUserJob {
  type: "admin-unsuspend-user";
  userId: string;
}

type OpsJob =
  | HardDeleteUserJob
  | ExportUserDataJob
  | AdminSoftDeleteUserJob
  | AdminRestoreUserJob
  | AdminForceDisconnectJob
  | AdminRemoveFlaggedUploadJob
  | AdminSuspendUserJob
  | AdminUnsuspendUserJob;

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

  // 2. Delete S3 files (current avatar + any quarantined prior avatars). Only our
  // s3:// sources — OAuth / seed URLs are never ours to delete (extractOurS3Key
  // returns null for any non-s3:// scheme). `portrait` is a text column (not a
  // URL) so extractOurS3Key also yields null for it — the loop stays tolerant.
  if (profile) {
    const keysToDelete: string[] = [];
    for (const url of [profile.avatarUrl, profile.portrait]) {
      const key = extractOurS3Key(url);
      if (key) keysToDelete.push(key);
    }
    for (const key of keysToDelete) {
      try {
        await s3Client.delete(key);
        console.log(`[queue:ops] deleted S3 key: ${key}`);
      } catch (err) {
        console.error(`[queue:ops] failed to delete S3 key ${key}:`, err);
      }
    }
  }

  // 2b. Purge the user's quarantine prefix. Tigris lifecycle purges after 90
  // days under normal operation; GDPR erasure must happen immediately.
  try {
    await purgeUserQuarantine(userId);
  } catch (err) {
    console.error(`[s3:quarantine] purge failed for ${userId}:`, err);
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
    await Promise.all([
      db.update(schema.requestEvents).set({ userId: null }).where(eq(schema.requestEvents.userId, userId)),
      db.update(schema.requestEvents).set({ targetUserId: null }).where(eq(schema.requestEvents.targetUserId, userId)),
      // Payloads hold bio / lookingFor / display name = PII. 24h retention usually
      // zeros them already, but hard-delete can't wait — nullify alongside user refs.
      db
        .update(schema.aiCalls)
        .set({ userId: null, inputJsonb: null, outputJsonb: null })
        .where(eq(schema.aiCalls.userId, userId)),
      db
        .update(schema.aiCalls)
        .set({ targetUserId: null, inputJsonb: null, outputJsonb: null })
        .where(eq(schema.aiCalls.targetUserId, userId)),
    ]);
  } catch (err) {
    console.error(`[queue:ops] failed to anonymize metrics for ${userId}:`, err);
  }

  console.log(`[queue:ops] anonymize-user completed for ${userId}`);
}

// --- Admin remove flagged upload processor ---

async function processAdminRemoveFlaggedUpload(moderationResultId: string, reviewedBy: string, reviewNotes?: string) {
  const row = await db.query.moderationResults.findFirst({
    where: eq(schema.moderationResults.id, moderationResultId),
    columns: { userId: true, uploadKey: true, status: true },
  });
  if (!row) {
    console.warn(`[queue:ops] admin-remove-flagged-upload: row ${moderationResultId} not found`);
    return;
  }
  if (row.status !== "flagged_review") {
    console.warn(`[queue:ops] admin-remove-flagged-upload: row ${moderationResultId} is ${row.status}, skipping`);
    return;
  }

  const key = extractOurS3Key(row.uploadKey);
  if (key) {
    try {
      await s3Client.delete(key);
    } catch (err) {
      // 404s are expected if the user already moved this avatar to quarantine
      // via a subsequent profile update; lifecycle still cleans it up.
      console.error(`[queue:ops] failed to delete flagged upload ${key}:`, err);
    }
  }

  // If the flagged image is still the user's current avatar, null it out so
  // the takedown takes effect in-app. We compare on the full `s3://` source
  // shape — both columns now use that format post-BLI-269.
  if (row.userId && row.uploadKey) {
    await db
      .update(schema.profiles)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(and(eq(schema.profiles.userId, row.userId), eq(schema.profiles.avatarUrl, row.uploadKey)));
  }

  await db
    .update(schema.moderationResults)
    .set({
      status: "reviewed_removed",
      reviewedAt: new Date(),
      reviewedBy,
      reviewDecision: "remove",
      reviewNotes: reviewNotes ?? null,
    })
    .where(eq(schema.moderationResults.id, moderationResultId));

  console.log(`[queue:ops] admin-remove-flagged-upload completed for ${moderationResultId}`);
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
      j.timestamp > subDays(new Date(), 7).getTime(),
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
    case "admin-remove-flagged-upload":
      await processAdminRemoveFlaggedUpload(data.moderationResultId, data.reviewedBy, data.reviewNotes);
      break;
    case "admin-suspend-user":
      await suspendUser(data.userId, data.reason);
      break;
    case "admin-unsuspend-user":
      await unsuspendUser(data.userId);
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

  attachWorkerLogger(_worker, QUEUE_NAMES.ops);

  // Extra failure handling for GDPR export (email notification on final failure)
  _worker.on("failed", (job, err) => {
    if (!job?.opts.attempts || job.attemptsMade < job.opts.attempts) return;

    const data = job.data as OpsJob;
    if (data.type === "export-user-data") {
      handleExportFailure(data.userId, data.email, job.id ?? "unknown", err.message).catch((e) => {
        console.error("[queue:ops] Failed to send export failure notifications:", e);
      });
    }
  });

  console.log("[queue:ops] Ops worker started");

  // One-time cleanup of the pre-BLI-171 "ai-jobs" queue:
  // 1. Rescue any delayed hard-delete-user jobs (they'd otherwise sit forever — no worker listens on ai-jobs anymore)
  // 2. Obliterate everything else: old failed/completed analyze-pair jobs and the flush/prune-push-log repeatable schedulers
  void (async () => {
    try {
      const legacyQueue = new Queue("ai-jobs", { connection: getConnectionConfig() });
      const delayedJobs = await legacyQueue.getJobs(["delayed"]);
      let migrated = 0;
      for (const job of delayedJobs) {
        if (job.data?.type === "hard-delete-user") {
          const remainingDelay = Math.max(0, job.timestamp + (job.opts.delay ?? 0) - Date.now());
          const opsQueue = getOpsQueue();
          await opsQueue.add("hard-delete-user", job.data, {
            jobId: job.id ?? undefined,
            delay: remainingDelay,
          });
          await job.remove();
          migrated++;
        }
      }
      if (migrated > 0) console.log(`[queue:ops] Migrated ${migrated} delayed hard-delete jobs from legacy queue`);

      const counts = await legacyQueue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
      const total = counts.waiting + counts.active + counts.delayed + counts.failed + counts.completed;
      if (total > 0) {
        await legacyQueue.obliterate({ force: true });
        console.log(`[queue:ops] Obliterated legacy ai-jobs queue (${JSON.stringify(counts)})`);
      }
      await legacyQueue.close();
    } catch (err) {
      console.error("[queue:ops] Legacy queue cleanup failed (non-critical):", err);
    }
  })();
}

// --- Enqueue functions ---

export async function enqueueHardDeleteUser(userId: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getOpsQueue();
  await queue.add(
    "hard-delete-user",
    { type: "hard-delete-user", userId },
    {
      jobId: `hard-delete-${userId}`,
      delay: ms("14 days"),
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
