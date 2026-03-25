import { describe, expect, it } from "vitest";
import { quickScoreSchema } from "../src/services/ai";

describe("quickScoreSchema", () => {
  it("parses valid scores", () => {
    const result = quickScoreSchema.safeParse({ scoreForA: 75, scoreForB: 42 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ scoreForA: 75, scoreForB: 42 });
  });

  it("accepts boundary values 0 and 100", () => {
    expect(quickScoreSchema.safeParse({ scoreForA: 0, scoreForB: 100 }).success).toBe(true);
    expect(quickScoreSchema.safeParse({ scoreForA: 100, scoreForB: 0 }).success).toBe(true);
  });

  it("rejects scores below 0", () => {
    expect(quickScoreSchema.safeParse({ scoreForA: -1, scoreForB: 50 }).success).toBe(false);
  });

  it("rejects scores above 100", () => {
    expect(quickScoreSchema.safeParse({ scoreForA: 50, scoreForB: 101 }).success).toBe(false);
  });

  it("rejects non-integer scores", () => {
    expect(quickScoreSchema.safeParse({ scoreForA: 50.5, scoreForB: 75 }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(quickScoreSchema.safeParse({ scoreForA: 50 }).success).toBe(false);
    expect(quickScoreSchema.safeParse({ scoreForB: 50 }).success).toBe(false);
    expect(quickScoreSchema.safeParse({}).success).toBe(false);
  });
});
