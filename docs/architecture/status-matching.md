# Status System & Ambient Matching

> v1 --- AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-10 — `status-matching` dedup switched from `jobId` to BullMQ `deduplication` (auto-release on failure), `statusMatchingFailed` WS event for self-healing (BLI-164).
> Updated 2026-04-19 — per-pair LLM eval split from parent Promise.all into `evaluate-status-match` child jobs. Parents handle fetch/embed/prefilter + DELETE (setter path), then fan out via `queue.addBulk`. Child performs one `evaluateStatusMatch` call + INSERT + WS event + ambient push. Staleness guard on setter path via `statusSetAt` snapshot in job payload (BLI-167).

## Terminology & Product Alignment

| PRODUCT.md term | Codebase term | Notes |
|---|---|---|
| Status "na teraz" | `currentStatus` field on `profiles` | Ephemeral intent, not a separate table |
| Pulsujaca banka (pulsing bubble) | `hasStatusMatch` flag in map response | Client-side rendering --- server returns boolean, mobile animates |
| Kategorie: Projekt/Networking/Randka/Luzne | `statusCategories` array | Values: `project`, `networking`, `dating`, `casual` |
| Publiczny / Prywatny | `statusVisibility`: `public` / `private` | Per-status choice, mandatory, no default |
| Ambient push | `sendAmbientPushWithCooldown` | 1h Redis cooldown per user |
| Matching server-side | `processStatusMatching` / `processProximityStatusMatching` | Two BullMQ job types |
| Co nas laczy | `evaluateStatusMatch` + `analyzeConnection` | Status match uses the former, profile analysis uses the latter |
| Ping (in PRODUCT.md) | Wave (in code) | See `waves-connections.md` for full mapping |

## Status Model

**What:** Status is stored directly on the `profiles` table, not as a separate entity. Six fields define the full status state.

**Why:** A status is tightly coupled to the profile --- it's read on every nearby-users query and map render. Joining a separate table would add latency to the hottest read path.

**Config (profiles table columns):**

| Column | Type | Description |
|---|---|---|
| `currentStatus` | `text`, nullable | Free text, max 150 chars (validated by `setStatusSchema`) |
| `statusVisibility` | `text` (`public` / `private`), nullable | Mandatory choice per status, no default |
| `statusCategories` | `text[]`, nullable | 1-2 values from `["project", "networking", "dating", "casual"]` |
| `statusEmbedding` | `real[]`, nullable | OpenAI embedding vector for cosine pre-filtering |
| `statusSetAt` | `timestamp`, nullable | When the status was last set |
| `statusExpiresAt` | `timestamp`, nullable | Optional auto-expiry (not currently used in setStatus) |

## Setting a Status

**What:** `profiles.setStatus` mutation validates input, moderates content, updates six profile fields, and enqueues a matching job.

**Why:** Status changes trigger the entire matching pipeline --- embedding generation, candidate selection, LLM evaluation.

**Flow:**

1. **Content moderation** via `moderateContent(input.text)` --- AI filter rejects offensive content
2. **Profile update** --- sets `currentStatus`, `statusVisibility`, `statusCategories`, `statusSetAt`, clears `statusExpiresAt`
3. **Enqueue matching** (only if `profile.isComplete`) --- `enqueueStatusMatching(userId)` adds a BullMQ job

**Config:** Embedding generation happens inside the queue worker (`processStatusMatching`), not during the mutation. This keeps the mutation fast.

## Clearing a Status

**What:** `profiles.clearStatus` nullifies all six status fields AND deletes all rows from `statusMatches` where the user is either `userId` or `matchedUserId`.

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

**Privacy-critical behavior:**
- If the candidate has a **public** active status with a status embedding: compare the setting user's status embedding against the candidate's **status embedding**
- If the candidate has a **private** status OR no status: compare against the candidate's **profile embedding** instead
- Private status text NEVER enters the cosine comparison --- only the profile embedding is used

**Config:** Top 20 candidates, similarity threshold > 0.3

### Step 3: LLM Evaluation (per-pair child jobs)

**What:** Parent fans out one `evaluate-status-match` child job per top-20 candidate via `queue.addBulk`. Each child runs a single `evaluateStatusMatch()` call in its own BullMQ job, with its own retry budget (3 attempts, exp backoff). The parent does not wait for children — `statusMatchesReady` fires per child on match.

**Two match types:**

| Match type | `otherContext` sent to LLM | When used |
|---|---|---|
| `status` | The candidate's `currentStatus` text + both `statusCategories` | Candidate has public active status |
| `profile` | Candidate's `bio + lookingFor` | Candidate has private status or no status |

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

**THE MOST CRITICAL SECTION.** Private statuses must never leak.

### What a pulsing bubble reveals

A pulsing bubble on the map tells the viewer: "There is a complementary match with this person." It does NOT reveal:
- What category the matched person's status is in
- What the matched person's status text says
- Whether the match was via status-to-status or status-to-profile

### Status visibility in getNearbyUsersForMap

The map endpoint applies visibility rules before returning data:

- `isStatusPublic(profile)` returns `true` only if the profile has an active status AND `statusVisibility !== "private"`
- If the status is private, `currentStatus` is returned as `null` to the client
- The `hasStatusMatch` boolean is returned regardless of visibility --- it controls the pulsing animation

### Match reason redaction in getMyStatusMatches

When a user fetches their status matches, the reason text is redacted for private statuses:

- If `matchedUser.statusVisibility === "private"`: reason is replaced with the generic string "Na podstawie profilu" (Based on profile)
- If public: the actual LLM-generated reason is returned

### AI prompt safeguards

The `evaluateStatusMatch` function receives different context based on privacy:
- Public status: the actual status text
- Private status: only `bio + lookingFor` from the profile

The LLM never sees private status text. Even if the LLM somehow infers intent from the profile, the reason is redacted on output for private statuses.

### getById profile endpoint

When fetching another user's profile, `profiles.getById` applies:
- Own profile: shows status if active (any visibility)
- Other user's profile: shows status only if `isStatusPublic()` returns true
- `statusVisibility` field is returned only for own profile, `null` for others

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
- `isStatusPublic(profile)` --- returns `true` if active AND `statusVisibility !== "private"`

Note: `statusExpiresAt` is defined in the schema but `isStatusActive` does not currently check it. Expiry is unused.

## Ambient Push Cooldown

**What:** `sendAmbientPushWithCooldown` uses a Redis key `ambient-push:{userId}` with TTL 3600 (1 hour). If the key exists, no push is sent.

**Why:** Prevents notification fatigue. Multiple matches appearing in quick succession (e.g., walking through a busy area) should not each trigger a separate push.

**Config:**
- Cooldown: 1 hour (3600s Redis TTL)
- Push content: "Ktos z pasujacym profilem jest w poblizu"
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

- **`apps/api/src/trpc/procedures/profiles.ts`** --- `setStatus`, `clearStatus`, `getMyStatusMatches`, `getNearbyUsersForMap` (hasStatusMatch flag), `getById` (status visibility)
- **`apps/api/src/lib/status.ts`** --- `isStatusActive`, `isStatusPublic` helpers used across the codebase
- **`apps/api/src/services/ai.ts`** (`evaluateStatusMatch`) --- LLM prompt and response parsing
- **`apps/api/src/services/queue.ts`** --- both matching processors, ambient push helper
- **`apps/api/src/services/push.ts`** --- ambient push delivery
- **`packages/shared/src/validators.ts`** --- `setStatusSchema`, `STATUS_CATEGORIES`
- **`apps/api/src/db/schema.ts`** --- `profiles` (status columns), `statusMatches` table
- **`apps/mobile/`** --- pulsing bubble animation, status setting UI, match reason display
- **`docs/architecture/waves-connections.md`** --- status snapshots stored on wave accept
- **`docs/architecture/location-privacy.md`** --- proximity-triggered matching enqueue on location update
