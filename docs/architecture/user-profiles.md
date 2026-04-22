# User Profiles & Visibility

> v1 --- AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-22 — `profiles.getById` now returns `isSuspended: boolean` on the payload (soft-deleted users still return `null`). `groups.getMembers` exposes the same flag per row. `messages.getConversations` adds `participant.isSuspended` for DM peers. See `moderation-suspension.md` (BLI-156).
> Updated 2026-04-11 — `getDetailedAnalysis` zyskał block + isComplete + soft-delete gate; `ensureAnalysis` dostał ten sam zestaw bramek z silent no-op fallbackiem; `getConnectionAnalysis` usunięty jako dead code (wszystkie jego funkcje pokrywa teraz `getDetailedAnalysis` z promocją T3) (BLI-188).
> Updated 2026-04-18 — Portrait section removed from mobile UI (onboarding + settings review screens); portrait is now purely internal. `portraitSharedForMatching` dropped from the `applyProfilingSchema` validator and no longer touched by `applyProfile` — DB default (`true`) handles inserts, existing rows backfilled to `true`, re-profiling keeps the existing value. Column retained as audit-only (BLI-199).
> Updated 2026-04-19 — Source path corrected to `packages/db/src/schema.ts`. Field reference row for `portraitSharedForMatching` now shows correct default (`true`). BLI-235 removed the "finish profile" CTA from the Profil tab; the only in-app entry point to re-run onboarding is Ustawienia → Profilowanie.

Source: `packages/db/src/schema.ts`, `apps/api/src/trpc/procedures/profiles.ts`, `packages/shared/src/validators.ts`, `apps/api/src/services/ai.ts`, `apps/api/src/trpc/middleware/featureGate.ts`. (Canonical schema lives in `@repo/db`; `apps/api/src/db/schema.ts` is a re-export shim.)

## Terminology & Product Alignment

| PRODUCT.md term | Code term | UI (Polish) |
|-----------------|-----------|-------------|
| Ping | Wave (`waves` table, `sendWaveSchema`) | Ping |
| Banka na mapie | Nearby user (grid-snapped position) | Banka |
| Status "na teraz" | `currentStatus` + `statusVisibility` + `statusCategories` | Status |
| Co nas laczy | `connectionAnalyses.shortSnippet` / `longDescription` | Co nas laczy |
| Nie przeszkadzac | `doNotDisturb` boolean | Nie przeszkadzac |
| Semi-Open | `semi_open` | Semi-Open |
| Full Nomad | `full_nomad` | Full Nomad |
| Ninja | `ninja` | Ninja |
| Superpower / "Co moge dac" | `superpower` + `superpowerTags` + `offerType` | Superpower |
| Portret osobowosci | `portrait` (text, NOT image) | Portret |
| Verified badge | Not implemented | --- |
| Znajomi | Not implemented (friends system planned) | --- |

## Profile Model

One profile per user. `profiles.userId` is a unique FK to `user.id` with `ON DELETE CASCADE`. Created during onboarding via `profiling.applyProfile` (sets `isComplete: true`) or via `profiles.create` (leaves `isComplete: false` until AI pipeline finishes).

### Complete Field Reference

| Column | Postgres type | Nullable | Default | Purpose |
|--------|--------------|----------|---------|---------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `userId` | text | no | --- | FK to `user.id`, unique. One profile per auth user |
| `displayName` | varchar(50) | no | --- | User-chosen name. Locked after 5-min grace period (see below) |
| `avatarUrl` | text | yes | null | Profile photo URL. Seeded from OAuth provider's `user.image` on create |
| `bio` | text | no | --- | "Kim jestem" --- AI-generated from profiling Q&A, user-editable. Min 10, max 500 chars |
| `lookingFor` | text | no | --- | "Kogo szukam" --- AI-generated, user-editable. Min 10, max 500 chars |
| `socialLinks` | jsonb | yes | null | `{ facebook?: string, linkedin?: string }` --- usernames, not full URLs. Visible after ping acceptance per PRODUCT.md |
| `visibilityMode` | text | no | `'semi_open'` | `'ninja'` / `'semi_open'` / `'full_nomad'` --- controls map presence and ping ability |
| `doNotDisturb` | boolean | no | `false` | Suppresses push notifications. Independent from visibility mode |
| `superpower` | text | yes | null | Free-text "what I can offer" (max 300 chars). Fed to AI matching prompts |
| `superpowerTags` | text[] | yes | null | AI-extracted tags from superpower text. Column exists in schema but not populated by current code --- reserved for future use |
| `offerType` | text | yes | null | `'volunteer'` / `'exchange'` / `'gig'` --- how user wants to offer their superpower |
| `interests` | text[] | yes | null | 8-12 AI-extracted tags from portrait (Polish, lowercase). Used for interest overlap scoring |
| `embedding` | real[] | yes | null | `text-embedding-3-small` vector of the portrait. Used for cosine similarity pre-filtering |
| `portrait` | text | yes | null | AI-generated rich social profile (200-300 words). NOT an image (see Portrait section) |
| `portraitSharedForMatching` | boolean | no | `true` | Historical consent flag. Default flipped from `false` to `true` by migration 0023 (BLI-199). No longer written by `applyProfile` or referenced by validators; retained as audit-only, slated for removal. |
| `isComplete` | boolean | no | `false` | Gates access to discovery, matching, and status features. Set `true` when profiling session is applied |
| `currentStatus` | text | yes | null | Active "na teraz" status text (max 150 chars). Null means no active status |
| `statusExpiresAt` | timestamp | yes | null | Optional auto-expiry. Currently set to null on every `setStatus` call (no expiry logic active) |
| `statusEmbedding` | real[] | yes | null | Embedding vector of `currentStatus` text. Generated by status matching worker for cosine pre-filtering |
| `statusSetAt` | timestamp | yes | null | When status was last set. Cleared on `clearStatus` |
| `statusVisibility` | text | yes | null | `'public'` / `'private'` --- mandatory choice per status, no default. Null when no status active |
| `statusCategories` | text[] | yes | null | 1-2 categories from `['project', 'networking', 'dating', 'casual']`. Passed to LLM evaluation for cross-category filtering |
| `dateOfBirth` | timestamp | yes | null | For age display/verification. Column exists but not enforced at signup |
| `latitude` | real | yes | null | Last known latitude. Updated by `updateLocation` mutation |
| `longitude` | real | yes | null | Last known longitude |
| `lastLocationUpdate` | timestamp | yes | null | When location was last updated |
| `createdAt` | timestamp | no | `now()` | Profile creation time. Also used for display name grace period calculation |
| `updatedAt` | timestamp | no | `now()` | Last modification time |

#### Indexes

| Name | Columns | Purpose |
|------|---------|---------|
| `profiles_user_id_idx` | `userId` | Fast lookup by auth user |
| `profiles_location_idx` | `(latitude, longitude)` | Bounding-box geo queries in `getNearbyUsers` / `getNearbyUsersForMap` |

## Visibility Modes

**What:** Three modes control whether a user appears on the map and can send/receive pings. Stored as `visibilityMode` enum string.

**Why three modes:** PRODUCT.md defines a spectrum from full privacy (Ninja) to maximum openness (Full Nomad). Semi-Open is the sensible default --- visible but not broadcasting eagerness. Full Nomad adds an AI behavioral nudge toward direct contact.

**Config:** Default is `semi_open`. Changed via `profiles.update` mutation (validated by `updateProfileSchema`).

| Mode | `visibilityMode` value | Appears in nearby queries | Can send pings | Can receive pings | AI behavior |
|------|----------------------|--------------------------|---------------|-------------------|-------------|
| Ninja | `ninja` | No (filtered by `ne(visibilityMode, 'ninja')`) | No (PRODUCT.md: prompted to switch) | No | --- |
| Semi-Open | `semi_open` | Yes | Yes | Yes | Standard |
| Full Nomad | `full_nomad` | Yes | Yes | Yes | Encourages direct approach |

**Server-side enforcement:** Every nearby query (`getNearbyUsers`, `getNearbyUsersForMap`, `updateLocation` broadcast, status matching, pair analysis, proximity matching) includes `ne(schema.profiles.visibilityMode, 'ninja')` in its WHERE clause. Ninja users are invisible to all discovery paths.

**Client-side enforcement:** Ninja users cannot send pings. PRODUCT.md specifies the app should prompt them to switch to Semi-Open first. The server-side `featureGate` on `waves.send` requires `isComplete` but does not separately check visibility mode --- the client handles the ninja prompt.

## Do Not Disturb (DND)

**What:** `doNotDisturb` boolean, independent from visibility mode. A Semi-Open user with DND on still appears on the map and can receive pings --- but push notifications are suppressed.

**Why separate from visibility:** PRODUCT.md explicitly separates these concerns. A user may want to remain discoverable (visible on map, pings arrive) but not be interrupted with sounds/vibrations. DND is a notification preference, not a discovery toggle.

**Server-side behavior:**
- `sendPushToUser()` in `apps/api/src/services/push.ts` checks `doNotDisturb` early and returns without sending if `true`
- Pings and messages still persist in the database --- the user sees them when they next open the app
- DND icon is visible to others on the map per PRODUCT.md

**Config:** Toggled via `profiles.update` with `doNotDisturb: boolean` in the input schema.

## Status System ("Na Teraz")

**What:** Ephemeral free-text status reflecting what the user is looking for right now. Described extensively in `status-matching.md`.

**Why:** Core product differentiator --- turns physical proximity into actionable intent. Unlike profile-level matching (static, deep), status matching is situational and real-time.

**Fields:**

| Field | Type | Config |
|-------|------|--------|
| `currentStatus` | text | Max 150 chars. Content-moderated before save. Null = no active status |
| `statusVisibility` | `'public'` / `'private'` | Mandatory per-status choice (no default, enforced by `setStatusSchema`). Public: visible on profile tap. Private: hidden, server-side matching only |
| `statusCategories` | text[] | 1-2 from `['project', 'networking', 'dating', 'casual']`. Passed to LLM as context, reduces cross-category false positives |
| `statusEmbedding` | real[] | Auto-generated by status matching worker. Used for cosine pre-filtering before LLM evaluation |
| `statusSetAt` | timestamp | Set on `setStatus`, cleared on `clearStatus` |
| `statusExpiresAt` | timestamp | Set to `null` on every `setStatus` call. Column exists for future auto-expiry but currently unused |

**Visibility rules (code path in `profiles.getById`):**
- Own profile: shows status if `isStatusActive(profile)` --- i.e. `currentStatus !== null`
- Other profiles: shows status only if `isStatusPublic(profile)` --- i.e. active AND `statusVisibility !== 'private'`
- `getMyStatusMatches`: if matched user's status is private, the `reason` is replaced with generic "Na podstawie profilu" to avoid leaking private status content

**`clearStatus` side effects:** Nullifies all status fields (`currentStatus`, `statusExpiresAt`, `statusEmbedding`, `statusVisibility`, `statusCategories`, `statusSetAt`) AND deletes all status matches involving the user from `statusMatches` table.

**`setStatus` side effects:** If profile `isComplete`, enqueues status matching job (`enqueueStatusMatching`). See `status-matching.md` for the full pipeline.

## Superpower ("Co Moge Dac")

**What:** Free-text field describing what the user can offer others. Accompanied by `offerType` enum and `superpowerTags` array.

**Why:** PRODUCT.md's onboarding Step 2 --- "W czym mozesz komus pomoc od reki?" Creates asymmetric matching opportunities: one user's superpower can fulfill another's `lookingFor`.

**Config:**

| Field | Validation | Notes |
|-------|-----------|-------|
| `superpower` | max 300 chars via `updateProfileSchema` | Free text, set via `profiles.update`. Fed to AI matching prompts (`analyzeConnection`, `quickScore`) as "Moze zaoferowac:" |
| `offerType` | `'volunteer'` / `'exchange'` / `'gig'` | How the user wants to offer. PRODUCT.md maps these to "wolontariat / wymiana skilli / potencjalne zlecenie" |
| `superpowerTags` | text[] | Column exists in schema. Not populated by any current code path. Reserved for AI tag extraction (like `interests` is for portrait) |

**AI integration:** Both `analyzeConnection` and `quickScore` in `ai.ts` append `\nMoze zaoferowac: ${superpower}` to profile context when superpower is set. This means superpower content directly influences match scores and "Co nas laczy" descriptions.

## Profile Completeness

**What:** `isComplete` boolean flag. Default `false`.

**Why:** Prevents half-built profiles from appearing in discovery and polluting AI matching results. A profile without a portrait has no embedding, no interests --- matching would produce garbage.

**When set to `true`:** Only in one code path: `profiling.applyProfile` mutation. This runs after the profiling Q&A session is completed and the user confirms their generated bio/lookingFor/portrait.

**Consequences of `isComplete: false`:**

| System | Behavior | Enforcement location |
|--------|----------|---------------------|
| Nearby discovery (map) | Not filtered by `isComplete` directly --- but profiles without `portrait` or `embedding` produce null similarity scores | `profiles.getNearbyUsers`, `getNearbyUsersForMap` |
| Pair analysis (T3) | Skipped: "incomplete profile" | `queue.ts` line 193, 332 |
| Status matching | Skipped | `queue.ts` line 599, 617, 722, 759 |
| Proximity status matching | Skipped | `queue.ts` line 476 |
| Connection analysis fetch | Returns `null` | `profiles.getDetailedAnalysis` |
| Feature-gated endpoints | Blocked with `FORBIDDEN` | `featureGate.ts` middleware |

## Feature Gates (ABAC)

**What:** The `featureGates` table implements simplified Attribute-Based Access Control. Each row defines a feature name, a list of required profile attributes, and an enabled flag.

**Table schema:**

| Column | Type | Purpose |
|--------|------|---------|
| `feature` | text (PK) | Feature identifier, e.g. `'waves.send'`, `'groups.create'` |
| `requires` | text[] | Profile attributes that must be truthy, e.g. `['isComplete']` |
| `enabled` | boolean | Master switch. If `false`, gate is bypassed (feature open to all) |

**How it works:** The `featureGate(featureName)` middleware (in `apps/api/src/trpc/middleware/featureGate.ts`):
1. Loads all gates into an in-memory cache (TTL: 60 seconds)
2. If gate is disabled or not found, passes through
3. Otherwise, fetches the user's profile and checks each required attribute
4. Currently only `isComplete` is checked as a profile attribute

**Currently gated features:**

| Feature | Gate | Endpoint |
|---------|------|----------|
| `waves.send` | `isComplete` required | `waves.send` |
| `waves.respond` | `isComplete` required | `waves.respond` |
| `groups.create` | `isComplete` required | `groups.create` |
| `groups.joinDiscoverable` | `isComplete` required | `groups.joinDiscoverable` |

**Config:** Gates are database rows, not code constants. Can be toggled or reconfigured without a deploy. Cache refreshes every 60 seconds.

## Ghost Mode Avatar Blur

**What:** When the current user's profile is a "ghost" (ghost = no `portrait`, no `bio` — signup complete but profiling not done), every other user's avatar visible to them is rendered with a blur. The user's own avatar is never blurred.

**Why:** Progressive disclosure. Ghosts haven't shared anything about themselves yet, so they don't get to see other people's faces sharply either. Once they complete the profiling Q&A and gain a portrait, the blur lifts everywhere.

**Client-side only:** The blur is applied via `blurred` prop on `Avatar`, fed by the `useIsGhost()` hook. Implemented in `apps/mobile/src/components/ui/Avatar.tsx` with `blurRadius={theme.ghostBlurRadius}` from `apps/mobile/src/theme.ts`. Call sites: `UserRow`, `GroupRow`, `GridClusterMarker`/`GroupMarker`, `NotificationToast`, `ConversationRow`, `MessageBubble`. No server-side effect — avatar URLs are unchanged.

**Impact:** Changes to the ghost-detection hook or the blur radius ripple to all 6 call sites simultaneously. Adding a new avatar surface → also wire it to `useIsGhost()`.

## Display Name Lock

**What:** Display name becomes immutable 5 minutes after profile creation.

**Why:** Prevents display name abuse (set a name to get someone's attention, then change it). The 5-minute grace period allows fixing typos immediately after onboarding. After that, the name is permanent.

**Config:** Grace period = `5 * 60 * 1000` ms (5 minutes), hardcoded in `profiles.update`.

**Enforcement:** When `profiles.update` receives a `displayName` field:
1. Fetches current profile's `displayName` and `createdAt`
2. Calculates `graceExpired = Date.now() - createdAt > 5 min`
3. If grace expired AND new name differs from current: throws `FORBIDDEN` with message `display_name_locked`
4. If within grace period: update proceeds normally

**Validation:** Display name is 2-50 chars (`z.string().min(2).max(50)`). Content-moderated via `moderateContent()` on every update.

## Portrait (AI-Generated Text)

**What:** A 200-300 word rich social profile generated by AI from the user's `bio` and `lookingFor`. Stored as plain text in `profiles.portrait`. This is NOT an image --- it is a narrative description of the person.

**Why text, not image:** The portrait serves as input to downstream AI systems. Both `analyzeConnection` and `quickScore` receive the portrait text as their primary context for generating match scores and "Co nas laczy" descriptions. A text portrait enables semantic understanding that an image cannot.

**Generation:** `generatePortrait()` in `apps/api/src/services/ai.ts` uses GPT with this system prompt:
- Describe who the person is: interests, hobbies, lifestyle, personality
- Resolve vague "lookingFor" statements into concrete traits based on the bio
- 3rd person, natural Polish, flowing prose (no headers, no lists)
- **Privacy rule:** NEVER mention current status or "na teraz" intentions --- these are private

**User-facing behavior:**
- Portrait is **never shown to the user inside the app**. The onboarding and settings profile-review screens display only `bio` and `lookingFor`; the generated portrait is applied silently in the background.
- The user can still retrieve their portrait via GDPR data-export (`data-export.ts` maps `profile.portrait` to the `portraitUrl` field in the export payload). Privacy policy (`apps/website/src/routes/privacy.tsx`) discloses that an internal AI-generated personality description exists.
- Rationale: the portrait is intentionally "honest, not flattering" (see `ai-profiling.md`). Surfacing it in-app would invite churn without improving matching quality.

**Privacy controls:**
- `portraitSharedForMatching` boolean: historical consent flag, default `true` since BLI-199. No functional effect — `analyzeConnection` and `quickScore` always receive the portrait if it exists. Column is no longer referenced by `applyProfile` or any validator; retained as audit-only, slated for removal in a future ticket.
- Portrait is regenerated when `bio` or `lookingFor` changes (via `enqueueProfileAI`)

**Downstream consumers of portrait:**
- `generateEmbedding(portrait)` --- produces the `embedding` vector for cosine similarity
- `extractInterests(portrait)` --- produces 8-12 interest tags
- `analyzeConnection()` --- full T3 bidirectional analysis
- `quickScore()` --- lightweight T2 scoring

## Social Links

**What:** JSONB column storing `{ facebook?: string, linkedin?: string }` --- usernames/handles, not full URLs.

**Why JSONB:** Flexible structure for adding more platforms later without schema migration.

**Config:** Validated by `socialLinksSchema` --- each field is max 100 chars, optional, accepts empty string `""` for clearing.

**Visibility:** Per PRODUCT.md, social links are only visible after ping acceptance (full profile view). The `profiles.getById` endpoint returns the full profile including `socialLinks` regardless --- visibility gating is handled client-side based on connection status.

**OAuth extraction:** Social links are NOT auto-populated from OAuth. Despite `user.image` being copied from OAuth as the avatar, there is no code path that extracts Facebook/LinkedIn usernames from OAuth account data. Social links are user-entered via `profiles.update`.

## Profile Creation & AI Pipeline

The profile lifecycle has two paths:

**Path 1: Direct create** (`profiles.create`)
- Creates profile with `displayName`, `bio`, `lookingFor`, and optionally `avatarUrl` from OAuth
- `isComplete` defaults to `false`
- Enqueues `profileAI` job (portrait generation, embedding, interests)
- WS event `profileReady` fires when AI pipeline completes

**Path 2: Profiling Q&A** (`profiling.applyProfile`)
- Upserts profile with `displayName`, `bio`, `lookingFor`, `portrait` (from profiling session)
- Does NOT write `portraitSharedForMatching` — the DB default (`true`) handles inserts; re-profiling preserves the existing row value (BLI-199)
- Sets `isComplete: true` immediately
- Enqueues `profileAI` job for embedding + interests extraction
- This is the primary onboarding path

**On update** (`profiles.update`):
- If `bio` or `lookingFor` changed: re-enqueues `profileAI` (portrait regeneration, new embedding, new interests) + re-enqueues pair analysis for nearby users
- Rate-limited via `profiles.update` rate limit config
- All text fields (`displayName`, `bio`, `lookingFor`) are content-moderated before save

## Impact Map

If you change this system, also check:

| Change | Also check |
|--------|-----------|
| Add/remove profile column | `data-export.ts` (GDPR export), anonymization job in `queue.ts`, account deletion doc |
| Change `visibilityMode` values | Every nearby query in `profiles.ts`, `queue.ts` (pair analysis, status matching, proximity matching) |
| Change `isComplete` semantics | `featureGate.ts`, all queue workers that skip incomplete profiles, `getDetailedAnalysis`, `ensureAnalysis` |
| Modify portrait generation prompt | All AI consumers (`analyzeConnection`, `quickScore`, `extractInterests`, `generateEmbedding`) |
| Add new `statusCategory` | `STATUS_CATEGORIES` in `validators.ts`, `evaluateStatusMatch` in `ai.ts`, mobile category selector |
| Change DND behavior | `push.ts` (`sendPushToUser`), mobile notification handling |
| Modify display name lock | `profiles.update` mutation, mobile settings UI |
| Change `socialLinks` shape | `socialLinksSchema` in validators, mobile profile edit screen, `data-export.ts` |
| Add new feature gate | `featureGates` DB table, `featureGate.ts` middleware, relevant procedure `.use(featureGate(...))` |
| Change ghost UI treatment (avatar blur, badges) | `useIsGhost` hook + 6 avatar call sites (UserRow, GroupRow, GroupMarker, NotificationToast, ConversationRow, MessageBubble), `theme.ghostBlurRadius` |

## Product Alignment Gaps

| PRODUCT.md feature | Implementation status | Notes |
|-------------------|----------------------|-------|
| Verified badge (liveness check + face comparison) | Not implemented | No `verified` column in schema, no verification flow |
| Znajomi (friends system) | Architecture doc exists (`friends-system.md`) but not yet built | No friends table in schema |
| Contact scanning ("skanowanie kontaktow z telefonu") | Not implemented | No contacts-related code |
| AI encourages direct contact for Full Nomad | Not implemented server-side | `full_nomad` is stored but treated identically to `semi_open` in all queries. Behavioral difference would be client-side or in AI prompt injection |
| Superpower tags (AI-extracted) | Column exists, never populated | `superpowerTags` in schema but no extraction pipeline like `extractInterests` for portrait |
| Status auto-expiry | Column exists (`statusExpiresAt`), always set to null | No expiry check logic. PRODUCT.md says status is "wieczny, aktywny dopoki sam go nie zmienisz" |
| Social links visible only after ping acceptance | Not enforced server-side | `getById` returns `socialLinks` for any authenticated caller. Gating is client-side |
| Display name lock: permanent vs. admin override | No admin override exists | Lock is permanent after 5 min, no escape hatch |
