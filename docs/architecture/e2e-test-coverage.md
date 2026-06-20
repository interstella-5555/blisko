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
  - `sub-flows/login-seeded-ua.yaml` — UA mirror of `login-seeded` (taps `locale-pill-ua` first)
  - `sub-flows/onboard-ghost-pl.yaml` / `onboard-ghost-ua.yaml` — v4 fresh login + Ninja onboarding, lands on the map. Reused by the fresh demo flows (`map-render`, `set-status`) so they don't need a seeded peer.
- **Fresh-user tests** (no API seeding): run directly with `bun run --filter '@repo/mobile' test:e2e` — covers `onboarding.yaml`, `onboarding-ghost.yaml`, `map-render.yaml`, `set-status.yaml` (+ UA mirrors)
- **Seeded chat tests** (require live API + user/conversation seed): run via `apps/mobile/.maestro/chat/run-all.sh` or `run-test.sh <test> <mode>`. Seeds users via `/dev/auto-login` + `/dev/mark-complete` + `/dev/send-message` endpoints (gated by `ENABLE_DEV_LOGIN=true`). Cleanup via `bun --env-file=apps/api/.env.production run dev-cli -- cleanup-e2e` (deletes users matching `seed%@example.com`).
- **Seeded demo tests** (BLI-300, require live API): the demo-critical seeded flows (`send-wave`, `profile-quickview`, `accept-wave-chat` + UA mirrors) live in `apps/mobile/.maestro/demo/`. Run via `bun run mobile:test:e2e:demo` (→ `demo/run-all.sh`) or `demo/run-test.sh <flow> <mode>`. `demo/seed-demo.sh` creates two nearby `test` users (A logged in, B ~70m away, both with avatars so they can ping); mode `incoming-ping` has B send a REAL ping to A so `accept-wave-chat` exercises the live ping → accept → conversation-creation path (not a pre-seeded conversation).
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
| Onboarding: Full profile (UA locale) | approved | `onboarding-ua.yaml` | fresh | UA mirror — taps `locale-pill-ua` first, asserts UA strings |
| Onboarding: Ghost profile | approved | `onboarding-ghost.yaml` | fresh | ~35s; deterministic fast path |
| Onboarding: Ghost profile (UA locale) | approved | `onboarding-ghost-ua.yaml` | fresh | UA mirror — taps `locale-pill-ua` first, asserts UA strings |
| Map: View nearby users | approved | `map-render.yaml` (+ `-ua`) | fresh | BLI-300 — asserts `nearby-map`, set-status pill, recenter button render |
| Map: Tap bubble → view profile | approved | `demo/profile-quickview.yaml` (+ `-ua`) | `nearby` | BLI-300 — opens peer B's profile modal from the nearby list, asserts name + "O mnie" |
| Ping: Send ping to nearby user | approved | `demo/send-wave.yaml` (+ `-ua`) | `nearby` | BLI-300 — A pings B from B's profile, asserts "Pingowano" state |
| Ping: Receive and accept ping | approved | `demo/accept-wave-chat.yaml` (+ `-ua`) | `incoming-ping` | BLI-300 — B's real ping → A accepts → live conversation → chat composer renders |
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
| Status: Set status with categories | approved | `set-status.yaml` (+ `-ua`) | fresh | BLI-300 — opens set-status sheet, picks category, types + submits, asserts active-status pill on map |
| Status: Public vs private visibility | skipped | — | — | Status is always public since BLI-289 — no visibility branching to test |
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

**16 / 37 flows covered** (~43%). Strongest coverage: chat DM (8/9 — search uncovered), onboarding (2/2), the demo-critical map/ping/status loop (5/5, BLI-300). Weakest: auth direct (0/2), groups (1/4), profile (0/4), settings (0/3), push (0/2).

Chat + demo seeded tests require a live API with `ENABLE_DEV_LOGIN=true` and run via their own runners (`chat/run-all.sh`, `demo/run-all.sh`) which seed users per flow. Default `maestro test .maestro/` covers the top-level fresh tests (`onboarding*.yaml`, `onboarding-ghost*.yaml`, `map-render*.yaml`, `set-status*.yaml`) per `config.yaml` — the seeded `chat/`, `groups/`, and `demo/` subfolders are not auto-discovered.

## PL / UA parity convention

Every onboarding-style flow has BOTH a PL variant (`<flow>.yaml`) and a UA variant (`<flow>-ua.yaml`). The UA variant taps `id: "locale-pill-ua"` as its first action (after `launch-and-dismiss-dev.yaml`) and uses the UA translations from `apps/mobile/src/locales/ua/messages.po` for all text assertions. See `.claude/rules/e2e.md`. Helper scripts:

- `bun run mobile:test:e2e:pl` — runs fresh PL flows only (onboarding, ghost, map-render, set-status)
- `bun run mobile:test:e2e:ua` — runs fresh UA mirrors only
- `bun run mobile:test:e2e:demo` — runs the seeded demo flows (send-wave, profile-quickview, accept-wave-chat) PL + UA, each with a fresh seed
- `bun run mobile:test:e2e` — runs everything top-level (config-gated)

## Impact Map

If you change this system, also check:
- **`apps/mobile/.maestro/sub-flows/`** — shared login/setup flows used by all tests
- **`apps/mobile/.maestro/config.yaml`** — controls which tests `maestro test .maestro/` discovers by default
- **`apps/mobile/.maestro/chat/run-all.sh`** + **`run-test.sh`** + **`seed-chat.sh`** — seeding runner for chat tests
- **`apps/mobile/.maestro/demo/run-all.sh`** + **`run-test.sh`** + **`seed-demo.sh`** — seeding runner for the demo-critical seeded flows (send-wave, profile-quickview, accept-wave-chat)
- **`apps/api/src/index.ts`** — `/dev/auto-login`, `/dev/mark-complete`, `/dev/send-message` endpoints used by seed scripts (gated by `ENABLE_DEV_LOGIN=true`)
- **`packages/dev-cli/src/cli.ts`** — `cleanup-e2e` and `count-e2e` commands for removing seed users from DB
- **`apps/api/src/trpc/procedures/`** — API endpoints exercised by tests
- **`apps/mobile/app/`** — screen components and navigation tested by E2E flows (testID stability matters for asserts)
