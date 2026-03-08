import { AsyncLocalStorage } from "node:async_hooks";

interface QueryContext {
  queryCount: number;
  dbDurationMs: number;
}

export const queryTracker = new AsyncLocalStorage<QueryContext>();

export function createQueryContext(): QueryContext {
  return { queryCount: 0, dbDurationMs: 0 };
}

export function recordQuery(durationMs: number): void {
  const ctx = queryTracker.getStore();
  if (ctx) {
    ctx.queryCount++;
    ctx.dbDurationMs += durationMs;
  }
}

export function getQueryStats(): QueryContext | null {
  return queryTracker.getStore() ?? null;
}
