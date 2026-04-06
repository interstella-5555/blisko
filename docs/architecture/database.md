# Database Architecture

> v1 — AI-generated from source analysis, 2026-04-06.

PostgreSQL on Railway. ORM: Drizzle `^0.45.1` with `postgres` (postgres.js) `^3.4.0` driver. Schema source: `apps/api/src/db/schema.ts`. Migrations: `apps/api/drizzle/`. Config: `apps/api/drizzle.config.ts`.

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
| `portrait_shared_for_matching` | boolean | no | `false` | Consent for AI matching with portrait |
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
| `read_at` | timestamp | yes | -- | Read receipt |
| `deleted_at` | timestamp | yes | -- | Soft-delete |

**Indexes:**
- `messages_conv_created_idx` on `(conversation_id, created_at)` -- message timeline queries
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
| `from_profile_hash` | varchar(8) | no | -- | SHA256(bio+lookingFor) truncated. Detects stale analyses. |
| `to_profile_hash` | varchar(8) | no | -- | |
| `created_at` | timestamp | no | `now()` | |
| `updated_at` | timestamp | no | `now()` | |

**Indexes:**
- `ca_pair_uniq` unique index on `(from_user_id, to_user_id)` -- one analysis per directional pair, upsert target
- `ca_to_user_idx` on `to_user_id` -- "who has analyzed me" queries

**Why `short_snippet` and `long_description` are nullable:** The tiered matching system has T2 (quick-score) which writes only the numeric score without generating text. T3 (full analysis) fills in the text later. Made nullable in `0015`.

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

`apps/api/src/db/index.ts` exports `{ db, schema }`. All application code imports from `@/db` and accesses tables as `schema.profiles`, `schema.user`. Individual table imports from schema.ts are forbidden (enforced by convention).

**Query instrumentation** works by monkey-patching `postgres.js`'s `client.unsafe()` method. Drizzle-orm internally calls `client.unsafe()` for all queries. The patch wraps `.then()` and `.values()` on the returned `PendingQuery` to record timing via `AsyncLocalStorage` (`apps/api/src/services/query-tracker.ts`). Each request gets its own `QueryContext` with `queryCount` and `dbDurationMs`, tracked through the metrics middleware and written to `metrics.request_events`.

## Prepared Statements

`apps/api/src/db/prepare.ts` provides `preparedName()` -- a registry that throws on duplicate names to catch mistakes at startup rather than runtime.

Hot-path prepared statements:
- `session_by_token` in `apps/api/src/trpc/context.ts` -- session lookup on every authenticated request
- `user_deleted_at` in `apps/api/src/trpc/trpc.ts` -- soft-delete check in `isAuthed` middleware
- `profile_is_complete` in `apps/api/src/trpc/middleware/featureGate.ts` -- feature gate attribute check
- `profile_by_user_id` in `apps/api/src/trpc/procedures/profiles.ts` -- hot-path `profiles.me` lookup

## Migration History

| # | Name | Type | What |
|---|------|------|------|
| 0000 | `baseline` | no-op | Marker for pre-migration schema (created via `db:push`) |
| 0001 | `add_metrics_schema` | DDL | `metrics` schema + `request_events` + `slo_targets` + initial indexes |
| 0002 | `add_deeper_insight_columns` | DDL | `target_user_id`, `target_group_id`, `db_query_count`, `db_duration_ms` on request_events |
| 0003 | `drop_profiling_qa_suggestions` | DDL | Drop unused `suggestions` column from `profiling_qa` |
| 0004 | `add_user_anonymized_at` | DDL | `anonymized_at` on `user` for GDPR phase 2 |
| 0005 | `add_status_visibility` | DDL | `status_visibility` on `profiles` |
| 0006 | `add_sender_status_snapshot` | DDL | `sender_status_snapshot` on `waves` |
| 0007 | `add_recipient_snapshot_and_conversation_metadata` | DDL | `recipient_status_snapshot` on `waves`, `metadata` on `conversations` |
| 0008 | `add_wave_responded_at` | DDL | `responded_at` on `waves` |
| 0009 | `add_date_of_birth` | DDL | `date_of_birth` on `profiles` |
| 0010 | `add_conversation_delete_and_ratings` | DDL | `conversation_ratings` table, `deleted_at` on `conversations` |
| 0011 | `add_status_categories` | DDL | `status_categories` text[] on `profiles` |
| 0012 | `rename_visibility_modes_add_dnd` | DML+DDL (custom) | Rename visibility modes (`visible`->`semi_open`, `hidden`->`ninja`), add `do_not_disturb` |
| 0013 | `add_superpower_fields` | DDL | `superpower`, `superpower_tags`, `offer_type` on `profiles` |
| 0014 | `add_status_matches_unique` | DDL | Unique constraint on `status_matches(user_id, matched_user_id)` |
| 0015 | `nullable_snippet_description` | DDL (custom) | Make `short_snippet` and `long_description` nullable for T2 quick-score |
| 0016 | `add_missing_fk_indexes` | DDL | Indexes on `account.user_id`, `session.user_id`, `conversation_ratings` FKs |

## Drizzle Relations

Relations are defined for the v1 relational API (`relations()` from `drizzle-orm`). Key relationships:

- `user` has one `profile`, many `sessions`, many `accounts`
- `profiles` has many `sentWaves`, `receivedWaves`, `conversations` (via participants), `messages`, `blockedUsers`, `blockedBy`, `pushTokens`
- `waves` has one `fromUser`, one `toUser` (named relations for bidirectional)
- `conversations` has one `creator`, many `participants`, `messages`, `topics`
- `messages` has one `conversation`, `sender`, `topic`, `replyTo`; many `replies`, `reactions`
- `profilingSessions` has one `user`, one `basedOnSession` (self-ref); many `questions`

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
