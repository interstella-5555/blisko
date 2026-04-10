import { lt } from "drizzle-orm";
import { db, schema } from "@/db";
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
  durationMs: number;
  status: "success" | "failed";
  errorMessage?: string | null;
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
        durationMs: e.durationMs,
        status: e.status,
        errorMessage: e.errorMessage?.slice(0, 200) ?? null,
      })),
    );
  },
});

export async function pruneAiCalls(maxAgeMs: number): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  await db.delete(schema.aiCalls).where(lt(schema.aiCalls.timestamp, cutoff));
}
