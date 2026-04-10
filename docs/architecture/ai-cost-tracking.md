# AI Cost Tracking

> Added 2026-04-11 — BLI-174. Logs every OpenAI call into `metrics.ai_calls` and exposes it in the admin "Koszty AI" dashboard.

Every call to OpenAI (via Vercel AI SDK) is logged with token counts, USD cost estimate, duration, and context (job type, user, target user). 7-day retention, aggregated in an admin dashboard. Replaces the hand-wave cost estimates previously in `ai-matching.md`.

## Terminology

| Concept | Code | Where |
|---|---|---|
| AI call log | `metrics.ai_calls` table | `packages/db/src/schema.ts` |
| Logging wrapper | `withAiLogging()` | `apps/api/src/services/ai-log.ts` |
| Buffered writer | `aiCallBuffer` (via `createBatchBuffer`) | `apps/api/src/services/ai-log-buffer.ts` |
| Pricing map | `PRICING`, `estimateCostUsd()` | `apps/api/src/services/ai-pricing.ts` |
| Admin dashboard | `/dashboard/ai-costs` | `apps/admin/src/routes/dashboard/ai-costs.tsx` |

## Data Flow

#### What

Every AI function in `ai.ts` / `profiling-ai.ts` wraps its SDK call in `withAiLogging(ctx, doCall)`. On success the wrapper extracts `{ inputTokens, outputTokens }` from the Vercel AI SDK response, computes a USD cost via `estimateCostUsd(model, ...)`, and appends an event to a Redis-buffered queue (`blisko:ai-calls`). On failure it appends a `failed` row with the error message, then rethrows so the caller's existing `try/catch` can run its fallback.

Events are flushed in batches by the `flush-ai-calls` BullMQ maintenance job every 15 seconds. The `prune-ai-calls` maintenance job deletes rows older than 7 days once per hour.

#### Why

- **Batch flush avoids per-call DB writes.** AI calls happen in hot paths (`quick-score` every map view); batching keeps the write amplification proportional to time, not volume.
- **Wrapper inside `ai.ts` (not at worker sites).** 9 AI functions, ~15 call sites — inlining logging at every worker processor would bloat `queue.ts`. Wrapper keeps workers clean and makes `usage` extraction private to the AI module.
- **Preserves graceful degradation.** Existing functions catch errors and return fallbacks (`generatePortrait` → raw bio, `generateEmbedding` → `[]`). The wrapper logs the failure but rethrows, so the original `catch` still runs. Logging errors are swallowed in `safeAppend()` — the AI call's result/error always wins.
- **7-day retention.** Same as `push_sends`. This is operational telemetry — long-term budgeting should be done via external BI on a daily aggregate, not this raw table.

#### Config

- **Redis key:** `blisko:ai-calls`
- **Flush interval:** 15s (`upsertJobScheduler every: 15_000`)
- **Prune interval:** 1h (`upsertJobScheduler every: 3_600_000`)
- **Retention:** 7 days (`SEVEN_DAYS_MS`)
- **Pricing (USD per 1M tokens):**
  - `gpt-4.1-mini` → input 0.40, output 1.60
  - `text-embedding-3-small` → input 0.02, output 0
- **Failure error message:** truncated to 200 chars

## Schema — `metrics.ai_calls`

Full column list lives in `database.md`. Summary:

| Column | Type | Purpose |
|---|---|---|
| `id` | serial PK | |
| `timestamp` | timestamptz | DB-generated on insert |
| `queue_name` | text | Always `ai` today (future-proof if split) |
| `job_name` | text | `quick-score` / `analyze-pair` / `generate-profile-ai` / `inline-*` / etc. |
| `model` | text | `gpt-4.1-mini`, `text-embedding-3-small`, `unknown` (failed calls before model is known) |
| `prompt_tokens` / `completion_tokens` / `total_tokens` | integer | From Vercel SDK `usage` (normalized to numbers, undefined → 0) |
| `estimated_cost_usd` | numeric(12,6) | Computed via `estimateCostUsd()` |
| `user_id` / `target_user_id` | text, nullable | Nullified on GDPR anonymization |
| `duration_ms` | integer | AI-call duration only, not full job duration |
| `status` | text | `success` / `failed` |
| `error_message` | text, nullable | Truncated to 200 chars |

**Indexes:** `(timestamp)`, `(job_name, timestamp)`, `(user_id, timestamp)`, `(model, timestamp)` — match admin dashboard query patterns.

**No FK on `user_id`** — metrics schema is isolated, users get anonymized, FK would prevent that.

## Logged Call Sites

All AI functions in `ai.ts` and `profiling-ai.ts` accept an optional `ctx?: AiLogCtx`. When present, logging fires; when absent, the call runs without logging (keeps tests and one-off scripts ergonomic).

| Function | Call site | `jobName` |
|---|---|---|
| `quickScore` | `processQuickScore` in `queue.ts` | `quick-score` |
| `analyzeConnection` | `processAnalyzePair` in `queue.ts` | `analyze-pair` |
| `generatePortrait` | `processGenerateProfileAI` | `generate-profile-ai` |
| `extractInterests` | `processGenerateProfileAI` | `generate-profile-ai` |
| `generateEmbedding` | `processGenerateProfileAI` | `generate-profile-ai` |
| `generateEmbedding` | `processStatusMatching` | `status-matching` |
| `generateEmbedding` | `processProximityStatusMatching` | `proximity-status-matching` |
| `evaluateStatusMatch` | `processStatusMatching` (per candidate) | `status-matching` |
| `evaluateStatusMatch` | `processProximityStatusMatching` (per candidate) | `proximity-status-matching` |
| `generateNextQuestion` | `processGenerateProfilingQuestion` | `generate-profiling-question` |
| `generateProfileFromQA` | `processGenerateProfileFromQA` | `generate-profile-from-qa` |
| `generateFollowUpQuestions` | `profiling.ts` tRPC inline call | `inline-follow-up-questions` |

**Moderation is NOT logged.** `moderation.ts` uses the free `/v1/moderations` endpoint directly via `fetch` — no tokens, no cost, nothing to track.

## Admin Dashboard

Route: `/dashboard/ai-costs` (under AI Matching → Koszty AI in the sidebar).

**KPIs (top row):** Koszt 24h, Koszt 7 dni, Wywołań 24h, Średni koszt / wywołanie.

**Breakdowns:**
- By `job_name` — count, tokens, avg duration, cost (sorted by cost desc). Click row → filter feed by that job.
- By `model` — count, tokens, cost.
- Daily chart (7d) — horizontal bar per day.
- Top 20 users by cost — display name resolved from `profiles`. Click → filter feed.
- Feed — last 100 calls, expandable for target user / errors.

**Filters (URL-backed via TanStack Router `validateSearch`):**
- `window`: `24h` / `7d`
- `status`: `success` / `failed` / all
- `jobName`: free text (populated via table-row click)
- `userId`: populated via topUsers-row click
- `expanded`: currently expanded feed row

**Refresh:** 10 seconds when Live, pausable.

tRPC endpoints (in `apps/admin/src/server/routers/ai-costs.ts`): `summary`, `byJobName`, `byModel`, `byDay`, `topUsers`, `feed`. All use `protectedProcedure`. Aggregates use explicit `::numeric` / `::bigint` casts in raw SQL to avoid float drift.

## GDPR

`ai_calls` is metrics/observability data, not personal data per RODO. But because `user_id` / `target_user_id` reference real users, anonymization clears both on hard-delete — exactly parallel to `request_events`:

```ts
// In processHardDeleteUser (queue-ops.ts)
db.update(schema.aiCalls).set({ userId: null }).where(eq(schema.aiCalls.userId, userId)),
db.update(schema.aiCalls).set({ targetUserId: null }).where(eq(schema.aiCalls.targetUserId, userId)),
```

**Not included in data export.** Rationale: observability telemetry (tokens, durations, costs) is not user-authored content, and user references become meaningless after anonymization. Parallel treatment to `request_events`, which is also excluded from the GDPR export.

**Privacy policy:** No new disclosure needed — `ai_calls` falls under the same generic "observability" category as `request_events` (legitimate interest under Art. 6(1)(f)).

## Impact Map

If you change this system, also check:

- **New AI function added** → wrap it with `withAiLogging` in `ai.ts` / `profiling-ai.ts`, thread `ctx` from the worker, update the "Logged Call Sites" table above.
- **New model used** → add to `PRICING` in `ai-pricing.ts`, otherwise cost falls back to 0 (unknown model).
- **Vercel AI SDK major upgrade** → verify `LanguageModelUsage` shape (`inputTokens` / `outputTokens` field names) and `EmbeddingModelUsage` shape (`tokens` field) are still stable.
- **`docs/architecture/database.md`** — `metrics.ai_calls` table definition lives there.
- **`docs/architecture/queues-jobs.md`** — `flush-ai-calls` and `prune-ai-calls` maintenance jobs.
- **`docs/architecture/ai-matching.md`** — Cost Estimates section points here as the source of truth for actual cost data.
- **`docs/architecture/instrumentation.md`** — `ai_calls` is a sibling metrics table to `request_events`.
- **`docs/architecture/gdpr-compliance.md`** — anonymization nullification pattern.
- **`apps/api/src/services/queue-maintenance.ts`** — registers the flush/prune schedulers.
- **`apps/api/src/services/queue-ops.ts`** — `processHardDeleteUser` nullifies `user_id`/`target_user_id` alongside `request_events`.
