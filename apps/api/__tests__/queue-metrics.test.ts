import { describe, expect, it } from "vitest";
import { getQueueStats, percentile, recordJobCompleted, recordJobFailed } from "../src/services/queue-metrics";

describe("queue-metrics", () => {
  it("records completed jobs with duration", () => {
    recordJobCompleted("test-queue", 100);
    recordJobCompleted("test-queue", 200);
    recordJobCompleted("test-queue", 300);

    const stats = getQueueStats().get("test-queue");
    expect(stats).toBeDefined();
    expect(stats!.completed).toBeGreaterThanOrEqual(3);
    expect(stats!.durations).toContain(100);
    expect(stats!.durations).toContain(200);
    expect(stats!.durations).toContain(300);
  });

  it("records failed jobs", () => {
    recordJobFailed("fail-queue");
    recordJobFailed("fail-queue");

    const stats = getQueueStats().get("fail-queue");
    expect(stats).toBeDefined();
    expect(stats!.failed).toBeGreaterThanOrEqual(2);
  });

  it("calculates percentiles correctly", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(100);
    expect(percentile([], 0.5)).toBe(0);
  });
});
