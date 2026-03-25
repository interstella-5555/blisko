import { cosineSimilarity } from "@repo/shared";
import { describe, expect, it } from "vitest";

describe("proximity-status-matching", () => {
  describe("already-matched pair filtering", () => {
    function filterNewCandidates(
      movingUserId: string,
      candidateIds: string[],
      existingMatches: { userId: string; matchedUserId: string }[],
    ) {
      const matchedPairs = new Set(existingMatches.map((m) => `${m.userId}:${m.matchedUserId}`));
      return candidateIds.filter(
        (cId) => !matchedPairs.has(`${movingUserId}:${cId}`) && !matchedPairs.has(`${cId}:${movingUserId}`),
      );
    }

    it("keeps candidates with no existing match", () => {
      const result = filterNewCandidates("user-a", ["user-b", "user-c"], []);
      expect(result).toEqual(["user-b", "user-c"]);
    });

    it("filters out candidates matched in userId direction", () => {
      const result = filterNewCandidates(
        "user-a",
        ["user-b", "user-c"],
        [{ userId: "user-a", matchedUserId: "user-b" }],
      );
      expect(result).toEqual(["user-c"]);
    });

    it("filters out candidates matched in matchedUserId direction", () => {
      const result = filterNewCandidates(
        "user-a",
        ["user-b", "user-c"],
        [{ userId: "user-b", matchedUserId: "user-a" }],
      );
      expect(result).toEqual(["user-c"]);
    });

    it("filters out candidates matched in both directions", () => {
      const result = filterNewCandidates(
        "user-a",
        ["user-b"],
        [
          { userId: "user-a", matchedUserId: "user-b" },
          { userId: "user-b", matchedUserId: "user-a" },
        ],
      );
      expect(result).toEqual([]);
    });

    it("returns empty array when all candidates are matched", () => {
      const result = filterNewCandidates(
        "user-a",
        ["user-b", "user-c"],
        [
          { userId: "user-a", matchedUserId: "user-b" },
          { userId: "user-c", matchedUserId: "user-a" },
        ],
      );
      expect(result).toEqual([]);
    });
  });

  describe("cosine pre-filter scoring", () => {
    function scoreAndFilter(
      movingEmb: number[],
      candidates: { id: string; statusEmbedding: number[] | null }[],
      threshold: number,
      topN: number,
    ) {
      return candidates
        .map((c) => ({
          id: c.id,
          similarity: c.statusEmbedding?.length ? cosineSimilarity(movingEmb, c.statusEmbedding) : 0,
        }))
        .filter((s) => s.similarity > threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topN);
    }

    it("filters below threshold", () => {
      const emb = [1, 0, 0];
      const candidates = [
        { id: "a", statusEmbedding: [1, 0, 0] },
        { id: "b", statusEmbedding: [0, 1, 0] },
        { id: "c", statusEmbedding: [0.8, 0.6, 0] },
      ];
      const result = scoreAndFilter(emb, candidates, 0.3, 10);
      expect(result.map((r) => r.id)).toEqual(["a", "c"]);
    });

    it("limits to topN", () => {
      const emb = [1, 0, 0];
      const candidates = [
        { id: "a", statusEmbedding: [0.9, 0.1, 0] },
        { id: "b", statusEmbedding: [0.8, 0.2, 0] },
        { id: "c", statusEmbedding: [0.7, 0.3, 0] },
      ];
      const result = scoreAndFilter(emb, candidates, 0.3, 2);
      expect(result).toHaveLength(2);
    });

    it("skips candidates without embedding", () => {
      const emb = [1, 0, 0];
      const candidates = [
        { id: "a", statusEmbedding: null },
        { id: "b", statusEmbedding: [] },
        { id: "c", statusEmbedding: [1, 0, 0] },
      ];
      const result = scoreAndFilter(emb, candidates, 0.3, 10);
      expect(result.map((r) => r.id)).toEqual(["c"]);
    });
  });

  describe("bidirectional match row generation", () => {
    function generateMatchRows(
      movingUserId: string,
      matches: {
        candidateId: string;
        reason: string;
        matchedVia: "status" | "profile";
      }[],
    ) {
      return matches.flatMap((m) => [
        {
          userId: m.candidateId,
          matchedUserId: movingUserId,
          reason: m.reason,
          matchedVia: m.matchedVia,
        },
        {
          userId: movingUserId,
          matchedUserId: m.candidateId,
          reason: m.reason,
          matchedVia: m.matchedVia,
        },
      ]);
    }

    it("creates two rows per match", () => {
      const rows = generateMatchRows("user-a", [
        {
          candidateId: "user-b",
          reason: "Oboje szukacie...",
          matchedVia: "status",
        },
      ]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        userId: "user-b",
        matchedUserId: "user-a",
        reason: "Oboje szukacie...",
        matchedVia: "status",
      });
      expect(rows[1]).toEqual({
        userId: "user-a",
        matchedUserId: "user-b",
        reason: "Oboje szukacie...",
        matchedVia: "status",
      });
    });

    it("creates four rows for two matches", () => {
      const rows = generateMatchRows("user-a", [
        { candidateId: "user-b", reason: "reason1", matchedVia: "status" },
        { candidateId: "user-c", reason: "reason2", matchedVia: "profile" },
      ]);
      expect(rows).toHaveLength(4);
    });

    it("collects unique user IDs for notification", () => {
      const matches = [
        { candidateId: "user-b", reason: "r1", matchedVia: "status" as const },
        {
          candidateId: "user-c",
          reason: "r2",
          matchedVia: "profile" as const,
        },
      ];
      const notifiedUserIds = new Set<string>();
      for (const m of matches) {
        notifiedUserIds.add(m.candidateId);
      }
      notifiedUserIds.add("user-a");
      expect(notifiedUserIds.size).toBe(3);
      expect(notifiedUserIds.has("user-a")).toBe(true);
      expect(notifiedUserIds.has("user-b")).toBe(true);
      expect(notifiedUserIds.has("user-c")).toBe(true);
    });
  });
});
