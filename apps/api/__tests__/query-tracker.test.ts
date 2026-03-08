import { describe, expect, it } from "vitest";
import { createQueryContext, getQueryStats, queryTracker, recordQuery } from "../src/services/query-tracker";

describe("query-tracker", () => {
  it("tracks query count and duration within ALS context", async () => {
    const ctx = createQueryContext();

    await queryTracker.run(ctx, async () => {
      recordQuery(10);
      recordQuery(25);
      recordQuery(5);

      const stats = getQueryStats();
      expect(stats).not.toBeNull();
      expect(stats!.queryCount).toBe(3);
      expect(stats!.dbDurationMs).toBe(40);
    });
  });

  it("returns null outside ALS context", () => {
    const stats = getQueryStats();
    expect(stats).toBeNull();
  });

  it("does not leak between contexts", async () => {
    const ctx1 = createQueryContext();
    const ctx2 = createQueryContext();

    await Promise.all([
      queryTracker.run(ctx1, async () => {
        recordQuery(100);
        await new Promise((r) => setTimeout(r, 10));
        expect(ctx1.queryCount).toBe(1);
      }),
      queryTracker.run(ctx2, async () => {
        recordQuery(50);
        recordQuery(50);
        await new Promise((r) => setTimeout(r, 10));
        expect(ctx2.queryCount).toBe(2);
      }),
    ]);

    expect(ctx1.queryCount).toBe(1);
    expect(ctx2.queryCount).toBe(2);
  });
});
