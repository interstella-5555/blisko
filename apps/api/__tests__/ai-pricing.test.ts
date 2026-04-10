import { describe, expect, it } from "vitest";
import { estimateCostUsd, PRICING } from "../src/services/ai-pricing";

describe("ai-pricing", () => {
  it("returns 0 for unknown model", () => {
    expect(estimateCostUsd("unknown-model", 1000, 500)).toBe(0);
  });

  it("gpt-4.1-mini: input 1M tokens costs $0.40", () => {
    expect(estimateCostUsd("gpt-4.1-mini", 1_000_000, 0)).toBeCloseTo(0.4, 6);
  });

  it("gpt-4.1-mini: output 1M tokens costs $1.60", () => {
    expect(estimateCostUsd("gpt-4.1-mini", 0, 1_000_000)).toBeCloseTo(1.6, 6);
  });

  it("gpt-4.1-mini: mixed tokens sum correctly", () => {
    const expected = (1200 / 1_000_000) * 0.4 + (30 / 1_000_000) * 1.6;
    expect(estimateCostUsd("gpt-4.1-mini", 1200, 30)).toBeCloseTo(expected, 9);
  });

  it("text-embedding-3-small: input-only pricing", () => {
    expect(estimateCostUsd("text-embedding-3-small", 1_000_000, 0)).toBeCloseTo(0.02, 6);
    expect(estimateCostUsd("text-embedding-3-small", 1_000_000, 999)).toBeCloseTo(0.02, 6);
  });

  it("handles zero inputs without NaN", () => {
    expect(estimateCostUsd("gpt-4.1-mini", 0, 0)).toBe(0);
  });

  it("PRICING map covers the models used in the app", () => {
    expect(PRICING["gpt-4.1-mini"]).toBeDefined();
    expect(PRICING["text-embedding-3-small"]).toBeDefined();
  });
});
