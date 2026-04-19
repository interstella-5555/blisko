import { describe, expect, it } from "vitest";

// These tests mirror the pure logic of `processEvaluateStatusMatch` and the
// parent fan-out payload construction in queue.ts. We use local helpers with
// the same shape as the prod code — same pattern as proximity-status-matching.test.ts.

type InsertMode = "unidirectional" | "bidirectional";

function buildMatchRows(
  insertMode: InsertMode,
  userId: string,
  candidateUserId: string,
  reason: string,
  matchedVia: "status" | "profile",
) {
  return insertMode === "bidirectional"
    ? [
        { userId: candidateUserId, matchedUserId: userId, reason, matchedVia },
        { userId, matchedUserId: candidateUserId, reason, matchedVia },
      ]
    : [{ userId, matchedUserId: candidateUserId, reason, matchedVia }];
}

function isStale(stalenessKey: string | null, currentStatus: string | null, currentStatusSetAt: Date | null): boolean {
  if (!stalenessKey) return false;
  if (!currentStatus) return true;
  const currentIso = currentStatusSetAt ? currentStatusSetAt.toISOString() : null;
  return currentIso !== stalenessKey;
}

describe("evaluate-status-match child job", () => {
  describe("insertMode row generation", () => {
    it("unidirectional inserts one row (setter path)", () => {
      const rows = buildMatchRows("unidirectional", "setter", "candidate", "pasuje", "status");
      expect(rows).toEqual([{ userId: "setter", matchedUserId: "candidate", reason: "pasuje", matchedVia: "status" }]);
    });

    it("bidirectional inserts both directions (proximity path)", () => {
      const rows = buildMatchRows("bidirectional", "moving", "candidate", "pasuje", "profile");
      expect(rows).toEqual([
        { userId: "candidate", matchedUserId: "moving", reason: "pasuje", matchedVia: "profile" },
        { userId: "moving", matchedUserId: "candidate", reason: "pasuje", matchedVia: "profile" },
      ]);
    });
  });

  describe("staleness guard", () => {
    const setAt = new Date("2026-04-19T01:20:00Z");
    const stalenessKey = setAt.toISOString();

    it("returns not stale when statusSetAt matches and currentStatus is present", () => {
      expect(isStale(stalenessKey, "szukam kumpla do tenisa", setAt)).toBe(false);
    });

    it("returns stale when currentStatus was cleared", () => {
      expect(isStale(stalenessKey, null, null)).toBe(true);
    });

    it("returns stale when statusSetAt moved forward (user changed status)", () => {
      const newerSetAt = new Date("2026-04-19T01:25:00Z");
      expect(isStale(stalenessKey, "szukam kumpla do winyla", newerSetAt)).toBe(true);
    });

    it("returns not stale when stalenessKey is null (proximity path disables the guard)", () => {
      expect(isStale(null, null, null)).toBe(false);
      expect(isStale(null, "anything", new Date())).toBe(false);
    });
  });

  describe("notifyUserIds → matchedUserIds mapping", () => {
    // Each recipient should see the OTHER side of the pair in matchedUserIds.
    // Proximity sends the event to both users — without this mapping the candidate
    // side would see its own id in matchedUserIds ("you matched with yourself").
    function otherSide(uid: string, userId: string, candidateUserId: string): string {
      return uid === userId ? candidateUserId : userId;
    }

    it("setter path: setter sees candidate in matchedUserIds", () => {
      expect(otherSide("setter", "setter", "candidate")).toBe("candidate");
    });

    it("proximity path: moving user sees candidate", () => {
      expect(otherSide("moving", "moving", "candidate")).toBe("candidate");
    });

    it("proximity path: candidate sees moving user (not its own id)", () => {
      expect(otherSide("candidate", "moving", "candidate")).toBe("moving");
    });
  });

  describe("dedup id shape", () => {
    // Dedup id embeds stalenessKey so a newer setStatus epoch enqueues fresh children
    // without colliding with the previous batch.
    function dedupId(userId: string, candidateUserId: string, stalenessKey: string | null): string {
      return `evaluate-status-match-${userId}-${candidateUserId}-${stalenessKey ?? "na"}`;
    }

    it("differs across status epochs for the same pair", () => {
      const a = dedupId("u1", "u2", "2026-04-19T01:20:00.000Z");
      const b = dedupId("u1", "u2", "2026-04-19T01:25:00.000Z");
      expect(a).not.toBe(b);
    });

    it("is stable when no staleness key is provided (proximity)", () => {
      expect(dedupId("u1", "u2", null)).toBe("evaluate-status-match-u1-u2-na");
    });
  });
});
