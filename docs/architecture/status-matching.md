# Status System & Ambient Matching

> v1 --- AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-10 — `status-matching` dedup switched from `jobId` to BullMQ `deduplication` (auto-release on failure), `statusMatchingFailed` WS event for self-healing (BLI-164).
> Updated 2026-04-19 — per-pair LLM eval split from parent Promise.all into `evaluate-status-match` child jobs. Parents handle fetch/embed/prefilter + DELETE (setter path), then fan out via `queue.addBulk`. Child performs one `evaluateStatusMatch` call + INSERT + WS event + ambient push. Staleness guard on setter path via `statusSetAt` snapshot in job payload (BLI-167).
> Updated 2026-04-19 — BLI-229: set-status UI reworked. Visibility chip-row → `Toggle` primitive (Prywatny ↔ Publiczny) with inline help text revealed by tapping `IconHelp` next to the label. UI default flipped from "no default, must pick" to `public` (most common case; one tap to switch to private). DB column stays nullable — no migration.
> Updated 2026-06-19 — BLI-289: **status public/private removed — status is always public.** Dropped `profiles.status_visibility` (migration 0033), `setStatusSchema.visibility`, the set-status Toggle, `isStatusPublic` (call sites now use `isStatusActive`), and the `getMyStatusMatches` reason redaction. The cosine pre-filter and `getById` no longer branch on visibility — every active status uses its status embedding and is shown. The "Privacy Rules" section below is reduced to the pulsing-bubble opacity (a bubble still never reveals status text/category). Supersedes the BLI-229 entry above.

## Terminology & Product Alignment

| PRODUCT.md term | Codebase term | Notes |
|---|---|---|
| Status "na teraz" | `currentStatus` field on `profiles` | Ephemeral intent, not a separate table |
| Pulsujaca banka (pulsing bubble) | `hasStatusMatch` flag in map response | Client-side rendering --- server returns boolean, mobile animates |
| Kategorie: Projekt/Networking/Randka/Luzne | `statusCategories` array | Values: `project`, `networking`, `dating`, `casual` |
| Ambient push | `sendAmbientPushWithCooldown` | 1h Redis cooldown per user |
| Matching server-side | `processStatusMatching` / `processProximityStatusMatching` / `processEvaluateStatusMatch` | Three BullMQ job types — two parents fan out to per-pair `evaluate-status-match` children (BLI-167) |
| Co nas laczy | `evaluateStatusMatch` + `analyzeConnection` | Status match uses the former, profile analysis uses the latter |
| Ping (in PRODUCT.md) | Wave (in code) | See `waves-connections.md` for full mapping |

## Status Model

**What:** Status is stored directly on the `profiles` table, not as a separate entity. Five fields define the full status state.

**Why:** A status is tightly coupled to the profile --- it's read on every nearby-users query and map render. Joining a separate table would add latency to the hottest read path.

**Config (profiles table columns):**

| Column | Type | Description |
|---|---|---|
| `currentStatus` | `text`, nullable | Free text, max 150 chars (validated by `setStatusSchema`) |
| `statusCategories` | `text[]`, nullable | 1-2 values from `["project", "networking", "dating", "casual"]` |
| `statusEmbedding` | `real[]`, nullable | OpenAI embedding vector for cosine pre-filtering |
| `statusSetAt` | `timestamp`, nullable | When the status was last set |
| `statusExpiresAt` | `timestamp`, nullable | Optional auto-expiry (not currently used in setStatus) |

## Setting a Status

**What:** `profiles.setStatus` mutation validates input, moderates content, updates six profile fields, and enqueues a matching job.

**Why:** Status changes trigger the entire matching pipeline --- embedding generation, candidate selection, LLM evaluation.

**Flow:**

1. **Content moderation** via `moderateContent(input.text)` --- AI filter rejects offensive content
2. **Profile update** --- sets `currentStatus`, `statusCategories`, `statusSetAt`, clears `statusExpiresAt`
3. **Enqueue matching** (only if `profile.isComplete`) --- `enqueueStatusMatching(userId)` adds a BullMQ job

**Config:** Embedding generation happens inside the queue worker (`processStatusMatching`), not during the mutation. This keeps the mutation fast.

## Clearing a Status

**What:** `profiles.clearStatus` nullifies all five status fields AND deletes all rows from `statusMatches` where the user is either `userId` or `matchedUserId`.

**Why:** A cleared status means all existing matches are stale. Deleting them ensures no pulsing bubbles remain on other users' maps.

## Matching Pipeline: processStatusMatching

Triggered when a user sets a new status. Three steps with progressive filtering.

### Step 1: Candidate Selection

**What:** Find nearby visible users within a ~5km bounding box.

**Config:**
- Bounding box: `NEARBY_RADIUS_DEG = 0.05` (~5km in latitude degrees)
- Filters: not self, not ninja, `isComplete = true`, has location, not soft-deleted
- No limit on candidate count at this stage

### Step 2: Cosine Pre-filter

**What:** Score each candidate by cosine similarity and take the top 20 above threshold 0.3.

**Why:** LLM calls are expensive. Cosine similarity is a cheap way to eliminate clearly non-matching pairs before calling GPT.

**Behavior:**
- If the candidate has an active status with a status embedding: compare the setting user's status embedding against the candidate's **status embedding**
- If the candidate has no status: compare against the candidate's **profile embedding** instead

**Config:** Top 20 candidates, similarity threshold > 0.3

### Step 3: LLM Evaluation (per-pair child jobs)

**What:** Parent fans out one `evaluate-status-match` child job per top-20 candidate via `queue.addBulk`. Each child runs a single `evaluateStatusMatch()` call in its own BullMQ job, with its own retry budget (3 attempts, exp backoff). The parent does not wait for children — `statusMatchesReady` fires per child on match.

**Two match types** (`matchedVia`):

| Match type | `otherContext` sent to LLM | When used |
|---|---|---|
| `status` | The candidate's `currentStatus` text + both `statusCategories` | Candidate has an active status |
| `profile` | Candidate's `bio + lookingFor` | Candidate has no status |

**Category awareness:** Both users' `statusCategories` arrays are passed to the LLM prompt. The prompt explicitly instructs: "osoby szukajace w roznych kontekstach (np. randka vs projekt) raczej sie nie uzupelniaja" (people searching in different contexts likely don't complement each other).

**Output:** `{ isMatch: boolean, reason: string }` where reason is max 60 chars in Polish.

### Step 4: Store & Notify

1. **Delete old matches (parent, before fan-out):** `DELETE FROM status_matches WHERE userId = ?` — full replace. Done in the parent so the setter's pulsing bubbles drop immediately for the old status; children only INSERT.
2. **Initial `statusMatchesReady` with empty list** (parent, after DELETE) — tells the client to drop stale bubbles while children are still evaluating.
3. **Child insert per match:** each `evaluate-status-match` child inserts one row via `INSERT ... ON CONFLICT DO NOTHING` when its LLM call returns `isMatch=true`.
4. **Child WebSocket + push:** each matching child fires `statusMatchesReady` for the setter with `matchedUserIds: [candidateUserId]` and calls `sendAmbientPushWithCooldown(userId)`. The 1h Redis cooldown collapses the fan-out into a single push per user per hour.

**Staleness guard:** The child payload carries the setter's `statusSetAt` at enqueue time. Before running the LLM, the child re-reads `profiles.statusSetAt` and skips silently if the setter has since set a new status — prevents old-batch children from inserting into `status_matches` under a newer status. The child dedup id embeds `statusSetAt` as an epoch suffix for the same reason.

## Matching Pipeline: processProximityStatusMatching

Triggered on location updates. Different from the status-setting pipeline in key ways.

**What:** When a user moves, check if any nearby users with active statuses are new match candidates.

**Why:** User A sets a status at home. User B walks into range 30 minutes later. Without proximity-triggered matching, B would never see A's pulsing bubble until A re-sets their status.

**Config:**
- Debounce: 2 minutes (BullMQ `debounce.ttl = ms("2m")`)
- Only fires if `!input.skipAnalysis` in `updateLocation`
- Candidate limit: 100 nearby users
- Cosine top-N: 10 (vs 20 for status-setting pipeline)
- Same similarity threshold: > 0.3

**Key differences from processStatusMatching:**

| Aspect | Status-setting | Proximity |
|---|---|---|
| Trigger | User sets/changes status | User location updates |
| Deletes old matches | Yes (full replace) | No (additive only) |
| Checks existing pairs | No | Yes --- skips already-matched pairs |
| Candidate limit | Unlimited (pre-filter: top 20) | 100 (pre-filter: top 10) |
| Match insertion | Unidirectional (`userId` --> `matchedUserId`) | Bidirectional (both directions) |
| Conflict handling | Replace all | `onConflictDoNothing` |

**Bidirectional insertion:** Proximity matching inserts both `(candidate --> movingUser)` and `(movingUser --> candidate)` so both users see the pulsing bubble. Status-setting matching only inserts `(settingUser --> matchedUser)` because the matched user's own matching job will catch the reverse direction.

## Privacy Rules

Status is always public (BLI-289), so there is no per-status visibility gate. The one remaining privacy property is the opacity of a pulsing bubble.

### What a pulsing bubble reveals

A pulsing bubble on the map tells the viewer: "There is a complementary match with this person." It does NOT reveal:
- What category the matched person's status is in
- What the matched person's status text says
- Whether the match was via status-to-status or status-to-profile

### getNearbyUsersForMap / getById / getMyStatusMatches

- `currentStatus` is returned whenever it's active (`isStatusActive`), for own and other profiles alike — no visibility branch.
- `hasStatusMatch` drives the pulsing animation, independent of status text.
- `getMyStatusMatches` always returns the actual LLM `reason` (no redaction).

## StatusMatches Table

**Config:**

| Column | Type | Description |
|---|---|---|
| `userId` | `text`, FK to user | The user who sees this match |
| `matchedUserId` | `text`, FK to user | The matched person |
| `reason` | `text` | LLM-generated reason (max ~80 chars) |
| `matchedVia` | `text` | `"status"` or `"profile"` |

- Unique constraint: `(userId, matchedUserId)` --- prevents duplicate match rows
- Indexes on both `userId` and `matchedUserId`

## isStatusActive Helper

`apps/api/src/lib/status.ts`:
- `isStatusActive(profile)` --- returns `true` if `currentStatus` is non-null/non-empty

Note: `statusExpiresAt` is defined in the schema but `isStatusActive` does not currently check it. Expiry is unused.

## Ambient Push Cooldown

**What:** `sendAmbientPushWithCooldown` uses a Redis key `ambient-push:{userId}` with TTL 3600 (1 hour). If the key exists, no push is sent.

**Why:** Prevents notification fatigue. Multiple matches appearing in quick succession (e.g., walking through a busy area) should not each trigger a separate push.

**Config:**
- Cooldown: 1 hour (3600s Redis TTL)
- Push content: contextual `"Ktoś {distance} m od Ciebie — {reason}"` (distance rounded to 100m, reason = the LLM match reason) when `processEvaluateStatusMatch` passes distance + reason (BLI-297); falls back to `"Ktoś z pasującym profilem jest w pobliżu"` when coordinates are missing
- Collapse ID: `ambient-match` (iOS collapse --- only latest notification shown)
- Data type: `ambient_match`

## Enqueue Configuration

| Job type | Dedup strategy | Debounce | Notes |
|---|---|---|---|
| `status-matching` (parent) | BullMQ `deduplication` with id `status-matching-{userId}` | None | Auto-releases on completion/failure — enables self-healing re-enqueue |
| `proximity-status-matching` (parent) | `jobId: proximity-status-{userId}-{timestamp}` | 2 min (`ttl: ms("2m")`) | Debounced --- rapid location updates don't flood |
| `evaluate-status-match` (child) | BullMQ `deduplication` with id `evaluate-status-match-{userId}-{candidateUserId}-{statusSetAt ?? "na"}` | None | `statusSetAt` suffix acts as an epoch — a new `setStatus` enqueues fresh children without colliding with the prior batch |

BullMQ queue: `ai` (shared with other AI job types after the BLI-171 queue split), concurrency 50, 3 attempts with exponential backoff (5s base).

## Impact Map

If you change this system, also check:

- **`apps/api/src/trpc/procedures/profiles.ts`** --- `setStatus`, `clearStatus`, `getMyStatusMatches`, `getNearbyUsersForMap` (hasStatusMatch flag), `getById`
- **`apps/api/src/lib/status.ts`** --- `isStatusActive` helper used across the codebase
- **`apps/api/src/services/ai.ts`** (`evaluateStatusMatch`) --- LLM prompt and response parsing
- **`apps/api/src/services/queue.ts`** --- both matching processors, ambient push helper
- **`apps/api/src/services/push.ts`** --- ambient push delivery
- **`packages/shared/src/validators.ts`** --- `setStatusSchema`, `STATUS_CATEGORIES`
- **`apps/api/src/db/schema.ts`** --- `profiles` (status columns), `statusMatches` table
- **`apps/mobile/`** --- pulsing bubble animation, status setting UI, match reason display
- **`docs/architecture/waves-connections.md`** --- status snapshots stored on wave accept
- **`docs/architecture/location-privacy.md`** --- proximity-triggered matching enqueue on location update
