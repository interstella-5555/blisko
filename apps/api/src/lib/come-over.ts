import { COME_OVER_MAX_DISTANCE_METERS } from "@repo/shared";

/**
 * "Podejdę osobiście" come-over gating (BLI-298, v4 §10.3).
 *
 * Pure helpers so the eligibility gate can be unit-tested without a DB. The gate
 * is a physical-safety surface — it nudges a user toward a specific stranger's
 * live location — so it is enforced server-side on BOTH the eligibility query and
 * the come-over mutation, not just hidden in the client UI.
 */

export interface ComeOverActor {
  visibilityMode: "ninja" | "semi_open" | "full_nomad";
  latitude: number | null;
  longitude: number | null;
}

export interface ComeOverPeerLocation {
  latitude: number | null;
  longitude: number | null;
}

/** Great-circle distance in meters between two coordinates. */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface ComeOverEligibility {
  /** True only when the actor is Full Nomad AND the peer is within range. */
  eligible: boolean;
  /** Live distance in meters, or null if either side has no location. */
  distance: number | null;
}

/**
 * Compute come-over eligibility from the actor's profile + the peer's live
 * location. Eligible requires Full Nomad visibility AND a live distance under
 * `COME_OVER_MAX_DISTANCE_METERS`. Missing coordinates on either side → not eligible.
 */
export function computeComeOverEligibility(actor: ComeOverActor, peer: ComeOverPeerLocation): ComeOverEligibility {
  if (actor.latitude == null || actor.longitude == null || peer.latitude == null || peer.longitude == null) {
    return { eligible: false, distance: null };
  }

  const distance = Math.round(haversineMeters(actor.latitude, actor.longitude, peer.latitude, peer.longitude));
  const eligible = actor.visibilityMode === "full_nomad" && distance < COME_OVER_MAX_DISTANCE_METERS;

  return { eligible, distance };
}
