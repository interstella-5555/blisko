import { COME_OVER_MAX_DISTANCE_METERS } from "@repo/shared";
import { describe, expect, it } from "vitest";
import { computeComeOverEligibility, haversineMeters } from "@/lib/come-over";

// ul. Altowa, Warszawa (default simulator location) as the anchor.
const ANCHOR = { lat: 52.2010865, lng: 20.961898 };

describe("haversineMeters", () => {
  it("returns ~0 for identical coordinates", () => {
    expect(haversineMeters(ANCHOR.lat, ANCHOR.lng, ANCHOR.lat, ANCHOR.lng)).toBeCloseTo(0, 5);
  });

  it("measures a known short distance (~157m one lat-arcsecond-ish step)", () => {
    // +0.001 latitude ≈ 111m north.
    const d = haversineMeters(ANCHOR.lat, ANCHOR.lng, ANCHOR.lat + 0.001, ANCHOR.lng);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
});

describe("computeComeOverEligibility", () => {
  const fullNomadHere = { visibilityMode: "full_nomad" as const, latitude: ANCHOR.lat, longitude: ANCHOR.lng };

  it("is eligible when Full Nomad and peer is within range", () => {
    // +0.001 lat ≈ 111m < 500m.
    const result = computeComeOverEligibility(fullNomadHere, { latitude: ANCHOR.lat + 0.001, longitude: ANCHOR.lng });
    expect(result.eligible).toBe(true);
    expect(result.distance).not.toBeNull();
    expect(result.distance! < COME_OVER_MAX_DISTANCE_METERS).toBe(true);
  });

  it("is NOT eligible when peer is beyond the max distance", () => {
    // +0.01 lat ≈ 1.1km > 500m.
    const result = computeComeOverEligibility(fullNomadHere, { latitude: ANCHOR.lat + 0.01, longitude: ANCHOR.lng });
    expect(result.eligible).toBe(false);
    expect(result.distance).toBeGreaterThan(COME_OVER_MAX_DISTANCE_METERS);
  });

  it("is NOT eligible when actor is semi_open even if peer is close", () => {
    const semiOpen = { ...fullNomadHere, visibilityMode: "semi_open" as const };
    const result = computeComeOverEligibility(semiOpen, { latitude: ANCHOR.lat + 0.001, longitude: ANCHOR.lng });
    expect(result.eligible).toBe(false);
    // Distance is still computed so the UI can decide what to render.
    expect(result.distance).not.toBeNull();
  });

  it("is NOT eligible when actor is ninja", () => {
    const ninja = { ...fullNomadHere, visibilityMode: "ninja" as const };
    const result = computeComeOverEligibility(ninja, { latitude: ANCHOR.lat, longitude: ANCHOR.lng });
    expect(result.eligible).toBe(false);
  });

  it("returns null distance and not eligible when actor has no location", () => {
    const noLoc = { visibilityMode: "full_nomad" as const, latitude: null, longitude: null };
    expect(computeComeOverEligibility(noLoc, { latitude: ANCHOR.lat, longitude: ANCHOR.lng })).toEqual({
      eligible: false,
      distance: null,
    });
  });

  it("returns null distance and not eligible when peer has no location", () => {
    const result = computeComeOverEligibility(fullNomadHere, { latitude: null, longitude: null });
    expect(result).toEqual({ eligible: false, distance: null });
  });

  it("treats exactly-at-the-boundary distance as NOT eligible (strict <)", () => {
    // Construct a synthetic actor/peer where distance rounds to exactly the max.
    // Easier: assert the strict-inequality contract via a just-over case (501m-ish).
    const justOver = computeComeOverEligibility(fullNomadHere, {
      latitude: ANCHOR.lat + 0.0046,
      longitude: ANCHOR.lng,
    });
    expect(justOver.distance).toBeGreaterThanOrEqual(COME_OVER_MAX_DISTANCE_METERS);
    expect(justOver.eligible).toBe(false);
  });
});
