# Account Suspension

> v1 — 2026-04-22 (BLI-156).

Admin-driven moderation state distinct from user-initiated account deletion. A suspended user cannot log in or reach any API surface; discovery hides them; conversations are preserved with a client-rendered "Konto zawieszone" indicator.

Source: `apps/api/src/services/user-actions.ts` (`suspendUser`, `unsuspendUser`), `apps/api/src/auth.ts` (pre-auth gates), `apps/api/src/trpc/trpc.ts` (isAuthed middleware), `apps/api/src/services/queue-ops.ts` (`admin-suspend-user`, `admin-unsuspend-user`), `apps/admin/src/routes/dashboard/users.tsx` (admin UI), `apps/api/src/db/filters.ts` (`userIsActive()` filter).

## Terminology

| PRODUCT.md term | Code term | UI (Polish) |
|-----------------|-----------|-------------|
| Suspension / ban (partially aligned) | `user.suspendedAt` + `user.suspendReason`, `suspendUser()` | "Zawieszone" (admin), "Konto zawieszone" (mobile) |

Ban was considered during design and explicitly dropped — suspension is reversible by design (admin → unsuspend or → soft-delete), so "ban" would be misleading.

## Data Model

Two columns on `user`, both nullable:

| Column | Type | Purpose |
|--------|------|---------|
| `suspendedAt` | `timestamp` | When suspension was applied. Null = account is active. |
| `suspendReason` | `text` | Admin-only audit trail. Never leaked to the suspended user, to other users, or to mobile clients. |

Partial index `user_suspended_at_idx` on `(suspendedAt) WHERE suspendedAt IS NOT NULL`. Stays small because the 99.9% case is null.

No auto-expiry field — either suspended or not. Temporary holds and graded escalations (1 day / 7 days) are out of scope; admin unsuspends or soft-deletes.

## Service Functions

`apps/api/src/services/user-actions.ts`:

- `suspendUser(userId, reason)` — guards re-suspension as a no-op. Transaction: set `suspendedAt`, set `suspendReason`, delete sessions, delete push tokens, auto-decline every pending wave involving the user (both directions, `status = 'declined'`, `respondedAt = now()`). Post-transaction: `publishEvent("forceDisconnect", { userId })` closes live WebSockets across replicas.
- `unsuspendUser(userId)` — clears both `suspendedAt` and `suspendReason`. No side effects — admin already decided to re-enable the account.

**Rule:** DB writes in transaction, side effects outside — matches `softDeleteUser()` shape exactly.

## Pre-Auth Gates (Better Auth)

Applied in `apps/api/src/auth.ts`.

#### (a) `emailOTP.sendVerificationOTP` early-return
On the `sign-in` path, look up the target user by email before sending the OTP. If `suspendedAt` or `deletedAt` is set, throw `APIError("FORBIDDEN", { message: "ACCOUNT_SUSPENDED" | "ACCOUNT_DELETED" })`. No email is sent, no Resend quota is burned, and the sign-in screen catches the error immediately.

#### (b) `databaseHooks.session.create.before` catch-all
Runs for every session-creation path — OAuth callbacks (Apple, Google, Facebook, LinkedIn), email-OTP verify, dev auto-login. Loads the target user; throws if `suspendedAt` or `deletedAt` is set. No session row is created.

**Account linking interaction:** `accountLinking.enabled: true` + `allowDifferentEmails: true` means a suspended user who signs in with a previously-unlinked OAuth provider will have the new `account` row linked to their existing `user`. The `session.create.before` hook still fires, so no session is issued. The stranded `account` row becomes usable the moment admin unsuspends.

**Gap (out of scope for v1):** wholly-new-account signup on a previously-unseen email / provider bypasses all of this, because Better Auth creates a fresh `user` with a fresh `id`. Mitigation (phone verification, device fingerprint, reCAPTCHA on signup) is a separate moderation-infra ticket.

## isAuthed Middleware

`apps/api/src/trpc/trpc.ts` — `isAuthed` is the backstop. Prepared statement `user_deletion_state` selects `deletedAt` and `suspendedAt` for the authenticated userId on every tRPC call. Check order:

1. `deletedAt` set → `FORBIDDEN / ACCOUNT_DELETED` (unchanged).
2. `suspendedAt` set → `FORBIDDEN / ACCOUNT_SUSPENDED` (new).

The prepared statement keeps the cost negligible; both columns are on the already-hot `user` row.

## Discovery Filter: `userIsActive()`

`apps/api/src/db/filters.ts`:

```ts
export const userIsActive = () => and(isNull(schema.user.deletedAt), isNull(schema.user.suspendedAt));
```

Replaces raw `isNull(schema.user.deletedAt)` everywhere a join to `schema.user` is filtered. Call sites:

- `apps/api/src/trpc/procedures/profiles.ts` — `getNearbyUsers`, `getNearbyUsersForMap`, ensureAnalysis / getDetailedAnalysis gates (multiple occurrences)
- `apps/api/src/trpc/procedures/waves.ts` — wave send target lookup, sent list, getBlocked
- `apps/api/src/trpc/procedures/groups.ts` — group-member fetch (the variant that does filter out inactive peers)
- `apps/api/src/services/queue.ts` — pair analysis, status matching, proximity matching queries joining `user`
- `apps/api/src/services/consistency-sweep.ts` — zombie profile and stuck-session sweeps

**Deliberate exceptions** where we want suspended users *visible*:

- `messages.getConversations` — DM peer fetch. Keeps suspended peers so the mobile composer can render "Konto zawieszone". Filter stays on `deletedAt` only.
- `profiles.getById` — returns the profile with an `isSuspended: true` flag. Soft-deleted still hidden.
- `groups.getMembers` — returns suspended members with `isSuspended: true` so the mobile list renders the badge. Soft-deleted still hidden.

The `user.suspendReason` never leaves the admin surface.

## `messages.send` Block

`apps/api/src/trpc/procedures/messages.ts`: after the participant-verification check, one lookup for any non-self participant in the conversation whose `user.suspendedAt IS NOT NULL`. If found, throws `BAD_REQUEST / RECIPIENT_SUSPENDED`.

Group chats stay writable when only a subset of members are suspended — other members can still talk.

## Admin Surface

`apps/admin/src/server/routers/users.ts` — two new mutations:

| Mutation | Queue job | Service function |
|----------|-----------|-----------------|
| `admin.users.suspend({ userId, reason })` — reason min 3 / max 500 chars | `admin-suspend-user` | `suspendUser(userId, reason)` |
| `admin.users.unsuspend({ userId })` | `admin-unsuspend-user` | `unsuspendUser(userId)` |

Both go through `enqueueOpsAndWait` (BLI-154 pattern) — 15s timeout, admin gets synchronous success/failure.

Admin list filter gains a `"suspended"` option; status column renders the "Zawieszony" badge (outline variant, distinct from the destructive red "Usunięty"). User detail panel shows `suspendedAt` + `suspendReason`. Dropdown menu replaces the "Usuń konto" entry with "Zawieś konto" / "Odwieś konto" depending on state; soft-delete stays available as an escalation.

## Mobile Surface

1. **Sign-in / verify screens** — `authErrorMessages` maps `ACCOUNT_SUSPENDED` to a static Polish alert pointing at `kontakt@blisko.app`. Shared verbatim between `email.tsx` (OTP request) and `verify.tsx` (OTP verify) so whichever gate fires first renders the same copy.
2. **Root layout (`app/_layout.tsx`)** — `handleAccountBlocked` is the global Query/Mutation cache `onError`; it dispatches on both `ACCOUNT_DELETED` and `ACCOUNT_SUSPENDED` with distinct titles and copy, then signs out.
3. **DM composer** — `ChatInput` takes a `disabledReason` prop. `chat/[id].tsx` passes `"Konto zawieszone"` when `storeConversation.participant.isSuspended` is true (DM only). The banner appears above the input; text field and send button are disabled.
4. **Group members list (`(modals)/group/members/[id].tsx`)** — suspended members get an inline "Konto zawieszone" subtext under their display name. Messages they sent previously render unchanged.
5. **Conversations store shape** — `ConversationEntry.participant` gained a required `isSuspended: boolean`. Every place constructing a participant (store hydration, WS wave-accept handler, explicit wave-accept from user modal) sets it.

## What Gets Preserved vs Hidden

| Surface | Behavior for suspended users |
|---------|-----------------------------|
| Login (OTP request) | Blocked at `sendVerificationOTP` — no email sent |
| Login (OAuth / OTP verify / dev-login) | Blocked at `session.create.before` — no session created |
| Live API calls | Blocked at `isAuthed` — all tRPC procedures return `ACCOUNT_SUSPENDED` |
| WebSocket | `forceDisconnect` emitted when suspension applies; subsequent connects fail auth |
| Nearby, map, wave-send picker, matching | Hidden (server-side filter) |
| Pending waves (either direction) | Auto-declined inside the suspension transaction |
| DM conversations | Preserved; composer disabled for peers |
| Group membership | Preserved; badge rendered in members list |
| Historical messages, waves, conversation metadata | Preserved (same as soft-delete) |
| `suspendReason` visibility | Admin only — never returned to clients |

## Relationship to Other States

| State | Trigger | Reversible | Anonymization | Display name visible |
|-------|---------|------------|---------------|---------------------|
| Active | — | — | no | yes |
| Soft-delete (`deletedAt`) | User OTP or admin action | Admin restore (within 14d) | After 14d | "Usunięty użytkownik" after anonymization |
| **Suspended (`suspendedAt`)** | **Admin action only** | **Admin unsuspend, anytime** | **Never (admin escalates to soft-delete if desired)** | **Original `displayName` preserved** |
| Anonymized | 14d delayed BullMQ job after soft-delete | No | — | "Usunięty użytkownik" |

Suspension and soft-delete are not mutually exclusive in schema terms — both columns could be set. `isAuthed` checks `deletedAt` first, so a suspended-then-deleted account presents as `ACCOUNT_DELETED` to the user.

## Impact Map

If you change this system, also check:

- **`auth-sessions.md`** — pre-auth gates + `isAuthed` error codes live there.
- **`account-deletion.md`** — soft-delete and suspension share middleware gates; document changes should cross-reference.
- **`admin-panel.md`** — new mutations + UI actions appear in the actions table.
- **`blocking-moderation.md`** — user-to-user blocks are orthogonal but this doc complements them (admin moderation vs user-initiated).
- **`messaging.md`** — `RECIPIENT_SUSPENDED` is a new `messages.send` failure mode.
- **`user-profiles.md`** — `getById` now returns `isSuspended` on the payload.
- **`database.md`** — `user` table has two new columns and a partial index.
- **`queues-jobs.md`** — two new ops-queue job types (`admin-suspend-user`, `admin-unsuspend-user`).
- **Adding new discovery queries joining `user`** — must use `userIsActive()`, not raw `isNull(deletedAt)`.
- **Adding new admin moderation actions** — follow the same BullMQ → service-function shape; add admin UI via the same actions panel.
