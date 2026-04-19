# Account Deletion

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-09 — Soft-delete logic extracted to `softDeleteUser()` service function, admin restore via BullMQ (BLI-154).

Two-phase account deletion: immediate soft-delete blocks access and hides the user, then a 14-day delayed BullMQ job anonymizes all PII while preserving relational data.

Parent doc: `docs/architecture/gdpr-compliance.md`

## Terminology & Product Alignment

| PRODUCT.md | Code | UI (Polish) |
|------------|------|-------------|
| Usuwanie konta / dwufazowe | `requestDeletion` mutation | "Usun konto" button in settings |
| Okres karencji / grace period | `user.deletedAt` + 14-day `hard-delete-user` delayed job | "Twoje konto jest w trakcie usuwania. Moze to potrwac do 14 dni." |
| Anonimizacja | `processHardDeleteUser()` in `queue-ops.ts` | "Usunięty użytkownik" (seen by other users) |
| Ping / wave | `waves` table | "Ping" (UI), "wave" (code) |

## Phase 1: Soft-Delete

#### What

The `accounts.requestDeletion` tRPC mutation (in `apps/api/src/trpc/procedures/accounts.ts`) requires OTP verification, then calls the shared `softDeleteUser()` service function.

**Trigger flow:**
1. User taps "Usun konto" in mobile settings
2. OTP sent to user's email (reuses existing sign-in OTP flow)
3. User enters 6-digit OTP code
4. Backend verifies OTP via `auth.api.verifyEmailOTP()`
5. Calls `softDeleteUser(userId)` from `apps/api/src/services/user-actions.ts`

**`softDeleteUser()` — transaction (atomic):**
- Set `user.deletedAt = now()`
- Delete all rows from `session` for this userId (logs out everywhere)
- Delete all rows from `pushTokens` for this userId (stops push notifications)

**Post-transaction (non-atomic):**
- Emit `forceDisconnect` via `publishEvent("forceDisconnect", { userId })` (Redis pub/sub bridge in `apps/api/src/ws/redis-bridge.ts`), which fans out to **every API replica** and broadcasts `{ type: "forceDisconnect" }` to all WebSocket connections for this userId. Cross-replica delivery matters because the WS connection may live on a different replica from the one that handled the deletion request — a local-only `EventEmitter` would miss it.
- Enqueue `hard-delete-user` BullMQ job with 14-day delay

**Admin path:** Admin panel uses the same `softDeleteUser()` function via the `admin-soft-delete-user` BullMQ job (no OTP required). See `admin-panel.md`.

#### Why

OTP verification prevents account deletion via stolen session tokens. Deleting sessions and push tokens immediately ensures no further notifications or API access. The WebSocket force-disconnect closes real-time connections since session tokens are now invalid.

#### Config

- OTP length: 6 digits
- Grace period: 14 days (1,209,600,000 ms), configured as `FOURTEEN_DAYS_MS` in `enqueueHardDeleteUser()`
- BullMQ job ID: `hard-delete-${userId}` (deterministic, enables cancellation lookup)
- Queue name: `ops` (operations queue — BLI-171 split `ai-jobs` into `ai`/`ops`/`maintenance`; `hard-delete-user` runs on `ops`, enqueued via `enqueueHardDeleteUser()` in `queue-ops.ts`)

## Login Block During Grace Period

#### What

The `isAuthed` tRPC middleware (in `apps/api/src/trpc/trpc.ts`) checks `user.deletedAt` on every authenticated request. If set, it throws a `FORBIDDEN` error with message `"ACCOUNT_DELETED"`. This uses a prepared statement (`user_deleted_at`) for performance.

#### Why

Even though sessions are deleted during soft-delete, a user could theoretically create a new session (e.g., via OAuth re-authentication). The middleware is the last line of defense.

#### Config

- Prepared statement name: `user_deleted_at`
- Error code: `FORBIDDEN`
- Error message: `"ACCOUNT_DELETED"` (mobile app checks this string to show the Polish-language error alert)

## Discovery Filtering

#### What

During the grace period, soft-deleted users must be invisible everywhere: nearby queries, group discovery, status matching, wave lists, all user-facing surfaces. Standard pattern: INNER JOIN to `user` table with `isNull(schema.user.deletedAt)`.

#### Why

A user who requested deletion should immediately vanish from others' views, even before anonymization runs. After anonymization this filtering is redundant (profile data is generic) but remains as a safety net.

## Job Cancellation

#### What

`cancelHardDeleteUser()` in `queue-ops.ts` looks up the BullMQ job by its deterministic ID (`hard-delete-${userId}`) and removes it. Used by `restoreUser()` in `apps/api/src/services/user-actions.ts`.

#### Why

No user-facing restore flow exists by design. Admin can restore accounts via the admin panel "Przywróć konto" action, which enqueues an `admin-restore-user` BullMQ job → calls `restoreUser(userId)` → clears `deletedAt` + cancels the pending hard-delete job.

## Phase 2: Anonymization

#### What

The `processHardDeleteUser()` function in `apps/api/src/services/queue-ops.ts` runs after the 14-day delay. Despite the legacy function name ("hard delete"), it performs anonymization, not deletion.

**Idempotency check:** If `user.anonymizedAt` is already set, the job logs and skips. This prevents double-processing if the job is retried.

### Step 1: S3 File Deletion

Reads `profiles.avatarUrl` and `profiles.portrait` before overwriting profile data. Extracts S3 keys via regex (`/uploads\/[^?]+/`), then deletes each key individually. Errors are logged but do not abort the job.

### Step 2: Anonymize User and Profile (Transaction)

All PII overwrites happen in a single database transaction. If any step fails, everything rolls back.

**`user` table (6 fields):**

| Field | Anonymized value |
|-------|-----------------|
| `name` | `"Usunięty użytkownik"` |
| `email` | `"${crypto.randomUUID()}@deleted.localhost"` |
| `emailVerified` | `false` |
| `image` | `null` |
| `updatedAt` | current timestamp |
| `anonymizedAt` | current timestamp |

**`profiles` table (26 fields):**

| Field | Anonymized value |
|-------|-----------------|
| `displayName` | `"Usunięty użytkownik"` |
| `avatarUrl` | `null` |
| `bio` | `""` (empty string) |
| `lookingFor` | `""` (empty string) |
| `socialLinks` | `null` |
| `visibilityMode` | `"ninja"` |
| `interests` | `null` |
| `embedding` | `null` |
| `portrait` | `null` |
| `portraitSharedForMatching` | `false` |
| `isComplete` | `false` |
| `currentStatus` | `null` |
| `statusExpiresAt` | `null` |
| `statusEmbedding` | `null` |
| `statusSetAt` | `null` |
| `statusVisibility` | `"public"` |
| `statusCategories` | `null` |
| `dateOfBirth` | `null` |
| `superpower` | `null` |
| `superpowerTags` | `null` |
| `offerType` | `null` |
| `doNotDisturb` | `false` |
| `latitude` | `null` |
| `longitude` | `null` |
| `lastLocationUpdate` | `null` |
| `updatedAt` | current timestamp |

**`profilingSessions` table (3 fields nullified):**

| Field | Anonymized value |
|-------|-----------------|
| `generatedBio` | `null` |
| `generatedLookingFor` | `null` |
| `generatedPortrait` | `null` |

**`profilingQA` table (1 field nullified):**

| Field | Anonymized value |
|-------|-----------------|
| `answer` | `null` |

Questions are not nullified because they are generic AI-generated prompts, not personal data.

### Step 3: Anonymize Metrics (Outside Transaction)

Runs outside the main transaction because metrics live in a separate PostgreSQL schema (`metrics`) and are non-critical.

**`metrics.requestEvents` table:**

| Field | Anonymized value |
|-------|-----------------|
| `userId` | `null` (where it matched this user) |
| `targetUserId` | `null` (where it matched this user) |

**`metrics.aiCalls` table:**

| Field | Anonymized value |
|-------|-----------------|
| `userId` | `null` (where it matched this user) |
| `targetUserId` | `null` (where it matched this user) |
| `inputJsonb` | `null` (for any row referencing the user via `userId` or `targetUserId`) |
| `outputJsonb` | `null` (for any row referencing the user via `userId` or `targetUserId`) |

Input/output JSONB payloads carry bio / lookingFor / display names = PII. They're already nulled after 24h by `prune-ai-call-payloads`, but hard-delete nulls them immediately for the fresh-within-24h window.

Both tables are wiped in the same post-transaction phase (`queue-ops.ts` hard-delete processor). Errors are caught and logged but do not fail the job — metrics anonymization is best-effort, the user-facing identity in `user`/`profiles` has already been overwritten inside the transaction.

### What Gets Preserved

The following tables are **not touched** by the anonymization job. All rows remain intact:

| Table | Why preserved |
|-------|---------------|
| `waves` | Other users' sent/received wave history. FK to `user.id` now points to "Usunięty użytkownik". |
| `messages` | Conversation history for other participants. `senderId` FK resolves to anonymized user name. |
| `conversations` | Conversation metadata. `creatorId` FK resolves to anonymized user. |
| `conversationParticipants` | Membership records. Preserved so conversations remain navigable. |
| `messageReactions` | Reaction records from/to this user. |
| `blocks` | Block relationships. Prevents re-registration harassment. |
| `statusMatches` | Historical match records. |
| `connectionAnalyses` | AI analysis text. May reference the anonymized user's former traits but user identity is now generic. |
| `conversationRatings` | Conversation feedback data. |

#### Why

Preserving relational data maintains conversation history for other users. The deleted user appears as "Usunięty użytkownik" everywhere via FK references to `user.name`. This is the same pattern used by Slack, Discord, and other messaging platforms.

#### Config

- Anonymized display name: `"Usunięty użytkownik"` (Polish for "Deleted user")
- Anonymized email domain: `@deleted.localhost` (not a deliverable domain)
- Anonymized visibility mode: `"ninja"` (most restrictive)
- S3 key extraction regex: `/uploads\/[^?]+/`

## Tables Affected by Cascade Delete

The `user` table has `ON DELETE CASCADE` foreign keys on:

| Table | FK column | Effect |
|-------|-----------|--------|
| `session` | `userId` | Already deleted in Phase 1 transaction |
| `account` | `userId` | Would cascade if user row deleted (but we don't delete it) |
| `profiles` | `userId` | Would cascade (but we anonymize instead) |
| `profilingSessions` | `userId` | Would cascade (but we anonymize instead) |

Since we anonymize rather than delete the `user` row, these cascades never fire during normal flow. The cascade constraints remain as a safety net.

## Impact Map

If you change this system, also check:

- **Adding new PII fields to `profiles` or `user`** -- add them to the anonymization SET clause in `processHardDeleteUser()` and to the data export in `data-export.ts`
- **Adding new tables with user FK** -- decide if rows should be preserved (add to "What Gets Preserved") or anonymized (add to the transaction)
- **Changing the grace period** -- update `FOURTEEN_DAYS_MS` in `enqueueHardDeleteUser()`, update privacy policy retention text, update terms of service section 7
- **Adding user-facing restore** -- currently admin-only via admin panel → `restoreUser()`. Would need new tRPC mutation, mobile UI, and re-login flow
- **Changing `softDeleteUser()` or `restoreUser()`** -- shared service functions in `user-actions.ts`. Called by both user tRPC (`requestDeletion`) and admin BullMQ workers. Changes affect both paths
- **Changing the isAuthed middleware** -- verify `deletedAt` check is preserved and uses prepared statement
- **Changing S3 upload paths** -- verify the regex in `processHardDeleteUser()` still extracts keys correctly
- **New tables checklist** -- `docs/architecture/gdpr-compliance.md` "New Table Checklist" section
