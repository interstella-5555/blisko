import { type AiCallEvent, aiCallBuffer } from "./ai-log-buffer";
import { estimateCostUsd } from "./ai-pricing";

export type AiJobName =
  | "analyze-pair"
  | "quick-score"
  | "generate-profile-ai"
  | "status-matching"
  | "proximity-status-matching"
  | "evaluate-status-match"
  | "generate-profiling-question"
  | "generate-profile-from-qa"
  | "inline-follow-up-questions";

export interface AiLogCtx {
  jobName: AiJobName;
  userId?: string | null;
  targetUserId?: string | null;
}

export interface AiCallMetadata<T> {
  result: T;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

function safeAppend(event: AiCallEvent): void {
  try {
    aiCallBuffer.append(event);
  } catch (err) {
    // Logging must never break the caller
    console.error("[ai-log] failed to append event:", err);
  }
}

/**
 * Wraps an AI call and logs its token usage + cost to `metrics.ai_calls`.
 *
 * Success → appends a `success` row, returns `result` unchanged.
 * Failure → appends a `failed` row with errorMessage, then rethrows so the
 * caller's existing try/catch can run its fallback.
 * Logging errors are swallowed — the AI call's result/error always wins.
 */
export async function withAiLogging<T>(ctx: AiLogCtx, call: () => Promise<AiCallMetadata<T>>): Promise<T> {
  const start = Date.now();
  try {
    const { result, model, promptTokens, completionTokens } = await call();
    const totalTokens = promptTokens + completionTokens;
    safeAppend({
      jobName: ctx.jobName,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: estimateCostUsd(model, promptTokens, completionTokens),
      userId: ctx.userId ?? null,
      targetUserId: ctx.targetUserId ?? null,
      durationMs: Date.now() - start,
      status: "success",
    });
    return result;
  } catch (err) {
    safeAppend({
      jobName: ctx.jobName,
      model: "unknown",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      userId: ctx.userId ?? null,
      targetUserId: ctx.targetUserId ?? null,
      durationMs: Date.now() - start,
      status: "failed",
      errorMessage: String(err instanceof Error ? err.message : err).slice(0, 200),
    });
    throw err;
  }
}

export { aiCallBuffer, pruneAiCalls } from "./ai-log-buffer";
