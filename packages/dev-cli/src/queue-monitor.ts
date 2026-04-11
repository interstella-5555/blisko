/**
 * Live dashboard for the 3 BullMQ queues (ai, ops, maintenance).
 *
 * Shows queue counts (waiting, active, delayed, failed, completed),
 * recent completed jobs with wait/process/total times, averages by
 * job type, and active + waiting jobs with user pair names.
 *
 * Reads REDIS_URL from env or `apps/api/.env`. Refreshes every 2s.
 *
 * Run: `bun run dev-cli:queue-monitor`
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Queue } from "bullmq";

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

function pairLabel(data: Record<string, unknown> | undefined): string {
  if (data?.type !== "analyze-pair") return "";
  const a = (data.nameA as string) ?? (data.userAId as string)?.slice(0, 8) ?? "?";
  const b = (data.nameB as string) ?? (data.userBId as string)?.slice(0, 8) ?? "?";
  return `${a} → ${b}`;
}

// --- Main ---

const QUEUE_NAMES = ["ai", "ops", "maintenance"] as const;
const queues: Record<string, Queue> = Object.fromEntries(
  QUEUE_NAMES.map((name) => [name, new Queue(name, { connection: getConnectionConfig() })]),
);

async function renderQueue(name: string, queue: Queue): Promise<string[]> {
  const lines: string[] = [];

  const [waiting, active, delayed, failed, completed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getDelayedCount(),
    queue.getFailedCount(),
    queue.getCompletedCount(),
  ]);

  const completedJobs = await queue.getJobs(["completed"], 0, 29);
  completedJobs.sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));

  const totalPending = waiting + active + delayed;

  lines.push(`  Queue: ${name}`);
  lines.push(`  ${"─".repeat(60)}`);
  lines.push(
    `  Waiting: ${padLeft(String(waiting), 4)}    Active: ${padLeft(String(active), 3)}    Delayed: ${padLeft(String(delayed), 3)}    Failed: ${padLeft(String(failed), 3)}    Completed: ${padLeft(String(completed), 4)}    Pending: ${padLeft(String(totalPending), 4)}`,
  );

  // Recent completed (top 5 per queue to keep the dashboard compact with 3 queues)
  const recent = completedJobs.slice(0, 5);
  if (recent.length > 0) {
    lines.push(
      `  ${pad("Type", 22)} ${pad("Pair", 28)} ${padLeft("Wait", 8)} ${padLeft("Process", 8)} ${padLeft("Total", 8)}`,
    );
    for (const job of recent) {
      const waitMs = job.processedOn && job.timestamp ? job.processedOn - job.timestamp : 0;
      const processMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
      const totalMs = waitMs + processMs;
      const type = (job.data?.type ?? job.name ?? "?").slice(0, 21);
      const pair = pairLabel(job.data);
      lines.push(
        `  ${pad(type, 22)} ${pad(pair, 28)} ${padLeft(fmtDuration(waitMs), 8)} ${padLeft(fmtDuration(processMs), 8)} ${padLeft(fmtDuration(totalMs), 8)}`,
      );
    }
  }

  // Failed jobs (top 3)
  if (failed > 0) {
    const failedJobs = await queue.getJobs(["failed"], 0, 2);
    lines.push("  Failed:");
    for (const job of failedJobs) {
      const type = (job.data?.type ?? job.name ?? "?").slice(0, 21);
      const pair = pairLabel(job.data);
      const reason = (job.failedReason ?? "unknown").slice(0, 60);
      lines.push(`    ${pad(type, 22)} ${pad(pair || (job.id ?? "?").slice(0, 27), 28)} ${reason}`);
    }
  }

  // Active jobs
  if (active > 0) {
    const activeJobs = await queue.getJobs(["active"], 0, 4);
    lines.push("  Active:");
    for (const job of activeJobs) {
      const type = (job.data?.type ?? job.name ?? "?").slice(0, 21);
      const pair = pairLabel(job.data);
      const elapsed = job.processedOn ? Date.now() - job.processedOn : 0;
      lines.push(
        `    ${pad(type, 22)} ${pad(pair || (job.id ?? "?").slice(0, 27), 28)} running ${fmtDuration(elapsed)}`,
      );
    }
  }

  // Waiting jobs (next 5)
  if (waiting > 0) {
    const waitingJobs = await queue.getJobs(["waiting"], 0, 4);
    lines.push(`  Waiting (next ${waitingJobs.length} of ${waiting}):`);
    for (const job of waitingJobs) {
      const type = (job.data?.type ?? job.name ?? "?").slice(0, 21);
      const pair = pairLabel(job.data);
      const age = Date.now() - job.timestamp;
      lines.push(`    ${pad(type, 22)} ${pad(pair || (job.id ?? "?").slice(0, 27), 28)} queued ${fmtDuration(age)}`);
    }
  }

  return lines;
}

async function render() {
  const blocks = await Promise.all(QUEUE_NAMES.map((name) => renderQueue(name, queues[name])));

  const lines: string[] = [];
  lines.push("");
  for (const block of blocks) {
    lines.push(...block);
    lines.push("");
  }

  const now = new Date().toLocaleTimeString();
  lines.push(`  Last updated: ${now}  (refreshing every 2s, Ctrl+C to exit)`);
  lines.push("");

  process.stdout.write("\x1Bc");
  console.log(lines.join("\n"));
}

console.log("Connecting to Redis...");
render().then(() => {
  setInterval(render, 2000);
});
