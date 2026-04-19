# AI Cost Tracking

> Added 2026-04-11 — BLI-174. Logs every OpenAI call into `metrics.ai_calls` and exposes it in the admin "Koszty AI" dashboard.
> Updated 2026-04-19 — BLI-236. Async call-sites migrated to `gpt-5-mini` with `service_tier: "flex"` (50% off). Sync sites moved to `gpt-5-mini` standard (cheaper input). `AiLogCtx` gained `model` / `serviceTier` / `reasoningEffort`; `metrics.ai_calls` gained `service_tier` + `reasoning_effort` columns; pricing map + `estimateCostUsd` became tier-aware.
> Updated 2026-04-19 — BLI-236 follow-up. Admin dashboard gains `byServiceTier` latency percentiles (avg / p50 / p95) and a new `byJobNameAndTier` breakdown so `analyze-pair` batch and on-demand latencies can be tracked separately. Flex p95 > 60s flags amber — early signal that the flex pool is starving.
> Updated 2026-04-19 — BLI-239. Full payload logging (input + output) with 24h retention, alongside the 7d metrics window. `withAiLogging(ctx, input, call)` now takes `input` as an argument so failed calls log it too. Chatbot (`apps/chatbot`) joined the pipeline via a shared-secret `POST /internal/ai-log` endpoint.

Every call to OpenAI (via Vercel AI SDK) is logged with token counts, USD cost estimate, duration, full prompt + completion payloads (24h retention), and context (job type, user, target user). Metric columns have 7-day retention, aggregated in an admin dashboard. Replaces the hand-wave cost estimates previously in `ai-matching.md`.

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

Every AI function in `ai.ts` / `profiling-ai.ts` wraps its SDK call in `withAiLogging(ctx, input, doCall)`. On success the wrapper extracts `{ inputTokens, outputTokens }` from the Vercel AI SDK response, computes a USD cost via `estimateCostUsd(model, ...)`, and appends an event to a Redis-buffered queue (`blisko:ai-calls`) — including the `input` payload (passed as arg) and the `output` payload (returned by the callback). On failure it appends a `failed` row with the error message AND the input (for debug), then rethrows so the caller's existing `try/catch` can run its fallback. Input must be passed as an argument so it is logged even when the SDK throws.

The chatbot service (`apps/chatbot`) does not import the wrapper directly — it POSTs events to `/internal/ai-log` on the API, which validates a shared secret (`INTERNAL_AI_LOG_SECRET`) and appends to the same buffer. This keeps the chatbot's "writes go through the API" invariant (see `demo-chatbot.md`) while reusing the same cost-estimation and retention pipeline.

Events are flushed in batches by the `flush-ai-calls` BullMQ maintenance job every 15 seconds. Two prune jobs run hourly:

- `prune-ai-calls` — `DELETE` rows older than 7 days.
- `prune-ai-call-payloads` — `UPDATE ... SET input_jsonb = NULL, output_jsonb = NULL` for rows older than 24 hours. Metric columns stay put; only the bulky payload fields are cleared. Needed because payloads hold bio / lookingFor / display names (PII), while the 7-day retention on the rest of the row is required for the cost dashboard.

#### Why

- **Batch flush avoids per-call DB writes.** AI calls happen in hot paths (`quick-score` every map view); batching keeps the write amplification proportional to time, not volume.
- **Wrapper inside `ai.ts` (not at worker sites).** 9 AI functions, 12 logged call sites — inlining logging at every worker processor would bloat `queue.ts`. Wrapper keeps workers clean and makes `usage` extraction private to the AI module.
- **Preserves graceful degradation.** Existing functions catch errors and return fallbacks (`generatePortrait` → raw bio, `generateEmbedding` → `[]`). The wrapper logs the failure but rethrows, so the original `catch` still runs. Logging errors are swallowed in `safeAppend()` — the AI call's result/error always wins.
- **7-day retention on metrics, 24h on payloads.** Metrics feed the `Koszt 7 dni` dashboard. Payloads are for debug only — "what did I send" when a call misbehaves — and hold PII (bio, lookingFor, display names), so shorter retention is a GDPR-aligned default.
- **Same table, nullify payloads.** Separate payload table was considered but rejected — PostgreSQL TOAST stores large JSONB out-of-line so aggregate queries on metric columns are unaffected by payload bulk, and this keeps the admin feed's expand-a-row rendering a single lookup. `UPDATE ... SET ... = NULL` leaves dead TOAST tuples that autovacuum handles.
- **Input passed as arg (not returned from callback).** Previously the callback returned input alongside tokens, but that meant failed calls (SDK throws) logged no input — the exact case you want for debugging. Now `withAiLogging(ctx, input, call)` captures input before the SDK call so failures always log it.
- **Chatbot via HTTP, not direct import.** Chatbot is a separate Railway service already using the "writes through the API" pattern to trigger side-effects (see `demo-chatbot.md`). Adding an internal endpoint stays consistent with that boundary — no need to share Drizzle/DB connection into the chatbot.

#### Config

- **Redis key:** `blisko:ai-calls`
- **Flush interval:** 15s (`upsertJobScheduler every: 15_000`)
- **Prune interval:** 1h (both prune jobs)
- **Retention — metrics (row):** 7 days (`prune-ai-calls` DELETE)
- **Retention — payloads (input/output JSONB):** 24 hours (`prune-ai-call-payloads` UPDATE to NULL)
- **Pricing (USD per 1M tokens, Standard tier):**
  - `gpt-4.1-mini` → input 0.40, output 1.60
  - `gpt-5-mini` → input 0.25, output 2.00
  - `text-embedding-3-small` → input 0.02, output 0
- **Flex tier multiplier:** `0.5 ×` base (applies only when `service_tier === 'flex'`, supported on `gpt-5-mini`; ignored elsewhere by OpenAI).
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
| `service_tier` | text | `standard` / `flex`. Default `standard`. `flex` for async BullMQ jobs on flex-capable models. |
| `reasoning_effort` | text, nullable | `minimal` / `medium`. Reasoning models only (gpt-5 family). NULL elsewhere. |
| `duration_ms` | integer | AI-call duration only, not full job duration |
| `status` | text | `success` / `failed` |
| `error_message` | text, nullable | Truncated to 200 chars |
| `input_jsonb` | jsonb, nullable | Raw SDK input — `kind` / `model` / `system` / `prompt` / `messages` / `temperature` / `maxOutputTokens` / `providerOptions` / `schemaName`. Nulled after 24h. |
| `output_jsonb` | jsonb, nullable | Raw SDK output — `text` + `finishReason`, or `object`, or `{ dimensions, tokens }` for embeds (vector skipped — 1536 floats, unreadable). Nulled after 24h. |

**Indexes:** `(timestamp)`, `(job_name, timestamp)`, `(user_id, timestamp)`, `(model, timestamp)`, `(service_tier, timestamp)` — match admin dashboard query patterns.

**No FK on `user_id`** — metrics schema is isolated, users get anonymized, FK would prevent that.

## Logged Call Sites

All AI functions in `ai.ts` and `profiling-ai.ts` take a **required** `ctx: AiLogCtx` parameter — every call site must thread one through. There is no opt-out: making `ctx` mandatory was a deliberate choice so that adding a new call site cannot accidentally bypass cost tracking. Tests and one-off scripts pass a dummy ctx (e.g. `{ jobName: "test", userId: null, targetUserId: null }`).

| Function | Call site | `jobName` |
|---|---|---|
| `quickScore` | `processQuickScore` in `queue.ts` | `quick-score` |
| `analyzeConnection` | `processAnalyzePair` in `queue.ts` | `analyze-pair` |
| `generatePortrait` | `processGenerateProfileAI` | `generate-profile-ai` |
| `extractInterests` | `processGenerateProfileAI` | `generate-profile-ai` |
| `generateEmbedding` | `processGenerateProfileAI` | `generate-profile-ai` |
| `generateEmbedding` | `processStatusMatching` | `status-matching` |
| `generateEmbedding` | `processProximityStatusMatching` | `proximity-status-matching` |
| `evaluateStatusMatch` | `processEvaluateStatusMatch` (one call per child job, spawned by `processStatusMatching` / `processProximityStatusMatching`) | `evaluate-status-match` |
| `generateNextQuestion` | `processGenerateProfilingQuestion` | `generate-profiling-question` |
| `generateProfileFromQA` | `processGenerateProfileFromQA` | `generate-profile-from-qa` |
| `generateFollowUpQuestions` | `profiling.ts` tRPC inline call | `inline-follow-up-questions` |
| `generateBotMessage` (chatbot) | `apps/chatbot/src/ai.ts` → `POST /internal/ai-log` | `chatbot-message` |

**Moderation is NOT logged.** `moderation.ts` uses the free `/v1/moderations` endpoint directly via `fetch` — no tokens, no cost, nothing to track.

### `/internal/ai-log` endpoint

`apps/api/src/index.ts` exposes `POST /internal/ai-log` for service-to-service log ingest. Auth is a shared secret passed in the `x-internal-secret` header; the secret comes from `INTERNAL_AI_LOG_SECRET` and must match on both sides. Clients POST `{ jobName, model, promptTokens, completionTokens, userId, targetUserId, durationMs, status, errorMessage?, input, output, serviceTier?, reasoningEffort? }` — the endpoint computes `estimatedCostUsd` server-side from `model` + tokens so clients can't skew cost accounting.

## Admin Dashboard

Route: `/dashboard/ai-costs` (under AI Matching → Koszty AI in the sidebar).

**KPIs (top row):** Koszt 24h, Koszt 7 dni, Wywołań 24h, Średni koszt / wywołanie.

**Breakdowns:**
- By `job_name` — count, tokens, avg duration, cost (sorted by cost desc). Click row → filter feed by that job.
- By `model` — count, tokens, cost.
- By `service_tier` — Standard vs Flex split with avg/p50/p95 duration and cost. Flex row flags amber when `p95 > 60s` (flex pool likely starving). Click → filter feed by tier.
- By `(job_name, service_tier, reasoning_effort)` — groups the same job name across its different tier/reasoning ctxs (e.g. `analyze-pair` batch vs on-demand) so latency attribution is cleanly separated. Same p50/p95 + flex p95>60s flag as above.
- Daily chart (7d) — horizontal bar per day.
- Top 20 users by cost — display name resolved from `profiles`. Click → filter feed.
- Feed — last 100 calls, expandable. Expanded row surfaces `input_jsonb` + `output_jsonb` as collapsible `<details>` blocks (pretty-printed JSON). If both are null on a success row (>24h old or GDPR-anonymized), the UI shows "Payload wyczyszczony".

**Filters (URL-backed via TanStack Router `validateSearch`):**
- `window`: `24h` / `7d`
- `status`: `success` / `failed` / all
- `jobName`: free text (populated via table-row click)
- `userId`: populated via topUsers-row click
- `serviceTier`: `standard` / `flex` (populated via byServiceTier-row click)
- `expanded`: currently expanded feed row

**Refresh:** 10 seconds when Live, pausable.

tRPC endpoints (in `apps/admin/src/server/routers/ai-costs.ts`): `summary`, `byJobName`, `byModel`, `byServiceTier`, `byJobNameAndTier`, `byDay`, `topUsers`, `feed`. All use `protectedProcedure`. Aggregates use explicit `::numeric` / `::bigint` / `::int` casts in raw SQL to avoid float drift; duration percentiles use `PERCENTILE_CONT(x) WITHIN GROUP (ORDER BY duration_ms)`.

## GDPR

`ai_calls` is metrics/observability data, not personal data per RODO — but `input_jsonb` / `output_jsonb` contain bio / lookingFor / display names (PII) and `user_id` / `target_user_id` reference real users. Anonymization clears all four on hard-delete:

```ts
// In processHardDeleteUser (queue-ops.ts)
db.update(schema.aiCalls)
  .set({ userId: null, inputJsonb: null, outputJsonb: null })
  .where(eq(schema.aiCalls.userId, userId)),
db.update(schema.aiCalls)
  .set({ targetUserId: null, inputJsonb: null, outputJsonb: null })
  .where(eq(schema.aiCalls.targetUserId, userId)),
```

The 24h `prune-ai-call-payloads` job already nulls payloads for most rows; the hard-delete path is needed for the fresh-within-24h window.

**Not included in data export.** Rationale: observability telemetry (tokens, durations, costs) is not user-authored content, and user references become meaningless after anonymization. Parallel treatment to `request_events`, which is also excluded from the GDPR export.

**Privacy policy:** No new disclosure needed — `ai_calls` falls under the same generic "observability" category as `request_events` (legitimate interest under Art. 6(1)(f)).

## Impact Map

If you change this system, also check:

- **New AI function added** → wrap it with `withAiLogging(ctx, input, call)` in `ai.ts` / `profiling-ai.ts`, thread `ctx` from the worker, build an `input` object with all SDK args, return `output` from the callback, update the "Logged Call Sites" table above.
- **New call site in another service** (not API or chatbot) → POST to `/internal/ai-log` with `INTERNAL_AI_LOG_SECRET`, or import the buffer if the service already has DB access.
- **New model used** → add to `PRICING` in `ai-pricing.ts`, otherwise cost falls back to 0 (unknown model).
- **Vercel AI SDK major upgrade** → verify `LanguageModelUsage` shape (`inputTokens` / `outputTokens` field names) and `EmbeddingModelUsage` shape (`tokens` field) are still stable.
- **`docs/architecture/database.md`** — `metrics.ai_calls` table definition lives there.
- **`docs/architecture/queues-jobs.md`** — `flush-ai-calls` and `prune-ai-calls` maintenance jobs.
- **`docs/architecture/ai-matching.md`** — Cost Estimates section points here as the source of truth for actual cost data.
- **`docs/architecture/instrumentation.md`** — `ai_calls` is a sibling metrics table to `request_events`.
- **`docs/architecture/gdpr-compliance.md`** — anonymization nullification pattern.
- **`apps/api/src/services/queue-maintenance.ts`** — registers the flush/prune schedulers.
- **`apps/api/src/services/queue-ops.ts`** — `processHardDeleteUser` nullifies `user_id`/`target_user_id` alongside `request_events`.
