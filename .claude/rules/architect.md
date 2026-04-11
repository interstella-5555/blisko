# `architect` — Architecture compliance guard

Architecture reference docs live in `docs/architecture/`. These are the source of truth for system design decisions, data flows, compliance approach, and infrastructure patterns.

## Directives

- `architect/must-read-first` — BEFORE starting implementation of any task, you MUST read at least one architecture doc relevant to the change. State which doc(s) you read and confirm alignment before writing code. If no doc is relevant, state that explicitly.

- `architect/flag-deviations` — If a planned change contradicts documented architecture, STOP and notify the user. Explain the conflict: what the doc says vs what the change does. Ask whether to update the architecture or revise the change.

- `architect/must-update-after` — BEFORE creating a PR, run `/architecture-update` to update architecture docs to reflect code changes. Architecture docs must stay current with the code.

- `architect/code-review-gate` — During code review, run `/architecture-review` alongside `/code-review:code-review`. It checks: undocumented schema changes, new services missing from docs, changed data flows, GDPR gaps, privacy leaks.

- `architect/new-table-checklist` — When a new table is added: (1) update `database.md`, (2) check GDPR impact (`gdpr-compliance.md`), (3) check if data-export needs updating, (4) check if soft-delete filtering applies.

## Skills

| Skill | When | What |
|-------|------|------|
| `/architecture-review` | During code review | Read-only. Checks changes against architecture. Produces findings. |
| `/architecture-update` | After implementation, before PR | Edits docs to reflect code changes. |
| `/architecture-compile` | Periodic maintenance | Deep scan: all code vs all docs. Finds gaps. |

## Architecture doc index

| Doc | Covers |
|-----|--------|
| `database.md` | Full schema — tables, columns, indexes, relations, metrics schema |
| `ai-matching.md` | Tiered scoring (T1 cosine, T2 quick-score, T3 analysis), prompts |
| `ai-profiling.md` | Onboarding Q&A, portrait/bio/interest generation, moderation |
| `queues-jobs.md` | BullMQ queue, all job types, retry policies, Redis usage |
| `websockets-realtime.md` | WS events (22 types), Redis pub/sub bridge, subscriptions |
| `auth-sessions.md` | Better Auth, OAuth providers, magic link, dev login |
| `user-profiles.md` | Profile model, visibility modes, DND, superpower, status |
| `waves-connections.md` | Wave lifecycle, mutual ping, status snapshots |
| `messaging.md` | DM/group chat, reactions, replies, topics, bilateral delete |
| `groups-discovery.md` | Group creation, discovery, invite codes, roles, nearby members |
| `status-matching.md` | Categories, public/private, ambient matching, privacy rules |
| `push-notifications.md` | Expo Push, collapse IDs, unread suppression, ambient push |
| `location-privacy.md` | Grid-based privacy, nearby queries, blocking filter |
| `gdpr-compliance.md` | Two-phase deletion, anonymization, data export overview |
| `blocking-moderation.md` | Block system, AI content moderation |
| `onboarding-flow.md` | Onboarding steps, ghost profiles |
| `mobile-architecture.md` | RN/Expo, navigation, stores, conventions |
| `infrastructure.md` | Railway services, deployment, monorepo, external services |
| `account-deletion.md` | Soft/hard delete flow |
| `data-export.md` | GDPR data portability |
| `instrumentation.md` | Request events, Prometheus, SLOs |
| `rate-limiting.md` | Sliding window, Redis Lua, limits |
| `privacy-terms.md` | RODO/GDPR legal docs |
| `nearby-group-members.md` | Group members on map |
| `admin-panel.md` | Admin TanStack Start app — pages, BullMQ-based write actions, auth |
| `ai-cost-tracking.md` | `withAiLogging` wrapper, `metrics.ai_calls` buffering, pricing |
| `demo-chatbot.md` | Seed user AI responder app — polling, accept curves, dev-login |
| `monetization.md` | Subscription tiers (planned, not implemented) |
| `friends-system.md` | Friends/contacts (planned, not implemented) |
| `e2e-test-coverage.md` | E2E test coverage map (flow → test status) |
