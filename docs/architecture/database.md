# Database Architecture

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-11 — Added `metrics.ai_calls` table (BLI-174).
> Updated 2026-04-11 — `connection_analyses.tier` column (`t1`/`t2`/`t3`) records which scoring tier produced each row, surfaced in admin matching list (BLI-184).
> Updated 2026-04-14 — added `seq` column to messages table for per-conversation sequence numbers (BLI-224).
> Updated 2026-04-18 — `profiles.portrait_shared_for_matching` default flipped to `true`; flag retained as audit-only (BLI-199).

PostgreSQL on Railway. ORM: Drizzle `^0.45.1` with `postgres` (postgres.js) `^3.4.0` driver. Schema source: `packages/db/src/schema.ts` (the `@repo/db` workspace package). `apps/api/src/db/schema.ts` is now a 3-line re-export wrapper (`export * from "@repo/db/schema"`) preserved so existing `@/db` / `@/db/schema` imports keep working — the real schema definitions live in `@repo/db`. Migrations: `apps/api/drizzle/`. Config: `apps/api/drizzle.config.ts`.

## Terminology & Product Alignment

| PRODUCT.md | Code | UI (Polish) |
|------------|------|-------------|
| Ping | `wave` / `waves` table | "Ping" |
| Status ("na teraz") | `currentStatus` + `statusEmbedding` + `statusCategories` on `profiles` | "Status" |
| Profile Match (%) | `aiMatchScore` on `connectionAnalyses` | "% dopasowania" |
| Status Match | `statusMatches` table | pulsating bubble |
| "Co nas laczy" | `shortSnippet` / `longDescription` on `connectionAnalyses` | "Co was laczy" |
| Visibility modes: Ninja / Semi-Open / Full Nomad | `visibilityMode`: `ninja` / `semi_open` / `full_nomad` | Ninja / Semi-Open / Full Nomad |
| Do Not Disturb | `doNotDisturb` boolean on `profiles` | "Nie przeszkadzac" |
| Superpower ("Co moge dac") | `superpower` + `superpowerTags` + `offerType` on `profiles` | "Co moge dac" |
| Portrait | `portrait` text on `profiles` (AI-generated rich text, not an image) | internal |
| Categories (project/networking/dating/casual) | `statusCategories` text[] on `profiles` | category tiles |

## Two Schemas

The database uses two PostgreSQL schemas:

- **`public`** -- application data (all tables below unless noted)
- **`metrics`** -- observability, isolated for future extraction to dedicated DB

## Tables -- `public` Schema

### `user` (Better Auth managed)

Core identity table. Better Auth creates and manages it; app code extends it with `deletedAt` and `anonymizedAt`.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | text PK | no | -- | Better Auth generates, not UUID |
| `name` | text | no | -- | Display name from OAuth or email prefix |
| `email` | text, unique | no | -- | Login identifier |
| `email_verified` | boolean | no | `false` | Set true after OTP or OAuth |
| `image` | text | yes | -- | OAuth profile picture URL |
| `created_at` | timestamp | no | `now()` | |
| `updated_at` | timestamp | no | `now()` | |
| `deleted_at` | timestamp | yes | -- | Soft-delete. Non-null = blocked by `isAuthed` middleware, invisible in discovery |
| `anonymized_at` | timestamp | yes | -- | Set 14 days after soft-delete when PII is overwritten. Added in `0004`. |

No custom indexes -- PK and unique email cover query patterns. `session` and `account` have FK indexes pointing here.

**Why `text` PK, not UUID:** Better Auth generates its own IDs. Fighting the framework on ID format would break auth internals.

**Why `deleted_at` + `anonymized_at` as separate columns:** Two-phase GDPR deletion. `deleted_at` starts the 14-day grace period (reversible). `anonymized_at` records when irreversible PII overwrite happened. Both null = active user.

### `session` (Better Auth managed)

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | text PK | no | -- | |
| `expires_at` | timestamp | no | -- | Session TTL |
| `token` | text, unique | no | -- | Bearer token for API auth |
| `created_at` | timestamp | no | `now()` | |
| `updated_at` | timestamp | no | `now()` | |
| `ip_address` | text | yes | -- | Audit trail |
| `user_agent` | text | yes | -- | Audit trail |
| `user_id` | text FK -> user (cascade) | no | -- | |

**Indexes:** `session_user_id_idx` on `user_id`. Added in `0016` because FK without index causes sequential scans on cascade deletes and session lookups by user.

**Why cascade on delete:** When a user row is removed, all sessions should be invalidated automatically.

### `account` (Better Auth managed)

OAuth provider links. One user can have multiple providers (account linking enabled).

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | text PK | no | -- | |
| `account_id` | text | no | -- | Provider's user ID |
| `provider_id` | text | no | -- | `apple` / `google` / `facebook` / `linkedin` |
| `user_id` | text FK -> user (cascade) | no | -- | |
| `access_token` | text | yes | -- | For fetching social profile data (FB name, LinkedIn name) |
| `refresh_token` | text | yes | -- | |
| `id_token` | text | yes | -- | |
| `access_token_expires_at` | timestamp | yes | -- | |
| `refresh_token_expires_at` | timestamp | yes | -- | |
| `scope` | text | yes | -- | OAuth scopes granted |
| `password` | text | yes | -- | Unused (no password auth) |
| `created_at` | timestamp | no | `now()` | |
| `updated_at` | timestamp | no | `now()` | |

**Indexes:** `account_user_id_idx` on `user_id`. Added in `0016`.

**Why `access_token` is stored:** The `databaseHooks.account.create.after` hook uses it to fetch the user's real name from Facebook Graph API or LinkedIn API and store it in `profiles.socialLinks`.

### `verification` (Better Auth managed)

Email OTP codes and OAuth state tokens.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | text PK | no | -- | |
| `identifier` | text | no | -- | Email address or state key |
| `value` | text | no | -- | OTP code or state value |
| `expires_at` | timestamp | no | -- | 5-minute expiry for OTP |
| `created_at` | timestamp | yes | `now()` | |
| `updated_at` | timestamp | yes | `now()` | |

No custom indexes. Better Auth queries by `identifier` + `value`.

### `profiles`

Extends `user` with app-specific data. 1:1 relationship via unique `user_id`.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `user_id` | text FK -> user (cascade), unique | no | -- | |
| `display_name` | varchar(50) | no | -- | Locked after 5-minute grace period post-creation |
| `avatar_url` | text | yes | -- | Presigned S3 URL |
| `bio` | text | no | -- | User's self-description, AI-generated or manual |
| `looking_for` | text | no | -- | What they seek (AI-generated or manual) |
| `social_links` | jsonb | yes | -- | `{ facebook?: string, linkedin?: string }` -- usernames, not URLs |
| `visibility_mode` | text | no | `semi_open` | `ninja` / `semi_open` / `full_nomad` |
| `do_not_disturb` | boolean | no | `false` | Mutes push notifications |
| `superpower` | text | yes | -- | "What I can offer" freeform text |
| `superpower_tags` | text[] | yes | -- | AI-extracted tags from superpower |
| `offer_type` | text | yes | -- | `volunteer` / `exchange` / `gig` |
| `interests` | text[] | yes | -- | AI-extracted from portrait |
| `embedding` | real[] | yes | -- | text-embedding-3-small vector for profile matching |
| `portrait` | text | yes | -- | AI-generated rich social profile text (NOT an image) |
| `portrait_shared_for_matching` | boolean | no | `true` | Historical consent flag. No functional effect — matching pipeline always reads `portrait` if present. Retained as audit-only column; may be dropped later. |
| `is_complete` | boolean | no | `false` | True after onboarding finishes |
| `current_status` | text | yes | -- | "Na teraz" status text (max 150 chars via validator) |
| `status_expires_at` | timestamp | yes | -- | When status auto-clears |
| `status_embedding` | real[] | yes | -- | Embedding of current status text |
| `status_set_at` | timestamp | yes | -- | When status was last set |
| `status_visibility` | text | yes | -- | `public` / `private`. Added in `0005`. |
| `status_categories` | text[] | yes | -- | `project` / `networking` / `dating` / `casual`. Max 2. Added in `0011`. |
| `date_of_birth` | timestamp | yes | -- | Age verification (18+). Added in `0009`. |
| `latitude` | real | yes | -- | Last known position |
| `longitude` | real | yes | -- | Last known position |
| `last_location_update` | timestamp | yes | -- | |
| `created_at` | timestamp | no | `now()` | |
| `updated_at` | timestamp | no | `now()` | |

**Indexes:**
- `profiles_user_id_idx` on `user_id` -- fast lookup by user, also enforces uniqueness
- `profiles_location_idx` on `(latitude, longitude)` -- bounding-box geo queries for nearby users

**Why `embedding` as `real[]` not `pgvector`:** No approximate-nearest-neighbor needed yet. Cosine similarity is computed in application code (shared `cosineSimilarity()` in `@repo/shared`). The bounding-box pre-filter on lat/lon keeps the candidate set small (<100 rows). pgvector would add a Postgres extension dependency for no measurable gain at current scale.

**Why `portrait` is text not image:** It's an AI-generated structured text summary of the user's personality, interests, and style -- used as input for connection analysis prompts. The name is misleading but established.

**Why status columns live on `profiles` not a separate table:** Status is a single "slot" per user (max 1 active at a time). A separate table would add JOINs to every nearby query for no normalization benefit. The trade-off is wider rows in `profiles`.

### `waves` (Pings)

Connection requests. Irreversible by design -- no cancel/undo to prevent notification spam.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `from_user_id` | text FK -> user | no | -- | Sender |
| `to_user_id` | text FK -> user | no | -- | Recipient |
| `status` | varchar(20) | no | `pending` | `pending` / `accepted` / `declined` |
| `sender_status_snapshot` | text | yes | -- | Frozen sender status at wave time. Added `0006`. |
| `recipient_status_snapshot` | text | yes | -- | Frozen recipient status at acceptance. Added `0007`. |
| `responded_at` | timestamp | yes | -- | When accepted/declined. Added `0008`. |
| `created_at` | timestamp | no | `now()` | |

**Indexes:**
- `waves_from_user_status_idx` on `(from_user_id, status)` -- "my sent waves" filtered by status
- `waves_to_user_status_idx` on `(to_user_id, status)` -- "my received waves" filtered by status

**Why no FK cascade:** Waves are preserved after user deletion per GDPR design. The user row is anonymized, not deleted, so FK integrity is maintained.

**Why status snapshots are nullable:** Added incrementally after the baseline. Existing waves have no snapshots. Snapshots capture the "moment" of the wave for the first-contact card.

### `conversations`

Both DMs and groups in one table, discriminated by `type`.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `type` | varchar(10) | no | `dm` | `dm` / `group` |
| `name` | varchar(100) | yes | -- | Group name (null for DMs) |
| `description` | text | yes | -- | Group description |
| `avatar_url` | text | yes | -- | Group avatar |
| `invite_code` | varchar(20), unique | yes | -- | Group join link |
| `creator_id` | text FK -> user | yes | -- | Group creator (null for DMs) |
| `max_members` | integer | yes | `200` | Group member cap |
| `latitude` | real | yes | -- | Group location anchor |
| `longitude` | real | yes | -- | Group location anchor |
| `is_discoverable` | boolean | yes | `false` | Visible in nearby group search |
| `discovery_radius_meters` | integer | yes | `5000` | How far away users can see this group |
| `metadata` | jsonb | yes | -- | Extensible (e.g. wave context). Added `0007`. |
| `deleted_at` | timestamp | yes | -- | Bilateral chat deletion. Added `0010`. |
| `created_at` | timestamp | no | `now()` | |
| `updated_at` | timestamp | no | `now()` | |

**Indexes:**
- `conversations_type_idx` on `type`
- `conversations_invite_code_idx` on `invite_code`
- `conversations_location_idx` on `(latitude, longitude)` -- nearby discoverable group search
- `conversations_discoverable_idx` on `is_discoverable`

**Why DMs and groups in one table:** Messages, participants, and typing indicators share the same structure. Separate tables would duplicate all conversation-related queries and WebSocket event handling.

### `conversation_participants`

Composite PK table linking users to conversations.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `conversation_id` | uuid FK -> conversations | no | -- | |
| `user_id` | text FK -> user | no | -- | |
| `role` | varchar(10) | no | `member` | `member` / `admin` |
| `muted_until` | timestamp | yes | -- | Per-conversation mute |
| `last_read_at` | timestamp | yes | -- | Unread message tracking |
| `joined_at` | timestamp | no | `now()` | |
| `location_visible` | boolean | no | `true` | Opt-out from nearby member visibility in groups |

**PK:** `(conversation_id, user_id)`. **Indexes:** `cp_conversation_idx`, `cp_user_idx`.

### `conversation_ratings`

Optional 1-5 star rating when a user deletes a conversation. Added in `0010`.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `conversation_id` | uuid FK -> conversations | no | -- | |
| `user_id` | text FK -> user | no | -- | |
| `rating` | integer | no | -- | 1-5 stars |
| `created_at` | timestamp | no | `now()` | |

**Indexes:** `cr_conversation_idx`, `cr_user_idx`. Added in `0016`.

### `topics`

Threaded discussions within group conversations.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `conversation_id` | uuid FK -> conversations (cascade) | no | -- | |
| `name` | varchar(100) | no | -- | |
| `emoji` | varchar(8) | yes | -- | Visual identifier |
| `creator_id` | text FK -> user | yes | -- | |
| `is_pinned` | boolean | yes | `false` | |
| `is_closed` | boolean | yes | `false` | |
| `sort_order` | integer | yes | `0` | |
| `last_message_at` | timestamp | yes | -- | Denormalized for sort |
| `message_count` | integer | yes | `0` | Denormalized for display |
| `created_at` | timestamp | no | `now()` | |

**Indexes:**
- `topics_conversation_idx` on `conversation_id`
- `topics_sort_idx` on `(conversation_id, is_pinned, sort_order)` -- topic list ordering

### `messages`

All chat messages (DM and group).

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `conversation_id` | uuid FK -> conversations | no | -- | |
| `sender_id` | text FK -> user | no | -- | |
| `topic_id` | uuid FK -> topics (set null on delete) | yes | -- | |
| `content` | text | no | -- | Max 2000 chars via validator |
| `type` | varchar(20) | no | `text` | `text` / `image` / `location` |
| `metadata` | jsonb | yes | -- | Extensible (e.g. `{ source: 'chatbot' }`) |
| `reply_to_id` | uuid (self-ref) | yes | -- | Threaded replies |
| `created_at` | timestamp | no | `now()` | |
| `seq` | bigint | no | -- | Per-conversation monotonic sequence number |
| `read_at` | timestamp | yes | -- | Read receipt |
| `deleted_at` | timestamp | yes | -- | Soft-delete |

**Indexes:**
- `messages_conv_created_idx` on `(conversation_id, created_at)` -- message timeline queries
- `messages_conv_seq_uniq` UNIQUE on `(conversation_id, seq)` -- deterministic pagination, gap detection
- `messages_sender_idx` on `sender_id` -- user message history
- `messages_topic_idx` on `topic_id` -- topic message listing

### `message_reactions`

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `message_id` | uuid FK -> messages (cascade) | no | -- | |
| `user_id` | text FK -> user | no | -- | |
| `emoji` | varchar(8) | no | -- | |
| `created_at` | timestamp | no | `now()` | |

**Indexes:**
- `reactions_message_idx` on `message_id`
- `reactions_user_emoji_idx` on `(message_id, user_id, emoji)` -- enforces one reaction per user per emoji per message (used for conflict detection, not a UNIQUE constraint)

### `blocks`

Bidirectional blocking. Filtered in: nearby queries, wave sends, message sends, group discovery.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `blocker_id` | text FK -> user | no | -- | |
| `blocked_id` | text FK -> user | no | -- | |
| `created_at` | timestamp | no | `now()` | |

**Indexes:** `blocks_blocker_idx`, `blocks_blocked_idx`. Both needed because block checks query in both directions.

### `push_tokens`

Expo push notification tokens.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `user_id` | text FK -> user | no | -- | |
| `token` | text, unique | no | -- | Expo push token |
| `platform` | varchar(10) | no | -- | `ios` / `android` |
| `created_at` | timestamp | no | `now()` | |

**Index:** `push_tokens_user_idx` on `user_id`.

### `push_sends`

Push notification send log. Batch-flushed from a Redis buffer every 15s by the `flush-push-log` BullMQ job. Pruned (entries older than 7 days deleted) hourly by the `prune-push-log` job.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `user_id` | text | no | -- | Recipient (no FK — survives user deletion) |
| `title` | text | no | -- | Push title |
| `body` | text | no | -- | Push body |
| `data` | jsonb | yes | -- | Deep-link payload |
| `collapse_id` | varchar(100) | yes | -- | Expo collapse ID |
| `status` | varchar(20) | no | -- | `sent` / `suppressed` / `failed` |
| `suppression_reason` | varchar(30) | yes | -- | `ws_active` / `dnd` / `no_tokens` / `invalid_tokens` |
| `token_count` | integer | no | `0` | Number of tokens push was sent to |
| `created_at` | timestamp | no | `now()` | |

**Indexes:** `push_sends_user_idx` on `user_id`, `push_sends_created_at_idx` on `created_at`, `push_sends_status_idx` on `status`.

**GDPR note:** No FK to `user` — `user_id` is stored as plain text. When a user is anonymized, push log entries are NOT cleared (they contain no PII beyond the userId which becomes meaningless after anonymization). The 7-day auto-prune handles cleanup.

### `status_matches`

AI-evaluated matches between users' "na teraz" statuses.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `user_id` | text FK -> user | no | -- | Status owner |
| `matched_user_id` | text FK -> user | no | -- | Matched person |
| `reason` | text | no | -- | AI-generated explanation |
| `matched_via` | text | no | -- | `status` (public status match) / `profile` (private, matched via profile embedding) |
| `created_at` | timestamp | no | `now()` | |

**Indexes:** `sm_user_id_idx`, `sm_matched_user_id_idx`.
**Unique constraint:** `sm_user_matched_user_uniq` on `(user_id, matched_user_id)`. Added in `0014` -- one match record per directional pair. Replaces are done via DELETE + INSERT in the status matching processor.

### `connection_analyses`

Bidirectional AI compatibility analysis. Each pair generates TWO rows (A->B and B->A) because match scores and descriptions are asymmetric -- what A finds interesting about B differs from what B finds interesting about A.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `from_user_id` | text FK -> user | no | -- | Viewer |
| `to_user_id` | text FK -> user | no | -- | Subject |
| `short_snippet` | text | yes | -- | Max ~90 chars "pitch". Nullable for T2 quick-score rows. Made nullable in `0015`. |
| `long_description` | text | yes | -- | Max ~500 chars rich description. Nullable for T2. Made nullable in `0015`. |
| `ai_match_score` | real | no | -- | 0-100, asymmetric per direction |
| `tier` | text | no | -- | `t1` / `t2` / `t3` -- which scoring tier produced this row. T1 is never persisted in practice (computed inline at query time) but the enum reserves it for future. Added in `0020`. |
| `from_profile_hash` | varchar(8) | no | -- | SHA256(bio+lookingFor) truncated. Detects stale analyses. |
| `to_profile_hash` | varchar(8) | no | -- | |
| `created_at` | timestamp | no | `now()` | |
| `updated_at` | timestamp | no | `now()` | |

**Indexes:**
- `ca_pair_uniq` unique index on `(from_user_id, to_user_id)` -- one analysis per directional pair, upsert target
- `ca_to_user_idx` on `to_user_id` -- "who has analyzed me" queries

**Why `short_snippet` and `long_description` are nullable:** The tiered matching system has T2 (quick-score) which writes only the numeric score without generating text. T3 (full analysis) fills in the text later. Made nullable in `0015`.

**Why `tier`:** So the admin matching list (`/dashboard/matching`) can show which path produced each row without having to infer it from `short_snippet` nullability. Backfill in `0020` used exactly that inference (`t2` when `short_snippet IS NULL`, else `t3`) because T3 is the only writer that fills the snippet.

**Why profile hashes:** When a user updates their bio/lookingFor, the queue job checks if the hash changed before spending an AI call. If hashes match, the existing analysis is still valid -- skip.

### `profiling_sessions`

AI-driven Q&A profiling sessions.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `user_id` | text FK -> user (cascade) | no | -- | |
| `status` | varchar(20) | no | `active` | `active` / `completed` |
| `based_on_session_id` | uuid | yes | -- | Self-reference for iterating on previous session |
| `generated_bio` | text | yes | -- | AI output |
| `generated_looking_for` | text | yes | -- | AI output |
| `generated_portrait` | text | yes | -- | AI output |
| `created_at` | timestamp | no | `now()` | |
| `completed_at` | timestamp | yes | -- | |

**Index:** `ps_user_status_idx` on `(user_id, status)`.

### `profiling_qa`

Individual Q&A items within a profiling session.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | no | `gen_random_uuid()` | |
| `session_id` | uuid FK -> profiling_sessions (cascade) | no | -- | |
| `question_number` | integer | no | -- | Sequence within session |
| `question` | text | no | -- | AI-generated question |
| `answer` | text | yes | -- | User's response. Nullified during anonymization. |
| `sufficient` | boolean | no | `false` | AI determines if answer is complete |
| `created_at` | timestamp | no | `now()` | |

**Index:** `pqa_session_id_idx` on `session_id`.

**Why `answer` is nullable:** Two reasons -- (1) question generated but not yet answered, (2) nullified during GDPR anonymization.

The `suggestions` column was dropped in `0003` -- it held AI-suggested answers but was unused.

### `feature_gates`

Simplified attribute-based access control.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `feature` | text PK | no | -- | Feature name |
| `requires` | text[] | no | -- | Required profile attributes (e.g. `['isComplete']`) |
| `enabled` | boolean | no | `true` | Kill switch |

Cached in memory with 60-second TTL. Checked via `featureGate()` middleware.

## Tables -- `metrics` Schema

Separate PostgreSQL schema created in `0001`.

### `metrics.request_events`

Raw per-request telemetry. 30-day retention target.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `id` | serial PK | no | |
| `timestamp` | timestamptz | no | Request time |
| `request_id` | text | no | UUID, correlates logs + mobile error reports via `X-Request-Id` header |
| `method` | text | no | HTTP method |
| `endpoint` | text | no | tRPC procedure name or HTTP path |
| `user_id` | text | yes | Null for pre-auth requests. Nullified during anonymization. |
| `duration_ms` | integer | no | Total request time |
| `status_code` | smallint | no | HTTP status |
| `app_version` | text | yes | From `X-App-Version` header |
| `platform` | text | yes | Parsed from User-Agent (`iOS 18.2`, `Android 15`) |
| `auth_provider` | text | yes | |
| `session_id` | text | yes | |
| `ip_hash` | text | yes | `SHA256(ip + IP_HASH_SALT)`, never raw IP |
| `user_agent` | text | yes | Truncated to 200 chars |
| `error_message` | text | yes | Truncated to 200 chars |
| `target_user_id` | text | yes | Who was acted upon (GDPR audit). Added `0002`. |
| `target_group_id` | text | yes | Which group. Added `0002`. |
| `db_query_count` | integer | yes | Queries per request. Added `0002`. |
| `db_duration_ms` | integer | yes | Total DB time per request. Added `0002`. |

**Indexes:**
- `idx_re_timestamp` on `timestamp`
- `idx_re_endpoint_ts` on `(endpoint, timestamp)` -- per-endpoint performance queries
- `idx_re_user_ts` on `(user_id, timestamp)` -- per-user audit trail
- `idx_re_target_user_ts` on `(target_user_id, timestamp)` -- "who accessed my data" GDPR queries
- `idx_re_target_group` on `target_group_id`

### `metrics.ai_calls`

Per-call OpenAI telemetry. Every Vercel AI SDK call logged via `withAiLogging()` wrapper. 7-day retention, batch-flushed every 15s. Source of truth for the admin "Koszty AI" dashboard. Added in `0018`.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `id` | serial PK | no | |
| `timestamp` | timestamptz | no | DB-generated (`defaultNow()`) |
| `queue_name` | text | no | `ai` today — placeholder for future queue split |
| `job_name` | text | no | `quick-score` / `analyze-pair` / `generate-profile-ai` / `status-matching` / `proximity-status-matching` / `evaluate-status-match` / `generate-profiling-question` / `generate-profile-from-qa` / `inline-follow-up-questions` / etc. |
| `model` | text | no | `gpt-4.1-mini`, `text-embedding-3-small`. `unknown` if call failed before model was known. |
| `prompt_tokens` | integer | no | From Vercel SDK `usage.inputTokens` (or `usage.tokens` for embeddings). 0 on failure. |
| `completion_tokens` | integer | no | From Vercel SDK `usage.outputTokens`. 0 for embeddings and on failure. |
| `total_tokens` | integer | no | `prompt_tokens + completion_tokens` |
| `estimated_cost_usd` | numeric(12,6) | no | Computed via `estimateCostUsd(model, ...)` from `ai-pricing.ts`. Unknown models → 0. |
| `user_id` | text | yes | User who triggered the call. Nullified on anonymization. |
| `target_user_id` | text | yes | Other user for pair jobs (`quick-score`, `analyze-pair`, `status-matching`). Nullified on anonymization. |
| `duration_ms` | integer | no | AI call duration only, not full job duration |
| `status` | text | no | `success` / `failed` |
| `error_message` | text | yes | Truncated to 200 chars, failures only |

**Indexes:**
- `idx_ai_calls_timestamp` on `timestamp` — for `prune-ai-calls` and recency queries
- `idx_ai_calls_job_ts` on `(job_name, timestamp)` — breakdown per job type
- `idx_ai_calls_user_ts` on `(user_id, timestamp)` — top-users query
- `idx_ai_calls_model_ts` on `(model, timestamp)` — per-model breakdown

**No FK to `user`** — metrics schema is isolated, users get anonymized (GDPR). `user_id`/`target_user_id` become historical traces that are nullified when the user is hard-deleted.

See `ai-cost-tracking.md` for the full data flow, wrapper design, and admin dashboard.

### `metrics.slo_targets`

Performance targets per endpoint.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `id` | serial PK | no | |
| `endpoint` | text | yes | Null = global target |
| `metric_type` | text | no | `p95` / `p99` / `error_rate` |
| `threshold_ms` | integer | yes | For latency targets |
| `threshold_pct` | numeric | yes | For error rate (0-100) |
| `created_at` | timestamptz | yes | `now()` |

## Connection Pattern and Query Instrumentation

`apps/api/src/db/index.ts` exports `{ db, schema }`. `schema` is re-exported from `@repo/db/schema` (`packages/db/src/schema.ts` — 695 lines, the real source). All application code imports from `@/db` and accesses tables as `schema.profiles`, `schema.user`. Individual table imports from schema.ts are forbidden (enforced by convention).

**Query instrumentation** works by monkey-patching `postgres.js`'s `client.unsafe()` method. Drizzle-orm internally calls `client.unsafe()` for all queries. The patch wraps `.then()` and `.values()` on the returned `PendingQuery` to record timing via `AsyncLocalStorage` (`apps/api/src/services/query-tracker.ts`). Each request gets its own `QueryContext` with `queryCount` and `dbDurationMs`, tracked through the metrics middleware and written to `metrics.request_events`.

## Prepared Statements

`apps/api/src/db/prepare.ts` provides `preparedName()` -- a registry that throws on duplicate names to catch mistakes at startup rather than runtime.

Hot-path prepared statements:
- `session_by_token` in `apps/api/src/trpc/context.ts` -- session lookup on every authenticated request
- `user_deleted_at` in `apps/api/src/trpc/trpc.ts` -- soft-delete check in `isAuthed` middleware
- `profile_is_complete` in `apps/api/src/trpc/middleware/featureGate.ts` -- feature gate attribute check
- `profile_by_user_id` in `apps/api/src/trpc/procedures/profiles.ts` -- hot-path `profiles.me` lookup

## Migration History

Migration files live in `apps/api/drizzle/`, one `.sql` per migration numbered sequentially (`0000_…`, `0001_…`, …). **That folder is the authoritative history** — this document will not mirror it, because the mirror kept drifting out of sync with the real files.

Each migration file starts with a comment header explaining the motivation (ticket ID + one paragraph of context) — the SQL body itself describes the mechanical change. See `migrations/document-reason` in `.claude/rules/migrations.md`. To read the history chronologically: `ls apps/api/drizzle/*.sql` and open each file's header.

Drizzle's internal state for the migrator — schema snapshots and the journal — lives in `apps/api/drizzle/meta/`. Do not edit manually; `drizzle-kit generate` and `drizzle-kit drop` are the only supported operations.

## Drizzle Relations

Relations are defined for the v1 relational API (`relations()` from `drizzle-orm`). Key relationships:

- `user` has one `profile`, many `sessions`, many `accounts`
- `profiles` has many `sentWaves`, `receivedWaves`, `conversations` (via participants), `messages`, `blockedUsers`, `blockedBy`, `pushTokens`
- `waves` has one `fromUser`, one `toUser` (named relations for bidirectional)
- `conversations` has one `creator`, many `participants`, `messages`, `topics`
- `messages` has one `conversation`, `sender`, `topic`, `replyTo`; many `replies`, `reactions`
- `profilingSessions` has one `user`, one `basedOnSession` (self-ref); many `questions`

## Drizzle Schema Gotchas

### Partial index `WHERE` clauses must use `sql\`\`` literals, not filter functions

When adding a partial index in `schema.ts`, the `.where()` clause **must** be a `sql\`...\`` template with a literal value — not `eq()`, `and()`, or any other filter function from `drizzle-orm`:

```ts
// ✅ correct — literal value inside sql template
pendingUnique: uniqueIndex("waves_pending_unique")
  .on(table.fromUserId, table.toUserId)
  .where(sql`${table.status} = 'pending'`),

// ❌ broken — drizzle-kit emits parameterized SQL (`WHERE ... = $1`)
pendingUnique: uniqueIndex("waves_pending_unique")
  .on(table.fromUserId, table.toUserId)
  .where(eq(table.status, "pending")),
```

Drizzle-kit's generator turns filter-function `where` clauses into parameterized SQL with `$1`/`$2`/… placeholders. Parameter placeholders have no binding context at `CREATE INDEX` time — the migration file is DDL, not a prepared statement — so the resulting migration is silently broken. Always read the generated `.sql` after running `db:generate` (rule `migrations/review-sql`); seeing `$N` inside a `CREATE INDEX ... WHERE ...` means the schema definition needs to be rewritten with `sql\`\``.

The same rule applies to any other DDL context where drizzle-kit serializes an expression into static SQL (e.g. `check()` constraints).

### `onConflictDoNothing` cannot target expression-based unique indexes directly — use a generated column

The repo rule `drizzle/use-on-conflict` says to prefer `INSERT ... ON CONFLICT DO NOTHING` over the "select → if → update / insert" antipattern. That works fine when the conflict target is one or more plain columns. It does **not** work when the unique index is built on a SQL expression like `LEAST(col_a, col_b)` — drizzle-orm 0.45.x types `onConflictDoNothing({ target })` as `IndexColumn | IndexColumn[]` and the runtime calls `getColumnCasing(target)` on each element, which throws on raw `sql` values. PostgreSQL itself supports `ON CONFLICT (LEAST(a, b), GREATEST(a, b)) WHERE ... DO NOTHING`, but the Drizzle API does not surface it.

**Workaround we use: STORED generated column.** Materialise the canonical value as a separate column with `GENERATED ALWAYS AS (...) STORED`, put the unique index on that plain column, and `onConflictDoNothing({ target: schema.table.col })` works normally.

The `waves` table is the canonical example. We need uniqueness over the unordered pair `(from_user_id, to_user_id)`, so the table has:

```ts
pairKey: text("pair_key")
  .notNull()
  .generatedAlwaysAs(
    sql`md5(LEAST("from_user_id", "to_user_id") || ':' || GREATEST("from_user_id", "to_user_id"))`,
  ),
```

and:

```ts
activeUnique: uniqueIndex("waves_active_unique")
  .on(table.pairKey)
  .where(sql`${table.status} in ('pending', 'accepted')`),
```

Application code then uses standard onConflict:

```ts
await db.insert(schema.waves)
  .values({ fromUserId, toUserId, ... })
  .onConflictDoNothing({
    target: schema.waves.pairKey,
    where: sql`${schema.waves.status} in ('pending', 'accepted')`,
  })
  .returning();
```

**Why md5 specifically:** fixed-width 32-char hex string regardless of source ID length, identical for `(A,B)` and `(B,A)`, and the `:` separator is safe because Better Auth user IDs are nanoid-style alphanumeric. md5 is built into Postgres (no extension needed) and md5's "cryptographically broken" reputation does not matter here — we use it for collision-free deduplication, not security. Collision probability for our scale is on the order of `10^-25`.

**Costs to be aware of:**

- STORED generated columns are persisted on disk for **every row** in the table (PG does not yet support VIRTUAL generated columns). Storage cost is small but real — ~36 bytes per row for md5.
- Adding a STORED generated column to a non-empty table requires a full table rewrite under `AccessExclusiveLock`. Sub-second on small tables, can be a problem on large ones; consider doing the rewrite in a maintenance window if the table has tens of millions of rows.
- The column cannot be written to from application code — Postgres rejects any `INSERT`/`UPDATE` that supplies a value. Drizzle's types reflect this.

The two alternatives we considered and rejected:

- **Catch `23505` after a plain INSERT** — works but uses exceptions for normal flow control and adds an `isUniqueViolation` helper. Not idiomatic, and `drizzle/use-on-conflict` exists specifically to discourage this pattern.
- **Raw `db.execute(sql\`...\`)`** with full hand-written SQL — violates `drizzle/no-raw-execute` and loses Drizzle's type-safe value binding.

## Impact Map

If you change this system, also check:
- `auth-sessions.md` -- session table changes affect auth flow
- `instrumentation.md` -- metrics schema shares the same database, query tracking depends on postgres.js internals
- `gdpr-compliance.md` -- anonymization job overwrites data in `user`, `profiles`, `profiling_sessions`, `profiling_qa`, `request_events`
- `account-deletion.md` -- two-phase deletion depends on `deleted_at`, `anonymized_at` columns
- `data-export.ts` -- GDPR export reads from every table; new tables may need export coverage
- `ai-matching.md` -- connection analyses and status matches tables
- `waves-connections.md` -- waves table structure and snapshot columns
- `messaging.md` -- messages, reactions, topics tables
- `groups-discovery.md` -- conversations table with group fields
- `location-privacy.md` -- profiles location columns and indexes
