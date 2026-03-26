# Testing Patterns

**Analysis Date:** 2026-03-26

## Test Framework

**Runner:**
- Vitest 3.0.5
- Config: `apps/api/vitest.config.ts`
- Environment: Node.js (no browser environment)

**Assertion Library:**
- Vitest built-in: `describe()`, `it()`, `expect()`
- No separate assertion library (Vitest uses Node's assert module)

**Run Commands:**
```bash
# Run all tests
bun run api:test

# Watch mode
bun run --filter '@repo/api' test:watch

# Coverage report
bun run --filter '@repo/api' test -- --coverage
```

## Test File Organization

**Location:**
- Tests co-located in `__tests__/` directory at package root
- Pattern: `apps/api/__tests__/**/*.test.ts`

**Naming:**
- Test files: `*.test.ts` (not `.spec.ts`)
- Match feature name: `health.test.ts`, `ai-quick-score.test.ts`, `proximity-status-matching.test.ts`

**Structure:**
```
apps/api/
├── __tests__/
│   ├── ai-quick-score.test.ts
│   ├── health.test.ts
│   ├── proximity-status-matching.test.ts
│   ├── query-tracker.test.ts
│   ├── queue-metrics.test.ts
│   └── ws-metrics.test.ts
├── src/
│   ├── index.ts
│   ├── services/
│   ├── trpc/
│   ├── db/
│   └── ...
└── vitest.config.ts
```

## Test Structure

**Suite Organization:**

From `apps/api/__tests__/health.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("Health endpoint", () => {
  it("returns ok status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  it("returns 404 for unknown routes", async () => {
    const res = await app.request("/unknown-route");
    expect(res.status).toBe(404);
  });
});
```

**Key patterns:**
- `describe()` for test suites (often nested for organization)
- `it()` for individual test cases
- Direct imports from source: `import { app } from "../src/index"`
- Inline assertions with `expect()` (not grouped at end)
- Descriptive test names starting with lowercase verb phrase: `"returns ok status"`, `"filters out candidates"`, `"rejects non-integer scores"`

**Nested suites example** (from `apps/api/__tests__/proximity-status-matching.test.ts`):
```typescript
describe("proximity-status-matching", () => {
  describe("already-matched pair filtering", () => {
    function filterNewCandidates(...) { ... }

    it("keeps candidates with no existing match", () => {
      const result = filterNewCandidates("user-a", ["user-b"], []);
      expect(result).toEqual(["user-b"]);
    });

    it("filters out candidates matched in userId direction", () => {
      // ...
    });
  });

  describe("cosine pre-filter scoring", () => {
    function scoreAndFilter(...) { ... }

    it("scores above threshold and sorts by similarity", () => {
      // ...
    });
  });
});
```

## Assertion Patterns

**Common assertions:**
- `expect(value).toBe(expected)` — strict equality (primitives)
- `expect(value).toEqual(expected)` — deep equality (objects, arrays)
- `expect(value).toBeDefined()` — value is not `undefined`
- `expect(value).toBeNull()` — value is `null`
- `expect(array).toContain(item)` — array includes item
- `expect(value).toThrow()` — function throws error
- `expect(fn).rejects.toThrow()` — async function rejects
- `expect(spy).toHaveBeenCalled()` — for mocked functions

**Example from Zod validation test** (`apps/api/__tests__/ai-quick-score.test.ts`):
```typescript
it("parses valid scores", () => {
  const result = quickScoreSchema.safeParse({ scoreForA: 75, scoreForB: 42 });
  expect(result.success).toBe(true);
  expect(result.data).toEqual({ scoreForA: 75, scoreForB: 42 });
});

it("rejects scores below 0", () => {
  expect(quickScoreSchema.safeParse({ scoreForA: -1, scoreForB: 50 }).success).toBe(false);
});
```

## Testing Hono Routes

**Pattern:** Use `app.request()` directly (no server startup needed)

Example from `apps/api/__tests__/health.test.ts`:
```typescript
describe("Health endpoint", () => {
  it("returns ok status", async () => {
    const res = await app.request("/health");  // Direct request to Hono app
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
```

**Key points:**
- Import `app` from `src/index.ts`
- No need to start server, no port binding required
- `await app.request(path)` returns a Response object
- `.json()` and `.text()` available on Response
- Response has `.status` property

## Mocking

**Framework:** No dedicated mocking library required

**Test data helpers:**
- Inline helper functions for test logic
- Example from `apps/api/__tests__/proximity-status-matching.test.ts`:
  ```typescript
  function filterNewCandidates(
    movingUserId: string,
    candidateIds: string[],
    existingMatches: { userId: string; matchedUserId: string }[],
  ) {
    const matchedPairs = new Set(existingMatches.map((m) => `${m.userId}:${m.matchedUserId}`));
    return candidateIds.filter(
      (cId) => !matchedPairs.has(`${movingUserId}:${cId}`) && !matchedPairs.has(`${cId}:${movingUserId}`),
    );
  }

  it("keeps candidates with no existing match", () => {
    const result = filterNewCandidates("user-a", ["user-b", "user-c"], []);
    expect(result).toEqual(["user-b", "user-c"]);
  });
  ```

**What to Mock:**
- External APIs (would require API keys or network calls)
- Database layers (not typically mocked — test against actual schema)
- Time-dependent behavior (use fake timers if needed)

**What NOT to Mock:**
- Internal service functions
- Database queries (run real tests against dev database)
- Validation logic (test with real Zod schemas)
- Core business logic (test with real implementations)

**Current approach:** Tests are **integration-style** — they test real code paths with minimal mocking. The only isolation is at the HTTP boundary (`app.request()`) and data input (`Zod.safeParse()`).

## Fixtures and Factories

**Test Data:**
- No dedicated fixture/factory pattern
- Inline data creation within tests
- Example from `apps/api/__tests__/proximity-status-matching.test.ts`:
  ```typescript
  const result = filterNewCandidates("user-a", ["user-b", "user-c"], []);
  ```

**Location:**
- Test data defined in-test or as local helper functions
- No separate `fixtures/` or `factories/` directories

**Zod schema testing pattern** (from `apps/api/__tests__/ai-quick-score.test.ts`):
```typescript
// Test valid data
const result = quickScoreSchema.safeParse({ scoreForA: 75, scoreForB: 42 });
expect(result.success).toBe(true);

// Test boundary conditions
expect(quickScoreSchema.safeParse({ scoreForA: 0, scoreForB: 100 }).success).toBe(true);

// Test invalid data
expect(quickScoreSchema.safeParse({ scoreForA: -1, scoreForB: 50 }).success).toBe(false);
```

## Coverage

**Requirements:** None enforced (no CI gate)

**View Coverage:**
```bash
bun run --filter '@repo/api' test -- --coverage
```

**Reporter:** Biome (text, JSON, HTML formats)

**Coverage focus areas (NOT systematically tested):**
- Health endpoint (basic smoke test)
- Zod schema validation (exhaustive boundary testing)
- Complex algorithms (e.g., cosine similarity filtering, candidate deduplication)
- Error paths are less tested than happy paths

## Test Types

**Unit Tests:**
- Scope: Pure functions and utility logic
- Approach: Direct function calls with test data
- Example: `filterNewCandidates()`, `scoreAndFilter()` (from `apps/api/__tests__/proximity-status-matching.test.ts`)
- No database or API calls

**Integration Tests:**
- Scope: HTTP endpoint behavior
- Approach: `app.request()` to test full Hono route
- Example: Health endpoint test (`health.test.ts`)
- Database queries NOT tested this way (would require seeding)

**E2E Tests:**
- Status: Not implemented
- Mobile app has Maestro E2E setup (`bun run --filter '@repo/mobile' test:e2e`) but not actively used

## Common Patterns

**Boundary Value Testing:**

From `apps/api/__tests__/ai-quick-score.test.ts`:
```typescript
describe("quickScoreSchema", () => {
  it("accepts boundary values 0 and 100", () => {
    expect(quickScoreSchema.safeParse({ scoreForA: 0, scoreForB: 100 }).success).toBe(true);
    expect(quickScoreSchema.safeParse({ scoreForA: 100, scoreForB: 0 }).success).toBe(true);
  });

  it("rejects scores below 0", () => {
    expect(quickScoreSchema.safeParse({ scoreForA: -1, scoreForB: 50 }).success).toBe(false);
  });

  it("rejects scores above 100", () => {
    expect(quickScoreSchema.safeParse({ scoreForA: 50, scoreForB: 101 }).success).toBe(false);
  });

  it("rejects non-integer scores", () => {
    expect(quickScoreSchema.safeParse({ scoreForA: 50.5, scoreForB: 75 }).success).toBe(false);
  });
});
```

**Set-based Deduplication Testing:**

From `apps/api/__tests__/proximity-status-matching.test.ts`:
```typescript
describe("already-matched pair filtering", () => {
  function filterNewCandidates(...) {
    const matchedPairs = new Set(...);  // Bidirectional lookup
    return candidateIds.filter(
      (cId) => !matchedPairs.has(`${movingUserId}:${cId}`) && !matchedPairs.has(`${cId}:${movingUserId}`),
    );
  }

  it("filters out candidates matched in both directions", () => {
    const result = filterNewCandidates(
      "user-a",
      ["user-b"],
      [
        { userId: "user-a", matchedUserId: "user-b" },
        { userId: "user-b", matchedUserId: "user-a" },
      ],
    );
    expect(result).toEqual([]);
  });
});
```

## Async Testing

**Pattern:** Straightforward `async/await` with `await` on async operations

From `apps/api/__tests__/health.test.ts`:
```typescript
it("returns ok status", async () => {
  const res = await app.request("/health");  // await HTTP request
  const body = await res.json();  // await JSON parsing
  expect(body.status).toBe("ok");
});
```

**Async helpers inside tests:**
```typescript
async function testAsyncLogic() {
  const result = await someAsyncFunction();
  return result;
}

it("tests async behavior", async () => {
  const result = await testAsyncLogic();
  expect(result).toBeDefined();
});
```

## Error Testing

**Pattern:** `expect()` with `.toThrow()` or schema validation `.success` check

**Zod validation errors** (from `apps/api/__tests__/ai-quick-score.test.ts`):
```typescript
it("rejects missing fields", () => {
  expect(quickScoreSchema.safeParse({ scoreForA: 50 }).success).toBe(false);
  expect(quickScoreSchema.safeParse({ scoreForB: 50 }).success).toBe(false);
  expect(quickScoreSchema.safeParse({}).success).toBe(false);
});
```

**Thrown errors** (would use `.toThrow()` if testing error-throwing functions):
```typescript
it("throws on invalid input", () => {
  expect(() => parseInput(null)).toThrow();
});
```

## Test Configuration

**vitest.config.ts** (`apps/api/vitest.config.ts`):
```typescript
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,  // describe, it, expect available globally
    environment: "node",
    include: ["__tests__/**/*.test.ts"],  // Only .test.ts files
    server: {
      deps: {
        inline: ["@repo/shared", "zod"],  // Inline these for faster reload
      },
    },
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
```

## Mobile Testing

**Status:** No unit tests in mobile app

**E2E Testing:**
- Framework: Maestro (available but not actively used)
- Run: `bun run --filter '@repo/mobile' test:e2e`
- Tests would cover user flows (login, waves, messaging)

**Manual Testing Approach:**
- Dev CLI for user creation and interaction: `bun run dev-cli -- create-user <name>`
- Simulator location spoofing: `xcrun simctl location booted set 52.2010865,20.9618980`
- Queue/chatbot monitoring: `bun run dev-cli:queue-monitor`, `bun run dev-cli:chatbot-monitor`

---

*Testing analysis: 2026-03-26*
