# Coding Conventions

**Analysis Date:** 2026-03-26

## Naming Patterns

**Files:**
- PascalCase for React components: `Button.tsx`, `WaveEntry.tsx`
- camelCase for utilities and services: `metrics.ts`, `queue.ts`, `authStore.ts`
- kebab-case for directories: `src/trpc/procedures/`, `src/services/`
- All code must use English identifiers — no Polish in variable/function/class names (e.g. `statusMatchBadge` not `naTerazBadge`)

**Functions:**
- camelCase: `sendWaveToUser()`, `flushMetrics()`, `extractEndpoint()`
- Private functions prefixed with underscore: `_hydrated`, `_get` (Zustand store pattern)
- Async functions use regular camelCase (no special prefix): `async function analyzeConnection()`, `async function flushMetrics()`

**Variables:**
- camelCase: `userId`, `displayName`, `waveStatusByUserId`
- Constants: UPPER_SNAKE_CASE: `BUFFER_HARD_CAP`, `FLUSH_THRESHOLD_MS`, `DECLINE_COOLDOWN_HOURS`
- Database/schema columns: snake_case: `display_name`, `created_at`, `deleted_at`
- Store state fields: camelCase: `isLoading`, `hasCheckedProfile`, `waveStatusByUserId`

**Types and Interfaces:**
- PascalCase: `User`, `Profile`, `WaveStatus`, `ButtonProps`, `AuthState`
- Type unions: `type WaveStatus = "pending" | "accepted" | "declined"`
- Discriminated unions: `type WaveStatus = { type: "sent"; waveId: string } | { type: "received"; waveId: string }`
- API response types follow entity pattern: `ConversationWithLastMessage`, `ConnectionAnalysis`

## Code Style

**Formatting:**
- Tool: Biome v2.4.6
- Indent: 2 spaces
- Line ending: LF (Unix)
- Line width: 120 characters
- Run `bun run check:fix` before completing any task to auto-fix formatting and imports

**Linting:**
- Tool: Biome v2.4.6
- Rules enforced:
  - `noExplicitAny`: Error — use proper types instead of `any`
  - `noArrayIndexKey`: Error — never use array index as React key
  - `useExhaustiveDependencies`: Warn — for React hooks (note: tRPC and Zustand manage their own key dependencies)
  - `noNonNullAssertion`: Off (allowed)
  - `noDescendingSpecificity`: Off (CSS modules)
  - `useButtonType`: Off (for mobile components)
  - `noLabelWithoutControl`: Off (custom form patterns)
- **No biome-ignore comments** — fix the actual code instead. Only exception: when code is intentionally correct and the rule produces a false positive

**Imports Organization:**
1. Node built-ins first: `import { createHash } from "node:crypto"`
2. Package imports: `import { z } from "zod"`, `import { RedisClient } from "bun"`
3. Relative imports: `import { db, schema } from "@/db"`
4. Path aliases preferred over `../` relative imports (except same-directory `./`)
   - API: `@/*` maps to `src/*`
   - Mobile: `@/*` maps to `src/*`
   - Design: `~/*` maps to `src/*`
5. Biome auto-organizes imports on save (configured in `biome.json`)

**Import grouping example** (`apps/api/src/trpc/procedures/waves.ts`):
```typescript
// Node built-ins
import { RedisClient } from "bun";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

// Packages
import { TRPCError } from "@trpc/server";
import { blockUserSchema, respondToWaveSchema, sendWaveSchema } from "@repo/shared";

// Path aliases
import { DECLINE_COOLDOWN_HOURS, PER_PERSON_COOLDOWN_HOURS } from "@/config/pingLimits";
import { db, schema } from "@/db";
import { setTargetUserId } from "@/services/metrics";
import { protectedProcedure, router } from "@/trpc/trpc";
```

## Error Handling

**Patterns:**

**API/tRPC layer:**
- Throw `TRPCError` with appropriate code and message
- Error codes: `NOT_FOUND`, `FORBIDDEN`, `BAD_REQUEST`, `CONFLICT`, `TOO_MANY_REQUESTS`
- Include human-readable message for client display
- Example from `apps/api/src/trpc/procedures/waves.ts`:
  ```typescript
  if (!targetProfile) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "User not found",
    });
  }
  ```

**Async operations (queue jobs, services):**
- Catch errors and log with context prefix: `[service-name] message`
- Return early or throw when critical, silently fail with logging when degraded
- Example from `apps/api/src/services/metrics.ts`:
  ```typescript
  catch (error) {
    console.warn(`[metrics] flush failed (${batch.length} events):`, error instanceof Error ? error.message : error);
    return 0;
  }
  ```

**Database operations:**
- No explicit error handling needed for basic queries (Drizzle throws naturally)
- Transactions use `try...catch...finally` for cleanup
- Example from `apps/api/src/trpc/procedures/waves.ts`:
  ```typescript
  const [wave] = await db.transaction(
    async (tx) => { ... },
    { isolationLevel: "serializable" },
  );
  ```

**Push/email services:**
- Log errors but don't throw — operations are fire-and-forget
- Example from `apps/api/src/trpc/procedures/waves.ts`:
  ```typescript
  void sendPushToUser(ctx.userId, { ... });  // void = fire-and-forget
  ```

**Middleware/utilities:**
- Log with context prefix and truncate long values (safety net)
- Example from `apps/api/src/services/metrics.ts`:
  ```typescript
  errMsg = truncate(err instanceof Error ? err.message : String(err), 200);
  ```

## Logging

**Framework:** `console` (built-in)

**Patterns:**
- Use context prefixes: `[module-name] action: details`
- Log levels: `console.log()` for info, `console.warn()` for degraded, `console.error()` for failures
- Examples from codebase:
  ```typescript
  console.log(`[waves.send] from=${ctx.userId} to=${input.toUserId}`);
  console.warn(`[metrics] buffer at cap, dropped ${dropCount} oldest events`);
  console.error("[profiles] Failed to enqueue profile AI job:", err);
  ```
- **Resend email fallback** (when no API key): `console.log(`[email] Resend not configured — would send to ${to}: "${template.subject}"`)`
- **No structured logging libraries** — console.log is the pattern throughout

## Comments

**When to Comment:**
- Explain WHY, not WHAT — the code shows WHAT, comments explain intent
- Complex business logic (e.g., per-person cooldown calculations, mutual ping detection)
- Non-obvious edge cases (e.g., soft-delete filtering, transaction isolation levels)
- Temporary workarounds or known limitations

**Examples from codebase:**
```typescript
// Hidden users cannot send pings (server-side safety net — mobile prompts before reaching here)
if (senderVisibility?.visibilityMode === "ninja") { ... }

// Daily ping limit — count waves sent today (UTC midnight reset)
const todayMidnight = new Date();
todayMidnight.setUTCHours(0, 0, 0, 0);

// Mutual ping detection — check if B already pinged A within the window
const reverseWave = await db.query.waves.findFirst({ ... });

// Check + insert in serializable transaction to prevent duplicate waves
const [wave] = await db.transaction(async (tx) => { ... });

// Compute distance between sender and recipient at accept time
let connectedDistance: number | null = null;
```

**JSDoc/TSDoc:**
- Not consistently used (biome doesn't enforce it)
- Used sparingly for public API functions, not internal utilities
- No verbose docstrings — single-line JSDoc for clarity

**Example (rare):**
```typescript
/**
 * Send an email via Resend. Falls back to console.log if RESEND_API_KEY is not set.
 */
async function sendEmail(to: string, template: EmailTemplate): Promise<void> { ... }
```

## Function Design

**Size:**
- Small, focused functions (10-50 lines typical)
- tRPC procedure mutations/queries: 30-100+ lines (complex business logic acceptable)
- Extracted helper functions for complex calculations (e.g., `computeStatusMap()`, `scoreAndFilter()`)

**Parameters:**
- Prefer object parameters for >2 arguments
- Example from `apps/api/src/services/queue.ts`:
  ```typescript
  function scoreAndFilter(
    movingEmb: number[],
    candidates: { id: string; statusEmbedding: number[] | null }[],
    threshold: number,
    topN: number,
  ) { ... }
  ```

**Return Values:**
- Use destructuring for Drizzle returns with multiple values:
  ```typescript
  const [wave] = await db.insert(schema.waves).values({ ... }).returning();
  ```
- Explicit return types for complex procedures (not inferred)
- Fire-and-forget operations prefixed with `void`: `void sendPushToUser(...)`

**Async/await:**
- Prefer `async function` over promises
- Use `Promise.all()` for parallel operations:
  ```typescript
  const [responderProfile, senderProfile] = await Promise.all([
    db.query.profiles.findFirst({ ... }),
    db.query.profiles.findFirst({ ... }),
  ]);
  ```

## Module Design

**Exports:**
- Named exports preferred: `export const useAuthStore = create(...)`
- Default exports for components: `export default function Button(...) { ... }`
- Type exports before value exports: `export type WaveStatus = ...`
- Example from `apps/api/src/services/metrics.ts`:
  ```typescript
  export function getBufferSize(): number { ... }
  export async function flushMetrics(): Promise<number> { ... }
  export const requestMeta = new WeakMap(...);
  ```

**Barrel Files:**
- Used sparingly (not a core pattern here)
- Package-level exports: `packages/shared/src/index.ts` re-exports types and validators

**Service layers:**
- One file per service domain: `metrics.ts`, `queue.ts`, `push.ts`, `email.ts`
- Exports both helper functions and re-used data structures
- Example: `apps/api/src/services/queue.ts` exports job types and queue configuration

**Store pattern (Zustand):**
- One file per store: `authStore.ts`, `wavesStore.ts`, `locationStore.ts`
- Interface + implementation: `interface WavesStore { ... }` + `create<WavesStore>(...)`
- Actions update state immutably: `set((state) => ({ ... }))`

## TypeScript Patterns

**Type inference:**
- Trust type inference for obvious cases (variable assignments)
- Explicit types for:
  - Function parameters and returns
  - Complex computed types
  - Public API contracts

**Discriminated unions:**
- Used for state machines (e.g., wave status, connection analysis):
  ```typescript
  export type WaveStatus =
    | { type: "sent"; waveId: string }
    | { type: "received"; waveId: string }
    | { type: "connected" };
  ```

**Schemas with Zod:**
- Define in shared package: `packages/shared/src/validators.ts`
- Export both schema and inferred type: `z.infer<typeof schema>`
- Example:
  ```typescript
  export const sendWaveSchema = z.object({
    toUserId: z.string().min(1),
  });
  export type SendWaveInput = z.infer<typeof sendWaveSchema>;
  ```

**Optional fields:**
- Use `T | null` not `T | undefined` for database values
- Use `?:` for optional properties in objects/interfaces
- Example from schema:
  ```typescript
  export const updateProfileSchema = z.object({
    displayName: z.string().min(2).max(50).optional(),
    avatarUrl: z.string().url().optional(),
  });
  ```

## React & React Native Conventions

**Component structure (React Native):**
- Functional components only
- Props interface defined above component
- Hooks at top of body
- Inline styles using `StyleSheet.create()`
- Example from `apps/mobile/src/components/ui/Button.tsx`:
  ```typescript
  interface ButtonProps {
    title?: string;
    variant?: ButtonVariant;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
  }

  export function Button({ title, variant = "accent", onPress, ... }: ButtonProps) {
    const scale = useRef(new Animated.Value(1)).current;
    // ... rest of component
  }
  ```

**Zustand stores:**
- Combine state + actions in single interface
- Use immutable state updates
- Hydration flag for async initialization
- Example from `apps/mobile/src/stores/authStore.ts`:
  ```typescript
  interface AuthState {
    user: User | null;
    isLoading: boolean;
    setUser: (user: User | null) => void;
    reset: () => void;
  }

  export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true,
    setUser: (user) => set({ user }),
    reset: () => set({ user: null, isLoading: false }),
  }));
  ```

---

*Convention analysis: 2026-03-26*
