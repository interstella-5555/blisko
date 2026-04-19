import { lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ReasoningEffort } from "./ai-log";
import type { ServiceTier } from "./ai-pricing";
import { createBatchBuffer } from "./batch-buffer";

export interface AiCallEvent {
  jobName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  userId?: string | null;
  targetUserId?: string | null;
  serviceTier: ServiceTier;
  reasoningEffort?: ReasoningEffort | null;
  durationMs: number;
  status: "success" | "failed";
  errorMessage?: string | null;
  inputJsonb?: Record<string, unknown> | null;
  outputJsonb?: Record<string, unknown> | null;
}

export const aiCallBuffer = createBatchBuffer<AiCallEvent>({
  key: "blisko:ai-calls",
  onFlush: async (events) => {
    await db.insert(schema.aiCalls).values(
      events.map((e) => ({
        queueName: "ai",
        jobName: e.jobName,
        model: e.model,
        promptTokens: e.promptTokens,
        completionTokens: e.completionTokens,
        totalTokens: e.totalTokens,
        estimatedCostUsd: e.estimatedCostUsd.toFixed(6),
        userId: e.userId ?? null,
        targetUserId: e.targetUserId ?? null,
        serviceTier: e.serviceTier,
        reasoningEffort: e.reasoningEffort ?? null,
        durationMs: e.durationMs,
        status: e.status,
        errorMessage: e.errorMessage?.slice(0, 200) ?? null,
        inputJsonb: e.inputJsonb ?? null,
        outputJsonb: e.outputJsonb ?? null,
      })),
    );
  },
});

export async function pruneAiCalls(maxAgeMs: number): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  await db.delete(schema.aiCalls).where(lt(schema.aiCalls.timestamp, cutoff));
}

/**
 * Nulls `input_jsonb` + `output_jsonb` for rows older than `maxAgeMs`, leaving the
 * surrounding metric row intact so the 7d cost dashboard keeps working. PII-heavy
 * payloads are the short-retention part — metadata is the long-retention part.
 */
export async function pruneAiCallPayloads(maxAgeMs: number): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  await db
    .update(schema.aiCalls)
    .set({ inputJsonb: null, outputJsonb: null })
    .where(lt(schema.aiCalls.timestamp, cutoff));
}
