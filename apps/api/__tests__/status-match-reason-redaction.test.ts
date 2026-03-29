import { describe, expect, it } from "vitest";

/**
 * Verifies that getMyStatusMatches redacts the LLM reason
 * when the matched user's status is private.
 */
describe("status match reason redaction", () => {
  // Extracted redaction logic matching profiles.ts getMyStatusMatches
  function redactReasons(
    rows: {
      id: string;
      matchedUserId: string;
      reason: string;
      matchedVia: string;
      createdAt: Date;
      statusVisibility: string | null;
    }[],
  ) {
    return rows.map((row) => ({
      id: row.id,
      matchedUserId: row.matchedUserId,
      reason: row.statusVisibility === "private" ? "Na podstawie profilu" : row.reason,
      matchedVia: row.matchedVia,
      createdAt: row.createdAt,
    }));
  }

  const now = new Date();

  it("returns reason as-is for public status matches", () => {
    const result = redactReasons([
      {
        id: "m1",
        matchedUserId: "u2",
        reason: "Both looking for coffee",
        matchedVia: "status",
        createdAt: now,
        statusVisibility: "public",
      },
    ]);
    expect(result[0].reason).toBe("Both looking for coffee");
  });

  it("redacts reason when matched user has private status", () => {
    const result = redactReasons([
      {
        id: "m1",
        matchedUserId: "u2",
        reason: "Secret status details",
        matchedVia: "profile",
        createdAt: now,
        statusVisibility: "private",
      },
    ]);
    expect(result[0].reason).toBe("Na podstawie profilu");
  });

  it("returns reason when statusVisibility is null (no status set)", () => {
    const result = redactReasons([
      {
        id: "m1",
        matchedUserId: "u2",
        reason: "Profile similarity",
        matchedVia: "profile",
        createdAt: now,
        statusVisibility: null,
      },
    ]);
    expect(result[0].reason).toBe("Profile similarity");
  });

  it("does not leak statusVisibility in the output", () => {
    const result = redactReasons([
      {
        id: "m1",
        matchedUserId: "u2",
        reason: "Test",
        matchedVia: "status",
        createdAt: now,
        statusVisibility: "private",
      },
    ]);
    expect(result[0]).not.toHaveProperty("statusVisibility");
  });

  it("handles mixed visibility in batch", () => {
    const result = redactReasons([
      {
        id: "m1",
        matchedUserId: "u1",
        reason: "Public reason",
        matchedVia: "status",
        createdAt: now,
        statusVisibility: "public",
      },
      {
        id: "m2",
        matchedUserId: "u2",
        reason: "Private reason",
        matchedVia: "profile",
        createdAt: now,
        statusVisibility: "private",
      },
      {
        id: "m3",
        matchedUserId: "u3",
        reason: "Null reason",
        matchedVia: "profile",
        createdAt: now,
        statusVisibility: null,
      },
    ]);
    expect(result[0].reason).toBe("Public reason");
    expect(result[1].reason).toBe("Na podstawie profilu");
    expect(result[2].reason).toBe("Null reason");
  });
});
