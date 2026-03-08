import { bullmqJobDuration, bullmqJobsTotal } from "./prometheus";

interface QueueStats {
  completed: number;
  failed: number;
  durations: number[];
}

const stats = new Map<string, QueueStats>();

function getOrCreate(name: string): QueueStats {
  let s = stats.get(name);
  if (!s) {
    s = { completed: 0, failed: 0, durations: [] };
    stats.set(name, s);
  }
  return s;
}

const MAX_DURATIONS = 1000;

export function recordJobCompleted(queueName: string, durationMs: number): void {
  const s = getOrCreate(queueName);
  s.completed++;
  s.durations.push(durationMs);
  if (s.durations.length > MAX_DURATIONS) {
    s.durations.splice(0, s.durations.length - MAX_DURATIONS);
  }
  bullmqJobsTotal.inc({ queue: queueName, status: "completed" });
  bullmqJobDuration.observe({ queue: queueName }, durationMs);
}

export function recordJobFailed(queueName: string): void {
  getOrCreate(queueName).failed++;
  bullmqJobsTotal.inc({ queue: queueName, status: "failed" });
}

export function getQueueStats(): Map<string, QueueStats> {
  return stats;
}

export function percentile(arr: number[], pct: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(pct * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
