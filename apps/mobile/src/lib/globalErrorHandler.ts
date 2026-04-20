import { getRateLimitMessage } from "@/lib/rateLimitMessages";
import { showToast } from "@/lib/toast";

// tRPC error predicates — used by local catch blocks to bail out when the
// global handler is already going to surface a localized message. Keeps
// call-site handlers free to deal with domain errors (e.g. `already_waved`)
// without duplicating generic toasts on rate-limit or content moderation.

type TrpcLikeError = { data?: { code?: string }; message?: string };

export function isRateLimitError(error: unknown): boolean {
  return (error as TrpcLikeError)?.data?.code === "TOO_MANY_REQUESTS";
}

export function isContentModerationError(error: unknown): boolean {
  const err = error as TrpcLikeError;
  if (err?.data?.code !== "BAD_REQUEST") return false;
  try {
    return JSON.parse(err.message ?? "").error === "CONTENT_MODERATED";
  } catch {
    return false;
  }
}

function handleRateLimitError(error: unknown) {
  const err = error as TrpcLikeError;
  if (err?.data?.code !== "TOO_MANY_REQUESTS") return;

  try {
    const parsed = JSON.parse(err.message ?? "");
    if (parsed.error === "RATE_LIMITED") {
      showToast("error", getRateLimitMessage(parsed.context));
    }
  } catch {
    showToast("error", getRateLimitMessage());
  }
}

function handleContentModeration(error: unknown) {
  if (!isContentModerationError(error)) return;
  showToast("error", "Treść narusza regulamin");
}

// Callable from MutationCache/QueryCache onError AND from vanillaClient .catch()
// blocks (messagesStore etc.). `onAccountDeleted` is injected because the real
// account-deletion handler needs `signOutAndReset` + `router` from the root
// layout — keeping it as a callback avoids a circular import.
export function handleGlobalError(error: unknown, onAccountDeleted?: (error: unknown) => void) {
  onAccountDeleted?.(error);
  handleRateLimitError(error);
  handleContentModeration(error);
}
