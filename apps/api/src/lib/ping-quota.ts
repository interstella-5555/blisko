import { DECLINE_COOLDOWN_HOURS, PER_PERSON_COOLDOWN_HOURS } from "@/config/pingLimits";

const HOUR_MS = 3600000;

/**
 * Remaining whole hours of a cooldown given the timestamp it started and its
 * total duration. Returns 0 once the window has elapsed. Rounds up so the UI
 * never shows "0h" while the cooldown is still technically active (matches the
 * `Math.ceil` the send-path errors already use).
 */
export function remainingCooldownHours(startedAt: Date, durationHours: number, now: number = Date.now()): number {
  const remainingMs = startedAt.getTime() + durationHours * HOUR_MS - now;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / HOUR_MS);
}

type PingTargetWaves = {
  /** createdAt of the most recent wave (any status) to the target within the per-person window, or null. */
  lastSentAt: Date | null;
  /** respondedAt of the most recent declined wave to the target within the decline window, or null. */
  lastDeclinedAt: Date | null;
};

export type PingCooldown = {
  /** Whole hours until the target can be pinged again. 0 means no cooldown. */
  hours: number;
  /** Which rule is currently blocking, or null when `hours` is 0. */
  reason: "per_person" | "cooldown" | null;
};

/**
 * Computes the active ping cooldown for a single target, mirroring the
 * per-person + decline checks in `waves.send`. The send path is the source of
 * truth (it re-validates on insert); this is the pre-check that lets the client
 * grey out the PING button instead of failing after a round-trip.
 */
export function computePingCooldown(waves: PingTargetWaves, now: number = Date.now()): PingCooldown {
  const perPersonHours = waves.lastSentAt
    ? remainingCooldownHours(waves.lastSentAt, PER_PERSON_COOLDOWN_HOURS, now)
    : 0;
  const declineHours = waves.lastDeclinedAt
    ? remainingCooldownHours(waves.lastDeclinedAt, DECLINE_COOLDOWN_HOURS, now)
    : 0;

  if (perPersonHours === 0 && declineHours === 0) {
    return { hours: 0, reason: null };
  }
  // Per-person fires on any prior wave to this person; decline is a subset of
  // that, so per-person takes precedence when both are active.
  if (perPersonHours >= declineHours) {
    return { hours: perPersonHours, reason: "per_person" };
  }
  return { hours: declineHours, reason: "cooldown" };
}
