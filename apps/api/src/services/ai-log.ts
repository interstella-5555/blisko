import { type AiCallEvent, aiCallBuffer } from "./ai-log-buffer";
import { estimateCostUsd, type ServiceTier } from "./ai-pricing";

export type AiJobName =
  | "analyze-pair"
  | "quick-score"
  | "generate-profile-ai"
  | "status-matching"
  | "proximity-status-matching"
  | "evaluate-status-match"
  | "generate-profiling-question"
  | "generate-profile-from-qa"
  | "inline-follow-up-questions"
  | "chatbot-message";

export type ReasoningEffort = "minimal" | "medium";

export interface AiLogCtx {
  jobName: AiJobName;
  userId?: string | null;
  targetUserId?: string | null;
  /** Explicit model override — falls back to `AI_MODELS.sync` inside ai.ts / profiling-ai.ts. */
  model?: string;
  /** Defaults to "standard". "flex" is only passed to OpenAI for flex-eligible models. */
  serviceTier?: ServiceTier;
  /** gpt-5 family only — "minimal" keeps latency/cost near non-reasoning baseline. */
  reasoningEffort?: ReasoningEffort;
}

export interface AiCallMetadata<T> {
  result: T;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Raw SDK output — text/object/embed meta. Nulled after 24h. */
  output?: Record<string, unknown> | null;
}

/** Raw SDK input — system/prompt/messages/temperature/maxOutputTokens/providerOptions/schemaName. Passed at call-time so failed calls log it too. Nulled after 24h. */
export type AiCallInput = Record<string, unknown>;

function safeAppend(event: AiCallEvent): void {
  try {
    aiCallBuffer.append(event);
  } catch (err) {
    console.error("[ai-log] failed to append event:", err);
  }
}

/**
 * Wraps an AI call and logs its token usage + cost to `metrics.ai_calls`.
 *
 * Success → appends a `success` row (with input + output), returns `result` unchanged.
 * Failure → appends a `failed` row with errorMessage + input (no output), then rethrows
 * so the caller's existing try/catch can run its fallback. Input is taken at call-time
 * so it is always logged — failed calls are exactly the ones we want to debug.
 * Logging errors are swallowed — the AI call's result/error always wins.
 */
export async function withAiLogging<T>(
  ctx: AiLogCtx,
  input: AiCallInput,
  call: () => Promise<AiCallMetadata<T>>,
): Promise<T> {
  const start = Date.now();
  const serviceTier: ServiceTier = ctx.serviceTier ?? "standard";
  try {
    const { result, model, promptTokens, completionTokens, output } = await call();
    const totalTokens = promptTokens + completionTokens;
    safeAppend({
      jobName: ctx.jobName,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: estimateCostUsd(model, promptTokens, completionTokens, serviceTier),
      userId: ctx.userId ?? null,
      targetUserId: ctx.targetUserId ?? null,
      serviceTier,
      reasoningEffort: ctx.reasoningEffort ?? null,
      durationMs: Date.now() - start,
      status: "success",
      inputJsonb: input,
      outputJsonb: output ?? null,
    });
    return result;
  } catch (err) {
    safeAppend({
      jobName: ctx.jobName,
      model: ctx.model ?? "unknown",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      userId: ctx.userId ?? null,
      targetUserId: ctx.targetUserId ?? null,
      serviceTier,
      reasoningEffort: ctx.reasoningEffort ?? null,
      durationMs: Date.now() - start,
      status: "failed",
      errorMessage: String(err instanceof Error ? err.message : err).slice(0, 200),
      inputJsonb: input,
      outputJsonb: null,
    });
    throw err;
  }
}

export { aiCallBuffer, pruneAiCallPayloads, pruneAiCalls } from "./ai-log-buffer";
