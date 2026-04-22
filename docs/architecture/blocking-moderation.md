# Blocking & Content Moderation

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-22 — Image moderation on upload via `omni-moderation-latest` (BLI-268). First-line filter before anything lands in S3; pairs with the BLI-68 quarantine as the preservation layer.

Source: `apps/api/src/services/moderation.ts`, `apps/api/src/trpc/procedures/waves.ts` (block/unblock/getBlocked), `apps/api/src/trpc/procedures/profiles.ts` (block filtering in nearby queries), `apps/api/src/db/schema.ts`.

## Terminology & Product Alignment

| PRODUCT.md term | Code term | UI (Polish) |
|-----------------|-----------|-------------|
| Blokowanie | `blocks` table, `waves.block` mutation | "Zablokuj" button |
| Raportowanie (spam/nękanie/nieodpowiednie) | Not implemented | -- |
| Eskalacja automatyczna (2/5/10 zgłoszeń) | Not implemented | -- |
| Moderacja treści (AI) | `moderateContent()` via OpenAI Moderation API | Error toast on flagged content |
| Zablokowane osoby | `waves.getBlocked` query | Settings > "Zablokowani" list |

---

## Block Model

**What:** The `blocks` table records one-directional block relationships. A blocks B creates one row. The effect is bidirectional in queries (neither sees the other).

**Why one-directional storage with bidirectional effect:** A blocks B means A doesn't want to interact with B. For safety, B also shouldn't see A — if B could still see and wave at A, the block provides incomplete protection.

**Config — blocks table:**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | Block identifier |
| `blockerId` | text FK → user | Who initiated the block |
| `blockedId` | text FK → user | Who was blocked |
| `createdAt` | timestamp | When block was created |

Indexes: `blocks_blocker_idx` (blockerId), `blocks_blocked_idx` (blockedId).

No unique constraint on (blockerId, blockedId) — duplicate prevention is done in application code via `existingBlock` check before insert.

---

## Block Mutation (`waves.block`)

**What:** Creates a block row and auto-declines any pending waves from the blocked user — atomically in one transaction.

**Why atomic with wave decline:** If A blocks B while B has a pending wave to A, leaving the wave pending would be confusing. The block should immediately clean up any in-flight interactions.

**Config:**
- Input: `blockUserSchema` — `{ userId: string }`
- Duplicate check: returns CONFLICT if block already exists
- Transaction: insert block + update all pending waves from blocked user to `status = 'declined'`

---

## Unblock Mutation (`waves.unblock`)

**What:** Hard-deletes the block row. No side effects — previously blocked user can now send waves again, appear in nearby, etc.

**Config:** Simple DELETE query, no transaction needed. No notification sent to the unblocked user.

---

## Blocked Users List (`waves.getBlocked`)

**What:** Returns all users blocked by the current user, with display name, avatar, and block timestamp.

**Config:** INNER JOIN to profiles and user tables. Filters out soft-deleted users (`user.deletedAt IS NULL`).

---

## All Effects of Blocking

Every query that surfaces users to other users checks the blocks table. Here is the complete list of places where blocks are enforced:

#### 1. Nearby users — `profiles.getNearby`
**Where:** `apps/api/src/trpc/procedures/profiles.ts`, getNearby query.
**How:** Two parallel queries fetch `blockedId` (users I blocked) and `blockerId` (users who blocked me). Results merged into a `Set<string>`. After the nearby query returns, blocked users are filtered out in a loop. Extra rows fetched (`limit + allBlockedIds.size`) to compensate for filtered results.
**Note:** This is in-memory filtering, not a SQL JOIN or subquery.

#### 2. Nearby users for map — `profiles.getNearbyUsersForMap`
**Where:** `apps/api/src/trpc/procedures/profiles.ts`, getNearbyUsersForMap query.
**How:** Same pattern as getNearby — two queries for blocked/blockedBy, merged into a Set, post-query filtering. Additionally includes `cooldownDeclines` (users who declined within DECLINE_COOLDOWN_HOURS) in the exclusion set.

#### 3. Sending waves — `waves.send`
**Where:** `apps/api/src/trpc/procedures/waves.ts`, send mutation.
**How:** Single `findFirst` query on blocks table checking both directions (`OR` clause: I blocked them, or they blocked me). If any block exists, returns FORBIDDEN "Cannot send wave to this user".

#### 4. Wave lists — `waves.getReceived`, `waves.getSent`
**Where:** `apps/api/src/trpc/procedures/waves.ts`.
**How:** No explicit block check. Blocked users' waves still appear in history if they were sent before the block. However, since blocks prevent new waves (point 3), this only affects historical data.

#### Places where blocks are NOT checked (gaps)

| Feature | File | Status |
|---------|------|--------|
| Messages (send, getMessages) | `messages.ts` | No block check. Blocked users in the same DM can still send messages. The DM was created before the block, and no send-time verification exists. |
| Group member operations | `groups.ts` | No block check. Blocked users can be in the same group, see each other in group member lists, and exchange messages in group chat. |
| Group discovery | `groups.ts` getDiscoverable | No block check. Blocked users' groups appear in discovery results. |
| Status matching | Queue workers | Not verified — status matching may surface blocked users as matches. |

---

## Content Moderation

**What:** `moderateContent(text)` calls the OpenAI Moderation API to check text for policy violations before saving.

**Why pre-save, not post-save:** Rejecting content before it's written to the database means flagged content never enters the system. No need for retroactive cleanup or content hiding.

**Config:**
- API endpoint: `https://api.openai.com/v1/moderations`
- Auth: `OPENAI_API_KEY` environment variable
- Input: concatenated text fields (e.g., displayName + bio + lookingFor joined by `\n\n`)
- On flag: throws `TRPCError` with code `BAD_REQUEST` and `message: JSON.stringify({ error: "CONTENT_MODERATED" })`. The message is a JSON-encoded error code rather than a human-readable string so the mobile client can dispatch on `error === "CONTENT_MODERATED"` and render its own localized toast (avoids duplicating Polish copy across server and client, and keeps the door open for future i18n).

#### Graceful degradation
**What:** If `OPENAI_API_KEY` is not set, moderation is silently skipped (function returns immediately). If the API returns a non-200 response, the error is logged and the function returns without throwing.

**Why:** Moderation is a safety layer, not a critical path. Users should not be blocked from posting because OpenAI is down. The risk of letting through occasional flagged content during an outage is lower than the risk of making the entire app unusable.

#### Categories flagged
OpenAI's Moderation API returns `categories` object with boolean flags for: `sexual`, `hate`, `harassment`, `self-harm`, `sexual/minors`, `hate/threatening`, `violence/graphic`, `self-harm/intent`, `self-harm/instructions`, `harassment/threatening`, `violence`. Any `true` value triggers rejection.

Flagged categories are logged to console: `[moderation] Content flagged: harassment, violence`.

## Image Moderation (uploads)

**What:** `moderateImage(bytes, mimeType)` in `apps/api/src/services/moderation.ts` scans every uploaded image via OpenAI's `omni-moderation-latest` and returns `{ flagged, categories, scores }`. `POST /uploads` then decides how to react based on which categories tripped.

**Why hybrid (sync block + async review):** blocking every flag synchronously would reject false positives (art, fitness photos, stylized graphics) with no appeal path — bad UX and nothing for an admin to overturn. Allowing everything and relying on post-hoc reports lets CSAM sit live for minutes — legally unacceptable. The split:

1. **CSAM → synchronous hard block.** If `sexual/minors` is tripped, the bytes are discarded, the uploader sees `400 { error: "CONTENT_MODERATED" }`, and a metadata-only row is written to `moderation_results` (no `upload_key` — no image in S3). `shouldHardBlock()` owns the category list; today that's just `sexual/minors`.
2. **Other flags → allow + queue.** Nudity, violence, harassment, hate etc. allow the upload to proceed normally but write a row to `moderation_results` with the S3 key, scores, and `status: "flagged_review"`. Admin reviews via BLI-269 UI and decides OK / remove.
3. **Clean → no row.** Clean uploads produce no DB write; the table is admin-review + legal audit only.

**Why BLI-68 quarantine is still the right preservation layer for what slips through:** OpenAI has false negatives. If content passes moderation but a user later reports it, the uploader may have already swapped the avatar — that's when the `quarantine/` lifecycle saves the evidence.

**Config:**
- Endpoint: `https://api.openai.com/v1/moderations` (shared with text moderation)
- Model: `omni-moderation-latest` (multimodal — pass `model` + array `input`)
- Input: base64 data URL (`data:<mime>;base64,...`) inside `{ type: "image_url", image_url: { url } }`
- Return shape: `{ flagged: boolean; categories: string[]; scores: Record<string, number> }` — plain object, **does not throw** (the Hono upload route owns its response shape)

**Graceful degradation:** same policy as text moderation. Missing key → empty result, skip. API non-200 → log + skip. A moderation outage must not block uploads.

**Flagged logging:** `console.warn("[moderation] Image flagged: sexual/minors, violence/graphic")`.

**moderation_results table:** see `database.md`. Preserved on account anonymization with `user_id` nulled out — legal audit trail outlives the user, same pattern as `blocks`.

---

## Where Moderation Is Called

Complete list of every trigger point in the codebase:

#### profiles.ts
| Endpoint | What's moderated |
|----------|-----------------|
| `profiles.create` | displayName + bio + lookingFor (concatenated) |
| `profiles.update` | Only changed fields among displayName, bio, lookingFor, superpower (if none changed, moderation skipped) |
| `profiles.setStatus` | Status text |

#### profiling.ts (AI Q&A profiling)
| Endpoint | What's moderated |
|----------|-----------------|
| `profiling.answer` | Individual Q&A answer |
| `profiling.requestMoreQuestions` | Direction hint (if provided) |
| `profiling.applyProfiling` | displayName + generated bio + generated lookingFor |
| `profiling.submitOnboarding` | All answers concatenated |
| `profiling.answerFollowUp` | Follow-up answer |
| `profiling.createGhostProfile` | Display name |

#### messages.ts
| Endpoint | What's moderated |
|----------|-----------------|
| `messages.send` | Text message content (skipped for image/location types) |

#### index.ts (Hono routes)
| Endpoint | What's moderated |
|----------|-----------------|
| `POST /uploads` | Image bytes via `moderateImage()`. Covers avatars today and any future upload consumer (chat images, group photos) — the gate sits on the endpoint, not on individual call-sites. |

#### NOT moderated (gaps vs PRODUCT.md)
| Content | Where | PRODUCT.md says |
|---------|-------|-----------------|
| Group names | `groups.create`, `groups.update` | "Automatyczny filtr (AI) przy każdym zapisie: ... nazwa grupy" |
| Group descriptions | `groups.create`, `groups.update` | Implied by "każdym zapisie" |
| Topic names | `topics.create`, `topics.update` | Implied |

---

## Product Vision vs Implementation

PRODUCT.md describes a full report/escalation system that is **planned but not implemented**:

#### Report system (not built)
- Report categories: spam, inappropriate behavior, harassment
- Each user can report another user

#### Auto-escalation thresholds (not built)
| Reports | Consequence |
|---------|-------------|
| 2 reports total | 1-day account suspension |
| 5 reports total | 7-day suspension + email notification |
| 10 reports total | Permanent ban |
| 2 harassment reports from different users | 7-day suspension |
| 3 harassment reports from different users | Permanent ban |

#### Content hiding (not built)
- 2 content reports → automatic content hiding (content invisible to others until manual review)

#### Current state
Only the AI-powered pre-save moderation is implemented. There is no report button in the UI, no report storage in the database, no escalation logic, and no suspension mechanism. Users who encounter problematic content can only block the user.

---

## Blocking + Moderation Interaction

Blocking and moderation are independent systems with no interaction:
- Blocking is user-initiated, moderation is automatic
- A blocked user's existing content is not moderated or hidden
- Moderation does not trigger blocks
- There is no "n blocks from different users = auto-ban" logic

---

## Impact Map

If you change this system, also check:
- **`apps/api/src/trpc/procedures/profiles.ts`** — nearby queries use block filtering; profile create/update calls moderateContent
- **`apps/api/src/trpc/procedures/waves.ts`** — wave send checks blocks; block/unblock/getBlocked endpoints live here
- **`apps/api/src/trpc/procedures/profiling.ts`** — profiling Q&A answers and generated profiles call moderateContent
- **`apps/api/src/trpc/procedures/messages.ts`** — currently has NO block check and NO moderation (gap)
- **`apps/api/src/trpc/procedures/groups.ts`** — currently has NO block check and NO moderation (gap)
- **`apps/api/src/db/schema.ts`** — `blocks` table definition
- **`packages/shared/src/validators.ts`** — `blockUserSchema`
- **`apps/api/src/services/data-export.ts`** — GDPR export should include blocks (user's own blocks)
- **`apps/mobile/src/screens/settings/`** — blocked users list UI, unblock action
- **`PRODUCT.md` § Safety** — the source of truth for the full vision (report system, escalation, content hiding)
