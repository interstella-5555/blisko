import { describe, expect, it } from "vitest";
import { DECLINE_COOLDOWN_HOURS, PER_PERSON_COOLDOWN_HOURS } from "@/config/pingLimits";
import { computePingCooldown, remainingCooldownHours } from "@/lib/ping-quota";

const HOUR_MS = 3600000;
const NOW = Date.parse("2026-06-20T12:00:00.000Z");

describe("remainingCooldownHours", () => {
  it("rounds up partial hours so an active cooldown never shows 0h", () => {
    // Started 23h05m ago, 24h window → 0h55m left → rounds up to 1h.
    const startedAt = new Date(NOW - 23.1 * HOUR_MS);
    expect(remainingCooldownHours(startedAt, 24, NOW)).toBe(1);
  });

  it("returns 0 once the window has fully elapsed", () => {
    const startedAt = new Date(NOW - 25 * HOUR_MS);
    expect(remainingCooldownHours(startedAt, 24, NOW)).toBe(0);
  });

  it("returns the full duration for a just-started cooldown", () => {
    const startedAt = new Date(NOW);
    expect(remainingCooldownHours(startedAt, 24, NOW)).toBe(24);
  });
});

describe("computePingCooldown", () => {
  it("reports no cooldown when there are no recent waves", () => {
    expect(computePingCooldown({ lastSentAt: null, lastDeclinedAt: null }, NOW)).toEqual({
      hours: 0,
      reason: null,
    });
  });

  it("reports per_person when a wave was sent recently", () => {
    const lastSentAt = new Date(NOW - 2 * HOUR_MS);
    const result = computePingCooldown({ lastSentAt, lastDeclinedAt: null }, NOW);
    expect(result.reason).toBe("per_person");
    expect(result.hours).toBe(PER_PERSON_COOLDOWN_HOURS - 2);
  });

  it("reports cooldown (decline) when only a decline is in-window", () => {
    const lastDeclinedAt = new Date(NOW - 3 * HOUR_MS);
    const result = computePingCooldown({ lastSentAt: null, lastDeclinedAt }, NOW);
    expect(result.reason).toBe("cooldown");
    expect(result.hours).toBe(DECLINE_COOLDOWN_HOURS - 3);
  });

  it("per_person wins when both windows are active (it is the superset)", () => {
    // Same wave drives both: sent 5h ago AND declined 5h ago → equal remaining,
    // per_person takes precedence.
    const at = new Date(NOW - 5 * HOUR_MS);
    const result = computePingCooldown({ lastSentAt: at, lastDeclinedAt: at }, NOW);
    expect(result.reason).toBe("per_person");
    expect(result.hours).toBe(PER_PERSON_COOLDOWN_HOURS - 5);
  });

  it("reports no cooldown once both windows have elapsed", () => {
    const old = new Date(NOW - 48 * HOUR_MS);
    expect(computePingCooldown({ lastSentAt: old, lastDeclinedAt: old }, NOW)).toEqual({
      hours: 0,
      reason: null,
    });
  });
});
