import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { moderateImage } from "../src/services/moderation";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

describe("moderateImage", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_KEY;
    vi.restoreAllMocks();
  });

  it("returns flagged=false and skips the API when no key is configured", async () => {
    process.env.OPENAI_API_KEY = "";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await moderateImage(new ArrayBuffer(1), "image/jpeg");
    expect(result).toEqual({ flagged: false, categories: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts a data URL to the moderation endpoint with the multimodal model", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [{ flagged: false, categories: {} }] }), { status: 200 }),
      );
    await moderateImage(new Uint8Array([1, 2, 3]).buffer, "image/png");
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/moderations");
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("omni-moderation-latest");
    expect(body.input[0].type).toBe("image_url");
    expect(body.input[0].image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it("returns flagged=true with the tripped categories when the API reports a hit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              flagged: true,
              categories: { "sexual/minors": true, sexual: true, hate: false },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await moderateImage(new ArrayBuffer(1), "image/jpeg");
    expect(result.flagged).toBe(true);
    expect(result.categories).toEqual(expect.arrayContaining(["sexual/minors", "sexual"]));
    expect(result.categories).not.toContain("hate");
  });

  it("gracefully degrades on a non-OK API response (returns flagged=false)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    const result = await moderateImage(new ArrayBuffer(1), "image/jpeg");
    expect(result).toEqual({ flagged: false, categories: [] });
  });
});
