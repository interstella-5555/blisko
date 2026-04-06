# E2E Test Coverage

> v1.1 — 2026-04-06

Tracks which user flows have Maestro E2E tests. Use `/e2e-flow-testing` skill to add new tests.

## Terminology & Product Alignment

| PRODUCT.md | Code / Test | Notes |
|------------|-------------|-------|
| Ping | Wave / send-wave | "Ping" in product, "wave" in code |
| Czat | Chat / conversation | DM and group chat |
| Onboarding | Profiling / onboarding flow | AI-driven Q&A |

## Test Infrastructure

- **Test directory:** `apps/mobile/.maestro/`
- **Sub-flows (reusable):** `sub-flows/login-fresh.yaml`, `sub-flows/login-seeded.yaml`, `sub-flows/launch-and-dismiss-dev.yaml`
- **Setup script:** `apps/mobile/scripts/e2e-setup.ts`
- **Run:** `bun run --filter '@repo/mobile' test:e2e`

## Status Legend

- **approved** — test written, passing, user-approved
- **untested** — no E2E test exists
- **skipped** — intentionally not tested (hidden feature, known broken, etc.)

## Core Flows

| Flow | Status | Test File | Notes |
|------|--------|-----------|-------|
| Auth: Email OTP login | approved | `auth/login.yaml` | |
| Auth: OAuth login (Apple/Google/FB/LinkedIn) | untested | — | Requires real OAuth credentials |
| Onboarding: Full profile (questions -> AI generation) | approved | `onboarding.yaml` | |
| Onboarding: Ghost profile (skip) | untested | — | |
| Map: View nearby users | untested | — | |
| Map: Tap bubble -> view profile | approved | `profile/view-profile.yaml` | |
| Ping: Send ping to nearby user | approved | `waves/send-wave.yaml` | |
| Ping: Receive and accept ping | untested | — | |
| Ping: Mutual ping auto-accept | untested | — | |
| Ping: Decline with 24h cooldown | untested | — | |
| Ping: Empty waves list | approved | `waves/empty-waves.yaml` | |
| Chat: Conversation list | approved | `chat/conversation-list.yaml` | |
| Chat: Empty chats screen | approved | `chat/empty-chats.yaml` | |
| Chat: Send message in DM | approved | `chat/send-message.yaml` | |
| Chat: Message reactions | approved | `chat/emoji-reaction.yaml` | |
| Chat: Reply to message | approved | `chat/reply-message.yaml` | |
| Chat: Delete message | approved | `chat/delete-message.yaml` | |
| Chat: Search messages | approved | `chat/search-messages.yaml` | |
| Chat: Read receipts | approved | `chat/read-receipts.yaml` | |
| Chat: Pagination (infinite scroll) | approved | `chat/pagination.yaml` | |
| Status: Set status with categories | untested | — | |
| Status: Public vs private visibility | untested | — | |
| Status: Match notification (pulsing bubble) | untested | — | |
| Groups: Create group | untested | — | |
| Groups: Join via invite code | untested | — | |
| Groups: Discover nearby group | untested | — | |
| Groups: Group chat with topics | untested | — | |
| Profile: Edit bio/lookingFor | approved | `profile/edit-profile.yaml` | |
| Profile: Change visibility mode | untested | — | |
| Profile: Set DND | untested | — | |
| Profile: Set superpower | untested | — | |
| Settings: Block user | untested | — | |
| Settings: Account deletion (soft-delete) | untested | — | |
| Settings: Data export request | untested | — | |
| Push: Receive ping notification | untested | — | |
| Push: Receive message notification | untested | — | |

## Summary

**15 / 36 flows covered** (42%). Strongest coverage: chat (9/10), auth+onboarding (2/3). Weakest: groups (0/4), status (0/3), settings (0/3), push (0/2).

## Impact Map

If you change this system, also check:
- **`apps/mobile/.maestro/sub-flows/`** — shared login/setup flows used by all tests
- **`apps/mobile/scripts/e2e-setup.ts`** — test environment setup
- **`apps/api/src/trpc/procedures/`** — API endpoints exercised by tests
- **`apps/mobile/app/`** — screen components and navigation tested by E2E flows
