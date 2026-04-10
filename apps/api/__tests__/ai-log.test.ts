import { beforeEach, describe, expect, it, vi } from "vitest";
import { withAiLogging } from "../src/services/ai-log";
import { aiCallBuffer } from "../src/services/ai-log-buffer";

describe("withAiLogging", () => {
  const appendSpy = vi.spyOn(aiCallBuffer, "append");

  beforeEach(() => {
    appendSpy.mockReset();
    appendSpy.mockImplementation(() => {});
  });

  it("logs success event with token counts and cost", async () => {
    const result = await withAiLogging({ jobName: "quick-score", userId: "u1", targetUserId: "u2" }, async () => ({
      result: { scoreForA: 70, scoreForB: 65 },
      model: "gpt-4.1-mini",
      promptTokens: 1200,
      completionTokens: 30,
    }));

    expect(result).toEqual({ scoreForA: 70, scoreForB: 65 });
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const event = appendSpy.mock.calls[0][0];
    expect(event.jobName).toBe("quick-score");
    expect(event.model).toBe("gpt-4.1-mini");
    expect(event.promptTokens).toBe(1200);
    expect(event.completionTokens).toBe(30);
    expect(event.totalTokens).toBe(1230);
    expect(event.userId).toBe("u1");
    expect(event.targetUserId).toBe("u2");
    expect(event.status).toBe("success");
    expect(event.estimatedCostUsd).toBeGreaterThan(0);
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("logs failed event and rethrows the error", async () => {
    const boom = new Error("API timeout");
    await expect(
      withAiLogging({ jobName: "analyze-pair", userId: "u1" }, async () => {
        throw boom;
      }),
    ).rejects.toThrow("API timeout");

    expect(appendSpy).toHaveBeenCalledTimes(1);
    const event = appendSpy.mock.calls[0][0];
    expect(event.status).toBe("failed");
    expect(event.errorMessage).toContain("API timeout");
    expect(event.promptTokens).toBe(0);
    expect(event.completionTokens).toBe(0);
    expect(event.model).toBe("unknown");
  });

  it("truncates long error messages to 200 chars", async () => {
    const longErr = "x".repeat(500);
    await expect(
      withAiLogging({ jobName: "analyze-pair" }, async () => {
        throw new Error(longErr);
      }),
    ).rejects.toThrow();

    const event = appendSpy.mock.calls[0][0];
    expect(event.errorMessage?.length ?? 0).toBeLessThanOrEqual(200);
  });

  it("never throws from logging itself on success path", async () => {
    appendSpy.mockImplementationOnce(() => {
      throw new Error("redis down");
    });
    const result = await withAiLogging({ jobName: "test" }, async () => ({
      result: "ok",
      model: "gpt-4.1-mini",
      promptTokens: 10,
      completionTokens: 5,
    }));
    expect(result).toBe("ok");
  });
});
