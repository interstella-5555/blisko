import { TRPCError } from "@trpc/server";

const MODERATION_ENDPOINT = "https://api.openai.com/v1/moderations";
// Multimodal model — supports text + images in a single `input` array. Text-only
// moderation still works against this model too, but we leave `moderateContent`
// on the server default to minimize diff in places that don't need image support.
const IMAGE_MODEL = "omni-moderation-latest";

export interface ModerationResult {
  flagged: boolean;
  // Names of categories OpenAI marked `true`. Subset of `scores`' keys.
  categories: string[];
  // Full float confidence map (0-1 per category). Persisted to moderation_results
  // so admins can see why a row landed in the review queue even for categories
  // that didn't cross the flag threshold.
  scores: Record<string, number>;
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
const EMPTY_RESULT: ModerationResult = { flagged: false, categories: [], scores: {} };

export async function moderateImage(bytes: ArrayBuffer, mimeType: string): Promise<ModerationResult> {
  if (!process.env.OPENAI_API_KEY) return EMPTY_RESULT;

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
    return EMPTY_RESULT;
  }

  const data = (await response.json()) as {
    results: Array<{
      flagged: boolean;
      categories: Record<string, boolean>;
      category_scores: Record<string, number>;
    }>;
  };

  const result = data.results[0];
  if (!result) return EMPTY_RESULT;

  const categories = Object.entries(result.categories)
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (result.flagged) {
    console.warn("[moderation] Image flagged:", categories.join(", "));
  }
  return { flagged: result.flagged, categories, scores: result.category_scores ?? {} };
}

/**
 * OpenAI categories that must trigger a synchronous hard block at `POST /uploads`.
 * Anything else gets queued for admin review. Keep this list narrow — content
 * blocked here never reaches the queue, which means no admin has the chance
 * to overturn a false positive.
 */
export const SYNC_BLOCK_CATEGORIES = ["sexual/minors"] as const;

export function shouldHardBlock(result: ModerationResult): boolean {
  return SYNC_BLOCK_CATEGORIES.some((cat) => result.categories.includes(cat));
}
