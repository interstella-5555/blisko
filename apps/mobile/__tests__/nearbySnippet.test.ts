import { describe, expect, test } from "vitest";
import { getNearbySnippet } from "../src/lib/nearbySnippet";

describe("getNearbySnippet", () => {
  test("prefers active status over everything", () => {
    expect(getNearbySnippet("Szukam kogoś na rower", "Lubię kawę.", "Pełne bio.")).toEqual({
      text: "Szukam kogoś na rower",
      isHighlight: true,
    });
  });

  test("falls back to bio essence when there is no status", () => {
    expect(getNearbySnippet(null, "Lubię kawę i planszówki.", "Pełne, długie bio...")).toEqual({
      text: "Lubię kawę i planszówki.",
      isHighlight: true,
    });
  });

  test("falls back to raw bio (muted) when there is no status or essence", () => {
    expect(getNearbySnippet(null, null, "Analizuję dane, wieczorami planszówki.")).toEqual({
      text: "Analizuję dane, wieczorami planszówki.",
      isHighlight: false,
    });
  });

  test("returns null text when nothing is available", () => {
    expect(getNearbySnippet(null, null, null)).toEqual({ text: null, isHighlight: false });
  });

  test("treats whitespace-only values as empty and skips them", () => {
    expect(getNearbySnippet("   ", "  ", "Realne bio.")).toEqual({ text: "Realne bio.", isHighlight: false });
  });

  test("treats undefined the same as null", () => {
    expect(getNearbySnippet(undefined, undefined, "Bio.")).toEqual({ text: "Bio.", isHighlight: false });
  });
});
