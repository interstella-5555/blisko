import { TRPCError } from "@trpc/server";

const MODERATION_ENDPOINT = "https://api.openai.com/v1/moderations";
// Multimodal model — supports text + images in a single `input` array. Text-only
// moderation still works against this model too, but we leave `moderateContent`
// on the server default to minimize diff in places that don't need image support.
const IMAGE_MODEL = "omni-moderation-latest";

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

export async function moderateContent(text: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;

  const response = await fetch(MODERATION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ input: text }),
  });

  if (!response.ok) {
    console.error("[moderation] API error:", response.status, await response.text());
    return; // graceful degradation
  }

  const data = (await response.json()) as {
    results: Array<{ flagged: boolean; categories: Record<string, boolean> }>;
  };

  const result = data.results[0];
  if (result?.flagged) {
    const flaggedCategories = Object.entries(result.categories)
      .filter(([, v]) => v)
      .map(([k]) => k);
    console.warn("[moderation] Content flagged:", flaggedCategories.join(", "));
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: JSON.stringify({ error: "CONTENT_MODERATED" }),
    });
  }
}

/**
 * Scan a user-uploaded image via OpenAI's multimodal moderation endpoint. Used
 * as the first-line filter in `POST /uploads` — returns a plain result object
 * rather than throwing, because the Hono route has its own error response
 * shape and the tRPC-flavored `CONTENT_MODERATED` wrapping doesn't apply.
 *
 * Graceful degradation matches `moderateContent`: missing key → skip, API
 * error / timeout → skip. The caller treats `flagged: false` as "allow".
 */
export async function moderateImage(bytes: ArrayBuffer, mimeType: string): Promise<ModerationResult> {
  if (!process.env.OPENAI_API_KEY) return { flagged: false, categories: [] };

  const base64 = Buffer.from(bytes).toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await fetch(MODERATION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      input: [{ type: "image_url", image_url: { url: dataUrl } }],
    }),
  });

  if (!response.ok) {
    console.error("[moderation] image API error:", response.status, await response.text());
    return { flagged: false, categories: [] };
  }

  const data = (await response.json()) as {
    results: Array<{ flagged: boolean; categories: Record<string, boolean> }>;
  };

  const result = data.results[0];
  if (!result) return { flagged: false, categories: [] };

  const categories = Object.entries(result.categories)
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (result.flagged) {
    console.warn("[moderation] Image flagged:", categories.join(", "));
  }
  return { flagged: result.flagged, categories };
}
