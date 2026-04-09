import { lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { createBatchBuffer } from "./batch-buffer";

interface PushLogEvent {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  collapseId?: string;
  status: "sent" | "suppressed" | "failed";
  suppressionReason?: "ws_active" | "dnd" | "no_tokens" | "invalid_tokens";
  tokenCount: number;
}

export const pushLogBuffer = createBatchBuffer<PushLogEvent>({
  key: "blisko:push-log",
  onFlush: async (events) => {
    await db.insert(schema.pushSends).values(
      events.map((e) => ({
        userId: e.userId,
        title: e.title,
        body: e.body,
        data: e.data ?? null,
        collapseId: e.collapseId ?? null,
        status: e.status,
        suppressionReason: e.suppressionReason ?? null,
        tokenCount: e.tokenCount,
      })),
    );
  },
});

/** Delete push log entries older than the given duration (ms). Returns deleted count. */
export async function prunePushLog(maxAgeMs: number): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  await db.delete(schema.pushSends).where(lt(schema.pushSends.createdAt, cutoff));
}

/** Convenience: fire-and-forget push event logging */
export function logPushEvent(event: PushLogEvent): void {
  pushLogBuffer.append(event);
}
