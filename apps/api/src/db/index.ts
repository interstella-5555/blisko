import { createDb, schema } from "@repo/db";
import { recordQuery } from "@/services/query-tracker";

export { preparedName } from "@repo/db";
export type { NewRequestEvent } from "@repo/db/src/schema";
export { schema };

const { db: rawDb, client } = createDb({
  connectionString: process.env.DATABASE_URL!,
});

// Instrument client.unsafe() to track query count + duration per request.
// drizzle-orm/postgres-js calls client.unsafe() for all queries.
// We wrap it to record timing via AsyncLocalStorage (query-tracker.ts).
const originalUnsafe = client.unsafe.bind(client);

// biome-ignore lint/suspicious/noExplicitAny: monkey-patch must accept any parameter types
function instrumentedUnsafe(query: string, parameters?: any[], queryOptions?: any) {
  const start = performance.now();
  const pending = originalUnsafe(query, parameters, queryOptions);

  // Wrap .then() on the PendingQuery to record timing after execution
  const origThen = pending.then.bind(pending);
  // biome-ignore lint/suspicious/noThenProperty: wrapping existing thenable's .then for timing
  pending.then = function patchedThen(onfulfilled?: unknown, onrejected?: unknown) {
    return origThen(
      (val: unknown) => {
        recordQuery(Math.round(performance.now() - start));
        return typeof onfulfilled === "function" ? onfulfilled(val) : val;
      },
      (err: unknown) => {
        recordQuery(Math.round(performance.now() - start));
        if (typeof onrejected === "function") return onrejected(err);
        throw err;
      },
    );
  } as typeof pending.then;

  // Also wrap .values() for prepared statement paths
  const origValues = pending.values.bind(pending);
  pending.values = function patchedValues() {
    const valuesPending = origValues();
    const valOrigThen = valuesPending.then.bind(valuesPending);
    // biome-ignore lint/suspicious/noThenProperty: wrapping existing thenable's .then for timing
    valuesPending.then = function patchedValuesThen(onfulfilled?: unknown, onrejected?: unknown) {
      return valOrigThen(
        (val: unknown) => {
          recordQuery(Math.round(performance.now() - start));
          return typeof onfulfilled === "function" ? onfulfilled(val) : val;
        },
        (err: unknown) => {
          recordQuery(Math.round(performance.now() - start));
          if (typeof onrejected === "function") return onrejected(err);
          throw err;
        },
      );
    } as typeof valuesPending.then;
    return valuesPending;
  } as typeof pending.values;

  return pending;
}

// @ts-expect-error — monkey-patching for query instrumentation
client.unsafe = instrumentedUnsafe;

export const db = rawDb;
