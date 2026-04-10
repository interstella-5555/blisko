# E2E Test Coverage

> v1.1 — 2026-04-06
> Updated 2026-04-10 — synced with current test files (removed 6 dead tests referencing deleted UI, added onboarding-ghost, create-group; documented seeded chat test flow).

Tracks which user flows have Maestro E2E tests. Use `/e2e-flow-testing` skill to add new tests.

## Terminology & Product Alignment

| PRODUCT.md | Code / Test | Notes |
|------------|-------------|-------|
| Ping | Wave / send-wave | "Ping" in product, "wave" in code |
| Czat | Chat / conversation | DM and group chat |
| Onboarding | Profiling / onboarding flow | AI-driven Q&A |

## Test Infrastructure

- **Test directory:** `apps/mobile/.maestro/`
- **Config:** `.maestro/config.yaml` — controls which tests `maestro test .maestro/` discovers (top-level only by default; seeded tests in `chat/` and `groups/` run via scripts).
- **Sub-flows (reusable):**
  - `sub-flows/launch-and-dismiss-dev.yaml` — launches app with clear state, sets Warsaw location, dismisses dev launcher
  - `sub-flows/dismiss-dev-menus.yaml` — taps metro URL (regex `http://.*:8081`) then "Continue"/"Go home" — skipped when `RELEASE_BUILD=true`
  - `sub-flows/login-fresh.yaml` — creates a new user via email login + ghost profile onboarding
  - `sub-flows/login-seeded.yaml` — logs in a pre-seeded user via `${EMAIL}` env var (skips onboarding)
- **Fresh-user tests** (no API seeding): run directly with `bun run --filter '@repo/mobile' test:e2e` — covers `onboarding.yaml`, `onboarding-ghost.yaml`
- **Seeded chat tests** (require live API + user/conversation seed): run via `apps/mobile/.maestro/chat/run-all.sh` or `run-test.sh <test> <mode>`. Seeds users via `/dev/auto-login` + `/dev/mark-complete` + `/dev/send-message` endpoints (gated by `ENABLE_DEV_LOGIN=true`). Cleanup via `bun --env-file=apps/api/.env.production run dev-cli -- cleanup-e2e` (deletes users matching `seed%@example.com`).
- **Keyboard handling:** Maestro's `hideKeyboard` is unreliable with React Native inputs — all tests use `tapOn: point: "50%,10%"` to dismiss the keyboard by tapping a non-interactive area.

## Status Legend

- **approved** — test written, passing, user-approved
- **untested** — no E2E test exists
- **skipped** — intentionally not tested (hidden feature, known broken, etc.)

## Core Flows

| Flow | Status | Test File | Seed | Notes |
|------|--------|-----------|------|-------|
| Auth: Email OTP login | untested | — | — | Covered indirectly by onboarding test; previous `auth/login.yaml` referenced removed login text and was deleted |
| Auth: OAuth login (Apple/Google/FB/LinkedIn) | untested | — | — | Requires real OAuth credentials |
| Onboarding: Full profile (questions → AI generation) | approved | `onboarding.yaml` | fresh | ~2 min; AI generation up to 600s timeout |
| Onboarding: Ghost profile | approved | `onboarding-ghost.yaml` | fresh | ~35s; deterministic fast path |
| Map: View nearby users | untested | — | — | |
| Map: Tap bubble → view profile | untested | — | — | Previous `profile/view-profile.yaml` referenced buttons moved to settings |
| Ping: Send ping to nearby user | untested | — | — | Waves tab was removed; send-wave test was dead, deleted |
| Ping: Receive and accept ping | untested | — | — | |
| Ping: Mutual ping auto-accept | untested | — | — | |
| Ping: Decline with 24h cooldown | untested | — | — | |
| Ping: Empty waves list | untested | — | — | Waves tab removed from app |
| Chat: Empty chats screen | approved | `chat/empty-chats.yaml` | `empty` | |
| Chat: Conversation list | approved | `chat/conversation-list.yaml` | `messages` | |
| Chat: Send message in DM | approved | `chat/send-message.yaml` | `basic` | |
| Chat: Read receipts | approved | `chat/read-receipts.yaml` | `unread` | Uses `chat-back-btn` testID to navigate back |
| Chat: Reply to message | approved | `chat/reply-message.yaml` | `messages` | |
| Chat: Delete message | approved | `chat/delete-message.yaml` | `messages` | Targets known seed message from User A |
| Chat: Message reactions | approved | `chat/emoji-reaction.yaml` | `messages` | Taps `reaction-❤️` testID in context menu bar |
| Chat: Pagination (infinite scroll) | approved | `chat/pagination.yaml` | `many` | 60 messages, scroll UP in inverted list |
| Chat: Search messages | untested | — | — | `chat-search-btn` / `chat-search-input` testIDs not present in current app |
| Status: Set status with categories | untested | — | — | |
| Status: Public vs private visibility | untested | — | — | |
| Status: Match notification (pulsing bubble) | untested | — | — | |
| Groups: Create group | approved | `groups/create-group.yaml` | seeded | Requires user with `isComplete` profile — uses `login-seeded` |
| Groups: Join via invite code | untested | — | — | |
| Groups: Discover nearby group | untested | — | — | |
| Groups: Group chat with topics | untested | — | — | |
| Profile: Edit bio/lookingFor | untested | — | — | Previous `profile/edit-profile.yaml` referenced nav path that changed (now in settings) |
| Profile: Change visibility mode | untested | — | — | |
| Profile: Set DND | untested | — | — | |
| Profile: Set superpower | untested | — | — | |
| Settings: Block user | untested | — | — | |
| Settings: Account deletion (soft-delete) | untested | — | — | |
| Settings: Data export request | untested | — | — | |
| Push: Receive ping notification | untested | — | — | |
| Push: Receive message notification | untested | — | — | |

## Summary

**11 / 37 flows covered** (~30%). Strongest coverage: chat DM (8/9 — search uncovered), onboarding (2/2). Weakest: auth direct (0/2), waves (0/5 — waves tab removed from app), groups (1/4), status (0/3), profile (0/4), settings (0/3), push (0/2).

Chat tests require live API with `ENABLE_DEV_LOGIN=true` and must be run via `chat/run-all.sh` which seeds users per test. Default `maestro test .maestro/` only covers top-level tests (`onboarding.yaml`, `onboarding-ghost.yaml`) per `config.yaml`.

## Impact Map

If you change this system, also check:
- **`apps/mobile/.maestro/sub-flows/`** — shared login/setup flows used by all tests
- **`apps/mobile/.maestro/config.yaml`** — controls which tests `maestro test .maestro/` discovers by default
- **`apps/mobile/.maestro/chat/run-all.sh`** + **`run-test.sh`** + **`seed-chat.sh`** — seeding runner for chat tests
- **`apps/api/src/index.ts`** — `/dev/auto-login`, `/dev/mark-complete`, `/dev/send-message` endpoints used by seed script (gated by `ENABLE_DEV_LOGIN=true`)
- **`packages/dev-cli/src/cli.ts`** — `cleanup-e2e` and `count-e2e` commands for removing seed users from DB
- **`apps/api/src/trpc/procedures/`** — API endpoints exercised by tests
- **`apps/mobile/app/`** — screen components and navigation tested by E2E flows (testID stability matters for asserts)
