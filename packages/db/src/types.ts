// Pure types + consts — zero runtime imports (no drizzle, no postgres).
// Safe for client bundles. Exported as `@repo/db/types` — use this path
// from mobile / admin UI / anywhere that doesn't need drizzle tables.
//
// The `@repo/db` root entry point pulls in `postgres` (Node-only, uses
// `perf_hooks`), and `@repo/db/schema` pulls in drizzle table definitions.
// Both blow up Vite client bundles. This file is the client-safe door.

// User category marker (BLI-271). Single source of truth — imported by
// schema.ts, API tRPC context, admin router, admin UI, and db filters.
export const USER_TYPES = ["regular", "demo", "test", "review"] as const;
export type UserType = (typeof USER_TYPES)[number];
