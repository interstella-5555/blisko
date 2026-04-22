import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAI {
    moderations = { create: createMock };
  },
}));

// Import after the mock is registered so the service picks up the mocked client.
const { moderateImage, shouldHardBlock } = await import("../src/services/moderation");

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

describe("moderateImage", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    createMock.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  it("returns an empty result and skips the API when no key is configured", async () => {
    process.env.OPENAI_API_KEY = "";
    const result = await moderateImage(new ArrayBuffer(1), "image/jpeg");
    expect(result).toEqual({ flagged: false, categories: [], scores: {} });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("passes the image as a base64 data URL to omni-moderation-latest", async () => {
    createMock.mockResolvedValue({ results: [{ flagged: false, categories: {}, category_scores: {} }] });
    await moderateImage(new Uint8Array([1, 2, 3]).buffer, "image/png");
    expect(createMock).toHaveBeenCalledOnce();
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe("omni-moderation-latest");
    expect(call.input[0].type).toBe("image_url");
    expect(call.input[0].image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it("returns flagged=true with tripped categories and full score map when the API reports a hit", async () => {
    createMock.mockResolvedValue({
      results: [
        {
          flagged: true,
          categories: { "sexual/minors": true, sexual: true, hate: false },
          category_scores: { "sexual/minors": 0.91, sexual: 0.84, hate: 0.03 },
        },
      ],
    });
    const result = await moderateImage(new ArrayBuffer(1), "image/jpeg");
    expect(result.flagged).toBe(true);
    expect(result.categories).toEqual(expect.arrayContaining(["sexual/minors", "sexual"]));
    expect(result.categories).not.toContain("hate");
    expect(result.scores["sexual/minors"]).toBeCloseTo(0.91);
    expect(result.scores.hate).toBeCloseTo(0.03);
  });

  it("gracefully degrades when the SDK throws", async () => {
    createMock.mockRejectedValue(new Error("boom"));
    const result = await moderateImage(new ArrayBuffer(1), "image/jpeg");
    expect(result).toEqual({ flagged: false, categories: [], scores: {} });
  });
});

describe("shouldHardBlock", () => {
  it("returns true when sexual/minors is in the tripped categories", () => {
    expect(
      shouldHardBlock({
        flagged: true,
        categories: ["sexual/minors", "sexual"],
        scores: { "sexual/minors": 0.9 },
      }),
    ).toBe(true);
  });

  it("returns false for non-CSAM flags so they can route to admin review", () => {
    expect(
      shouldHardBlock({
        flagged: true,
        categories: ["violence/graphic", "hate"],
        scores: { "violence/graphic": 0.82 },
      }),
    ).toBe(false);
  });

  it("returns false for clean results", () => {
    expect(shouldHardBlock({ flagged: false, categories: [], scores: {} })).toBe(false);
  });
});
