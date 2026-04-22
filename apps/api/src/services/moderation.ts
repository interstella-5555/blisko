import { TRPCError } from "@trpc/server";
import OpenAI from "openai";

// Multimodal model — handles text + images on the same endpoint. Text-only
// callers stay on the server default so `moderateContent` doesn't change.
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

const EMPTY_RESULT: ModerationResult = { flagged: false, categories: [], scores: {} };

// Lazy singleton — the API key only needs to be in the environment when a
// moderation call actually happens, so modules that import this file purely
// for types don't crash at load time if the key isn't configured.
let _client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

function listFlaggedCategories(categories: Record<string, boolean>): string[] {
  return Object.entries(categories)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

export async function moderateContent(text: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  let result: OpenAI.Moderations.Moderation | undefined;
  try {
    const response = await client.moderations.create({ input: text });
    result = response.results[0];
  } catch (err) {
    console.error("[moderation] API error:", err);
    return; // graceful degradation
  }

  if (result?.flagged) {
    const flaggedCategories = listFlaggedCategories(result.categories as unknown as Record<string, boolean>);
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
  const client = getClient();
  if (!client) return EMPTY_RESULT;

  const base64 = Buffer.from(bytes).toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  let result: OpenAI.Moderations.Moderation | undefined;
  try {
    const response = await client.moderations.create({
      model: IMAGE_MODEL,
      input: [{ type: "image_url", image_url: { url: dataUrl } }],
    });
    result = response.results[0];
  } catch (err) {
    console.error("[moderation] image API error:", err);
    return EMPTY_RESULT;
  }

  if (!result) return EMPTY_RESULT;

  const categories = listFlaggedCategories(result.categories as unknown as Record<string, boolean>);
  if (result.flagged) {
    console.warn("[moderation] Image flagged:", categories.join(", "));
  }
  return {
    flagged: result.flagged,
    categories,
    scores: (result.category_scores as unknown as Record<string, number>) ?? {},
  };
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
