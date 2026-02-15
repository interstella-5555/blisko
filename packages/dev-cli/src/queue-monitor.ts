import { Queue, type Job } from "bullmq";
import { readFileSync } from "fs";
import { resolve } from "path";

// --- Redis connection ---

function getRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;

  // Try reading from API .env
  try {
    const envPath = resolve(import.meta.dir, "../../../apps/api/.env");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/^REDIS_URL=(.+)$/m);
    if (match) return match[1].trim();
  } catch {}

  console.error("REDIS_URL not found. Set it or ensure apps/api/.env exists.");
  process.exit(1);
}

function getConnectionConfig() {
  const url = new URL(getRedisUrl());
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

// --- Formatting helpers ---

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;
}

function pairLabel(data: any): string {
  if (data?.type !== "analyze-pair") return "";
  const a = data.nameA ?? data.userAId?.slice(0, 8) ?? "?";
  const b = data.nameB ?? data.userBId?.slice(0, 8) ?? "?";
  return `${a} → ${b}`;
}

// --- Main ---

const queue = new Queue("ai-jobs", { connection: getConnectionConfig() });

async function render() {
  const [waiting, active, delayed, failed, completed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getDelayedCount(),
    queue.getFailedCount(),
    queue.getCompletedCount(),
  ]);

  // Fetch recent completed jobs for timing data
  const completedJobs = await queue.getJobs(["completed"], 0, 99);
  const failedJobs = await queue.getJobs(["failed"], 0, 19);

  // Sort by finishedOn descending
  completedJobs.sort(
    (a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0)
  );

  // --- Build output ---
  const lines: string[] = [];

  const totalPending = waiting + active + delayed;

  lines.push("");
  lines.push("  Queue: ai-jobs");
  lines.push("  " + "─".repeat(60));
  lines.push(
    `  Waiting: ${padLeft(String(waiting), 4)}    Active: ${padLeft(String(active), 3)}    Delayed: ${padLeft(String(delayed), 3)}    Failed: ${padLeft(String(failed), 3)}`
  );
  lines.push(
    `  Completed: ${padLeft(String(completed), 4)}    Total pending: ${padLeft(String(totalPending), 4)}    Rate limit: 20/min`
  );
  lines.push("");

  // --- Recent jobs ---
  lines.push("  Recent Jobs (last 20 completed)");
  lines.push("  " + "─".repeat(100));
  lines.push(
    `  ${pad("Type", 18)} ${pad("Pair", 28)} ${pad("For", 12)} ${padLeft("Wait", 8)} ${padLeft("Process", 8)} ${padLeft("Total", 8)}  St`
  );

  const recent = completedJobs.slice(0, 20);
  for (const job of recent) {
    const waitMs =
      job.processedOn && job.timestamp ? job.processedOn - job.timestamp : 0;
    const processMs =
      job.finishedOn && job.processedOn
        ? job.finishedOn - job.processedOn
        : 0;
    const totalMs = waitMs + processMs;

    const type = (job.data?.type ?? "?").slice(0, 17);
    const pair = pairLabel(job.data);
    const reqBy = (job.data?.requestedBy ?? "").slice(0, 11);

    lines.push(
      `  ${pad(type, 18)} ${pad(pair, 28)} ${pad(reqBy, 12)} ${padLeft(fmtDuration(waitMs), 8)} ${padLeft(fmtDuration(processMs), 8)} ${padLeft(fmtDuration(totalMs), 8)}  ✓`
    );
  }

  if (recent.length === 0) {
    lines.push("  (none)");
  }

  // --- Recent failed ---
  if (failedJobs.length > 0) {
    lines.push("");
    lines.push(`  Recent Failed (${failedJobs.length})`);
    lines.push("  " + "─".repeat(60));
    for (const job of failedJobs.slice(0, 5)) {
      const type = (job.data?.type ?? "?").slice(0, 17);
      const pair = pairLabel(job.data);
      const reason = (job.failedReason ?? "unknown").slice(0, 50);
      lines.push(`  ${pad(type, 18)} ${pad(pair || (job.id ?? "?").slice(0, 27), 28)} ${reason}`);
    }
  }

  // --- Averages by type ---
  lines.push("");
  lines.push("  Averages (from completed jobs in Redis)");
  lines.push("  " + "─".repeat(60));

  const byType = new Map<
    string,
    { waits: number[]; processes: number[]; totals: number[] }
  >();

  for (const job of completedJobs) {
    const type = job.data?.type ?? "unknown";
    if (!byType.has(type))
      byType.set(type, { waits: [], processes: [], totals: [] });
    const bucket = byType.get(type)!;

    const waitMs =
      job.processedOn && job.timestamp ? job.processedOn - job.timestamp : 0;
    const processMs =
      job.finishedOn && job.processedOn
        ? job.finishedOn - job.processedOn
        : 0;

    bucket.waits.push(waitMs);
    bucket.processes.push(processMs);
    bucket.totals.push(waitMs + processMs);
  }

  for (const [type, bucket] of byType) {
    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const n = bucket.waits.length;
    lines.push(
      `  ${pad(type + ":", 28)} avg wait ${padLeft(fmtDuration(avg(bucket.waits)), 8)}   avg process ${padLeft(fmtDuration(avg(bucket.processes)), 8)}   avg total ${padLeft(fmtDuration(avg(bucket.totals)), 8)}   (${n} jobs)`
    );
  }

  if (byType.size === 0) {
    lines.push("  (no completed jobs yet)");
  }

  // --- Active jobs detail ---
  if (active > 0) {
    const activeJobs = await queue.getJobs(["active"], 0, 9);
    lines.push("");
    lines.push(`  Active Jobs (${active})`);
    lines.push("  " + "─".repeat(60));
    for (const job of activeJobs) {
      const type = (job.data?.type ?? "?").slice(0, 17);
      const pair = pairLabel(job.data);
      const reqBy = (job.data?.requestedBy ?? "").slice(0, 11);
      const elapsed = job.processedOn ? Date.now() - job.processedOn : 0;
      lines.push(
        `  ${pad(type, 18)} ${pad(pair || (job.id ?? "?").slice(0, 27), 28)} ${pad(reqBy, 12)} running ${fmtDuration(elapsed)}`
      );
    }
  }

  // --- Waiting jobs (next in queue) ---
  if (waiting > 0) {
    const waitingJobs = await queue.getJobs(["waiting"], 0, 14);
    lines.push("");
    lines.push(`  Waiting Jobs (showing ${Math.min(waitingJobs.length, 15)} of ${waiting})`);
    lines.push("  " + "─".repeat(60));
    for (const job of waitingJobs) {
      const type = (job.data?.type ?? "?").slice(0, 17);
      const pair = pairLabel(job.data);
      const reqBy = (job.data?.requestedBy ?? "").slice(0, 11);
      const age = Date.now() - job.timestamp;
      lines.push(
        `  ${pad(type, 18)} ${pad(pair || (job.id ?? "?").slice(0, 27), 28)} ${pad(reqBy, 12)} queued ${fmtDuration(age)}`
      );
    }
  }

  const now = new Date().toLocaleTimeString();
  lines.push("");
  lines.push(`  Last updated: ${now}  (refreshing every 2s, Ctrl+C to exit)`);
  lines.push("");

  // Clear and draw
  process.stdout.write("\x1Bc");
  console.log(lines.join("\n"));
}

console.log("Connecting to Redis...");
render().then(() => {
  setInterval(render, 2000);
});
