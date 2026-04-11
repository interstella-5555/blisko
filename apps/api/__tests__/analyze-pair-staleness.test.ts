import { describe, expect, it } from "vitest";
import { isPairAnalysisUpToDate } from "../src/services/queue";

describe("isPairAnalysisUpToDate", () => {
  const hashA = "aaaaaaaa";
  const hashB = "bbbbbbbb";

  it("returns false when no existing row", () => {
    expect(isPairAnalysisUpToDate(null, hashA, hashB)).toBe(false);
    expect(isPairAnalysisUpToDate(undefined, hashA, hashB)).toBe(false);
  });

  // Regression guard for BLI-194: T2 row with matching hashes used to be
  // treated as "up to date", which blocked T3 promotion after BLI-184/185
  // started persisting T2 rows with current hashes.
  it("returns false when existing row is tier=t2 even with matching hashes", () => {
    expect(isPairAnalysisUpToDate({ tier: "t2", fromProfileHash: hashA, toProfileHash: hashB }, hashA, hashB)).toBe(
      false,
    );
  });

  it("returns true when tier=t3 and both hashes match", () => {
    expect(isPairAnalysisUpToDate({ tier: "t3", fromProfileHash: hashA, toProfileHash: hashB }, hashA, hashB)).toBe(
      true,
    );
  });

  it("returns false when tier=t3 but fromProfileHash stale", () => {
    expect(isPairAnalysisUpToDate({ tier: "t3", fromProfileHash: "stale", toProfileHash: hashB }, hashA, hashB)).toBe(
      false,
    );
  });

  it("returns false when tier=t3 but toProfileHash stale", () => {
    expect(isPairAnalysisUpToDate({ tier: "t3", fromProfileHash: hashA, toProfileHash: "stale" }, hashA, hashB)).toBe(
      false,
    );
  });

  it("returns false when tier=t3 but hashes are null (legacy row)", () => {
    expect(isPairAnalysisUpToDate({ tier: "t3", fromProfileHash: null, toProfileHash: null }, hashA, hashB)).toBe(
      false,
    );
  });
});
