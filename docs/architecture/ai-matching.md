# AI Matching & Scoring

> v1 — AI-generated from source analysis, 2026-04-06.

All AI calls use OpenAI via Vercel AI SDK (`@ai-sdk/openai`, `ai` package). Models defined in `packages/shared/src/models.ts`. Source files: `apps/api/src/services/ai.ts` (AI functions), `apps/api/src/services/queue.ts` (BullMQ processors + enqueue helpers), `apps/api/src/trpc/procedures/profiles.ts` (triggers), `apps/api/src/trpc/procedures/waves.ts` (wave-send promotion).

## Terminology & Product Alignment

| PRODUCT.md | Code | UI (Polish) | Notes |
|---|---|---|---|
| Profile Match (Poziom 1) | T1 cosine + T2 quickScore + T3 analyzeConnection | "% na bance" | Three tiers, progressively richer |
| Status Match (Poziom 2) | evaluateStatusMatch | Pulsujaca banka | "Na teraz" matching |
| Ping | Wave (`waves` table) | Ping | Irreversible contact request |
| Banka | Map bubble | Banka na mapie | User dot on discovery map |
| Portret spoleczny | `profiles.portrait` | (internal) | AI-generated rich personality text, never shown raw |
| Score | `connectionAnalyses.aiMatchScore` | % match | 0-100, asymmetric per direction |
| Snippet | `connectionAnalyses.shortSnippet` | Card preview text | Max 90 chars, T3 only |
| Description | `connectionAnalyses.longDescription` | Full profile pitch | Max 500 chars, T3 only |

## Tiered Scoring Architecture

Three tiers exist to avoid O(N^2) pre-computation. The design came from the scaling plan (`docs/plans/2026-03-19-0100-scaling-infra-tiered-matching.md`): at 200K MAU, pre-computing full analyses for every location update would cost thousands of dollars/day in API calls. Instead, scores are computed lazily — cheap tiers first, expensive tiers on demand.

### T1 — Cosine Similarity

**What:** Pure math on stored embedding vectors. No API call. Compares `profiles.embedding` (float array from `text-embedding-3-small`) using `cosineSimilarity()` from `@repo/shared`.

**Where computed:** Inline in `getNearbyUsersForMap` query handler. Also used as a ranking signal in `processAnalyzeUserPairs` and as a pre-filter in both status matching processors.

**Formula:** Standard cosine similarity: `dot(A,B) / (||A|| * ||B||)`. Returns 0 if vectors have different lengths.

**Used for ranking:** In the map query, when no AI analysis exists yet, the display score falls back to: `0.7 * cosineSimilarity + 0.3 * interestOverlapRatio`. The overall rank that determines bubble order is: `0.6 * matchScore + 0.4 * proximityNormalized`.

**Config:** Model `text-embedding-3-small`, no temperature. Cost: $0 at query time (embeddings pre-generated on profile creation).

### T2 — Quick Score

**What:** Lightweight LLM call that returns only two asymmetric integer scores (0-100), no text. Designed as a cheap middle tier — gives users a meaningful % on map bubbles without generating prose.

**Why separate from T3:** The scaling plan identified that 85% of the cost was in generating snippets/descriptions that users rarely read (most just glance at the % on the bubble). T2 costs roughly 1/20th of T3 per call.

**Function:** `quickScore()` in `ai.ts`.

**System prompt (Polish):** Instructs the model to evaluate compatibility asymmetrically. Scoring formula: fulfillment of "czego szukam" (70%) + shared interests (20%) + similar lifestyle (10%). The prompt explicitly states the score is ASYMMETRIC — A's score of B can differ from B's score of A.

**Input:** Both users' `portrait`, `displayName`, `lookingFor`, and optional `superpower`.

**Output schema:** `{ scoreForA: int 0-100, scoreForB: int 0-100 }` (Zod-validated via `generateObject`).

**Config:**
- Model: `gpt-4.1-mini` (GPT_MODEL)
- Temperature: 0.3 (low creativity — we want consistent scores)
- maxOutputTokens: 50
- Estimated cost: ~$0.0005/call (approximately 1200 input + 30 output tokens)

**When triggered:**
- Map view: `getNearbyUsersForMap` enqueues T2 for any nearby user without an existing `connectionAnalyses` row (`enqueueQuickScore`)
- BullMQ job type: `quick-score`, jobId: `quick-score-{sortedUserA}-{sortedUserB}`

**Skip logic:** If a T3 full analysis already exists (row has non-null `shortSnippet`), the processor returns immediately. T2 only writes to `connectionAnalyses` when `shortSnippet IS NULL` (conditional upsert via `setWhere`).

**WebSocket:** Emits `analysisReady` with `shortSnippet: null` to both users after scoring.

### T3 — Full Connection Analysis

**What:** Rich bilateral analysis producing scores, short snippets (90-char pitches), and long descriptions (500-char pitches) for both directions. The "blind date host" persona.

**Why expensive:** The system prompt contains 5 detailed example pairs (approximately 2500 tokens) to calibrate tone and scoring. Plus it generates 4 text fields.

**Function:** `analyzeConnection()` in `ai.ts`.

**System prompt structure:**
1. Role: "prowadzacy randke w ciemno" (blind date host) who knows both people
2. **CRITICAL PRIVACY RULE:** "NIGDY nie wspominaj o aktualnym statusie, biezacych intencjach 'na teraz'" — descriptions must NEVER reference private status content. Revealing status indirectly through the description is treated the same as direct disclosure.
3. Scoring formula: same as T2 (70% lookingFor fulfillment, 20% shared interests, 10% lifestyle)
4. Snippet rules: max 90 chars, describes the OTHER person FOR the reader. Starts with what the other person is looking for if it resonates.
5. Description rules: max 500 chars, pitch about the other person. Warm but not enthusiastic, no headings, no lists.
6. Five calibration examples (sportowcy, kreatywni, malo wspolnego, biznes, padel) with exact expected output

**Input:** Both users' `portrait`, `displayName`, `lookingFor`, optional `superpower`. Wrapped in `<user_profile>` XML tags.

**Output schema:** `{ matchScoreForA: 0-100, matchScoreForB: 0-100, snippetForA: max90, snippetForB: max90, descriptionForA: max500, descriptionForB: max500 }` (Zod-validated).

**Config:**
- Model: `gpt-4.1-mini` (GPT_MODEL)
- Temperature: 0.7 (more creative for prose generation)
- maxOutputTokens: not explicitly set (defaults to model max)
- Estimated cost: ~$0.01/call (approximately 3000 input + 500 output tokens)

**When triggered:**
- On-demand: `getDetailedAnalysis` procedure (user taps bubble) calls `promotePairAnalysis`
- On wave send: `waves.send` calls `promotePairAnalysis` (so the recipient sees a full analysis immediately)
- Batch: `processAnalyzeUserPairs` (enqueued on profile update or manual reanalyze) queues `analyze-pair` jobs for up to 100 nearby users, sorted by T1 rank score
- Direct: `ensureAnalysis` procedure calls `enqueuePairAnalysis`

**Staleness detection:** Each `connectionAnalyses` row stores `fromProfileHash` and `toProfileHash` — SHA-256 of `"{bio}|{lookingFor}"` truncated to 8 hex chars. `processAnalyzePair` compares stored hashes with current profile hashes and skips if unchanged. This means profiles can be viewed thousands of times without re-running the analysis, but editing bio/lookingFor automatically invalidates stale analyses.

**Storage:** `connectionAnalyses` table, unique on `(fromUserId, toUserId)`. One API call produces two rows (A's view of B, B's view of A). Upserts via `onConflictDoUpdate`.

**WebSocket:** Emits `analysisReady` with the `shortSnippet` to both users. Also publishes to Redis channel `analysis:ready` for cross-replica delivery.

## Priority Queue & Deduplication

**`safeEnqueuePairJob` logic:** Before adding an `analyze-pair` job:
1. Look up existing job by deterministic jobId (`pair-{sortedA}-{sortedB}`)
2. If active or completed: skip (don't duplicate work)
3. If waiting/delayed AND no priority override: skip (already queued)
4. If failed/stale or being promoted: remove old job, add new one

**Promotion on wave send:** `promotePairAnalysis` removes any existing queued job for the pair and re-adds it WITHOUT a priority number. In BullMQ, jobs without explicit priority are processed FIFO before all prioritized jobs. This ensures wave-triggered analyses jump ahead of batch background analyses.

**Deduplication for quick-score:** Uses BullMQ's built-in jobId dedup (`quick-score-{sortedA}-{sortedB}`). If the job already exists (any state), BullMQ silently ignores the add.

## Status Matching

Two processors handle status matching: one triggered by setting/changing a status, one triggered by moving near someone with an active status.

### processStatusMatching (status-change trigger)

**When triggered:** User sets a status via `setStatus` mutation, which calls `enqueueStatusMatching`.

**Flow:**
1. Generate embedding for status text (`generateEmbedding`)
2. Store as `profiles.statusEmbedding`
3. Find nearby users within ~5km bounding box (NEARBY_RADIUS_DEG = 0.05)
4. **Pre-filter by cosine similarity** — compare status embedding against: (a) other user's `statusEmbedding` if they have a public active status, or (b) other user's profile `embedding` otherwise. Private statuses are matched via profile embedding only — their status text never enters the LLM. Threshold: > 0.3. Take top 20 candidates.
5. **LLM evaluation** via `evaluateStatusMatch` for each candidate (in parallel)
6. Replace all existing `statusMatches` for this user with new matches
7. Emit `statusMatchesReady` WebSocket event
8. Send ambient push with cooldown if any matches found

### processProximityStatusMatching (location-change trigger)

**When triggered:** User updates location, which calls `enqueueProximityStatusMatching` (debounced 2 minutes by BullMQ).

**Flow:** Similar to above but:
1. Finds nearby users who have an active status (within ~5km)
2. Filters out pairs that already have a `statusMatches` row (either direction)
3. Pre-filters by cosine similarity > 0.3, takes top 10 candidates
4. LLM evaluation for each candidate
5. **Adds** matches (does not replace — `onConflictDoNothing`), since this is additive to the user's existing status matches
6. Notifies all matched users via WebSocket + ambient push

### evaluateStatusMatch (LLM function)

**Two modes:**
- `"status"` mode: Compares two status texts. Prompt asks: "Czy te dwie potrzeby/oferty sie uzupelniaja?" (Do these needs/offers complement each other?)
- `"profile"` mode: Compares a status text against a profile. Prompt asks: "Czy profil osoby B pasuje do tego czego szuka osoba A?"

**Category-aware matching:** When categories are provided (`categoriesA`, `categoriesB`), they're appended as context hints: `[kontekst: project, networking]`. The prompt instructs the model that different category contexts (e.g., dating vs project) make a match unlikely.

**Config:**
- Model: `gpt-4.1-mini` (GPT_MODEL)
- Temperature: not explicitly set (model default)
- maxOutputTokens: 100
- Output: raw JSON text parsed manually (not `generateObject`) — `{ isMatch: boolean, reason: string }`
- Reason: max 60-80 chars, Polish

**Cost:** ~$0.0003/call (small prompt, tiny output).

## Profile AI Generation Pipeline

Triggered by `enqueueProfileAI` when a profile is created or bio/lookingFor changes. Runs as a single BullMQ job (`generate-profile-ai`). Debounced 30 seconds by BullMQ (`debounce.ttl`).

### Step 1: Portrait Generation

**Function:** `generatePortrait(bio, lookingFor)` in `ai.ts`.

**What:** Generates a rich third-person social profile (200-300 words, Polish) describing the person's interests, lifestyle, personality, and what they're looking for.

**CRITICAL PRIVACY RULE:** System prompt explicitly states: "NIE wspominaj o aktualnym statusie uzytkownika ani biezacych intencjach 'na teraz' — te informacje sa prywatne." Status content must never leak into portraits.

**The prompt resolves vague lookingFor statements** — e.g., "ludzi o podobnych zainteresowaniach" gets expanded into specific interests derived from bio.

**Config:**
- Model: `gpt-4.1-mini` (GPT_MODEL)
- Temperature: 0.7
- maxOutputTokens: 500
- Input: `<user_bio>` + `<user_looking_for>` XML tags
- Cost: ~$0.003/call

### Step 2: Interest Extraction

**Function:** `extractInterests(portrait)` in `ai.ts`.

**What:** Extracts 8-12 short interest tags from the generated portrait.

**Config:**
- Model: `gpt-4.1-mini` (GPT_MODEL)
- Temperature: 0 (deterministic — same portrait should yield same tags)
- maxOutputTokens: 200
- Output schema: `{ interests: string[] }` — Polish, lowercase, 1-3 words each
- Stored in: `profiles.interests` (text array)
- Cost: ~$0.001/call

### Step 3: Embedding Generation

**Function:** `generateEmbedding(portrait)` in `ai.ts`.

**Config:**
- Model: `text-embedding-3-small` (EMBEDDING_MODEL)
- Returns: float array (1536 dimensions)
- Stored in: `profiles.embedding`
- Cost: ~$0.00002/call
- Graceful degradation: returns `[]` if OPENAI_API_KEY not set

**After all three steps complete:** `profileReady` WebSocket event is emitted.

## Ambient Push Cooldown

**What:** When status/proximity matching finds a match, a push notification is sent to the user. To prevent spam, there's a 1-hour cooldown per user.

**Implementation:** Redis key `ambient-push:{userId}` with `EX 3600` (1 hour TTL). `sendAmbientPushWithCooldown` checks if the key exists before sending. The push uses `collapseId: "ambient-match"` for iOS notification grouping.

**Push content:** Title "Blisko", body "Ktos z pasujacym profilem jest w poblizu", data type `ambient_match`.

## Debouncing

| Job type | Debounce mechanism | TTL |
|---|---|---|
| `generate-profile-ai` | BullMQ debounce (`debounce.id`) | 30 seconds |
| `analyze-user-pairs` | BullMQ debounce (`debounce.id`) | 30 seconds |
| `proximity-status-matching` | BullMQ debounce (`debounce.id`) | 2 minutes |
| `quick-score` | BullMQ jobId dedup (idempotent add) | N/A |
| `analyze-pair` | `safeEnqueuePairJob` (manual dedup) | N/A |
| `status-matching` | BullMQ jobId dedup | N/A |

## BullMQ Configuration

- Queue name: `ai-jobs`
- Worker concurrency: 50
- Default job options: `removeOnComplete: true`, `removeOnFail: { count: 100 }`, attempts: 3, exponential backoff starting at 5 seconds
- All job types share a single queue and worker

## Cost Estimates

| Operation | Model | Estimated cost | Frequency |
|---|---|---|---|
| T1 cosine similarity | N/A (math) | $0 | Every map view |
| T2 quick score | gpt-4.1-mini | ~$0.0005 | On map view (missing pairs) |
| T3 full analysis | gpt-4.1-mini | ~$0.01 | On bubble tap or wave send |
| Status match eval | gpt-4.1-mini | ~$0.0003 | On status set/change, location update |
| Portrait generation | gpt-4.1-mini | ~$0.003 | On profile create/update |
| Interest extraction | gpt-4.1-mini | ~$0.001 | On profile create/update |
| Embedding | text-embedding-3-small | ~$0.00002 | On profile/status create/update |

**At 1K DAU (current):** Roughly $5-10/day. Most cost is in T3 analyses triggered by `processAnalyzeUserPairs` batch jobs.

**At 200K MAU (target):** Tiered architecture reduces costs 12-15x vs pre-computing T3 for all pairs. T2 handles the majority of map views; T3 only fires on explicit user interest (bubble tap, wave send).

## Impact Map

If you change this system, also check:
- `docs/architecture/ai-profiling.md` — portrait generation is shared between profiling and matching pipelines
- `docs/architecture/status-matching.md` — status matching uses evaluateStatusMatch from this system
- `docs/architecture/queues-jobs.md` — all AI work runs through the shared BullMQ queue
- `docs/architecture/push-notifications.md` — ambient push cooldown affects notification delivery
- `docs/architecture/websockets-realtime.md` — analysisReady, statusMatchesReady, profileReady events
- `docs/architecture/user-profiles.md` — portrait, embedding, interests fields on profiles table
- `docs/architecture/waves-connections.md` — wave send triggers T3 promotion
- `apps/api/src/trpc/procedures/profiles.ts` — getNearbyUsersForMap ranking formula uses T1/T2/T3 scores
- `apps/api/src/trpc/procedures/waves.ts` — wave send calls promotePairAnalysis
- `apps/api/src/services/data-export.ts` — GDPR export includes connectionAnalyses data
