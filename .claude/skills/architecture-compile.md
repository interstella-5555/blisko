---
name: architecture-compile
description: "Use for deep maintenance scan of architecture documentation. Reads entire codebase and all architecture docs, finds gaps, outdated sections, and missing domains. Heavy operation — run periodically, not on every task. Also checks PRODUCT.md alignment. Triggers: 'compile architecture', 'architecture audit', 'deep architecture scan', 'verify architecture docs', '/architecture-compile'."
---

# Architecture Compile — Deep Verification Scan

Full codebase analysis to verify architecture docs are complete and accurate. Heavy operation — launches parallel agents for each domain.

## When to Run

- After a batch of features/fixes (e.g., end of sprint)
- After major refactors
- When onboarding a new developer
- When you suspect docs have drifted from code
- Periodically (monthly recommended)

## Procedure

### 1. Launch parallel analysis agents

Dispatch one agent per architecture domain. Each agent:
1. Reads the architecture doc for its domain
2. Reads ALL relevant source files
3. Compares doc vs code
4. Reports: accurate sections, outdated sections, missing sections, new undocumented features

**Domains to scan:**

| Domain | Doc | Key source files |
|--------|-----|-----------------|
| Database | `database.md` | `schema.ts`, `prepare.ts`, `drizzle/migrations/` |
| AI Matching | `ai-matching.md` | `services/ai.ts`, `services/queue.ts` (match processors) |
| AI Profiling | `ai-profiling.md` | `services/profiling-ai.ts`, `procedures/profiling.ts` |
| Queues | `queues-jobs.md` | `services/queue.ts` (all job types + worker config) |
| WebSockets | `websockets-realtime.md` | `ws/handler.ts`, `ws/events.ts`, `ws/redis-bridge.ts` |
| Auth | `auth-sessions.md` | `auth.ts`, `trpc/trpc.ts`, `trpc/context.ts` |
| Profiles | `user-profiles.md` | `procedures/profiles.ts`, `schema.ts` (profiles table) |
| Waves | `waves-connections.md` | `procedures/waves.ts` |
| Messaging | `messaging.md` | `procedures/messages.ts` |
| Groups | `groups-discovery.md` | `procedures/groups.ts` |
| Status | `status-matching.md` | `procedures/profiles.ts` (setStatus), `lib/status.ts` |
| Push | `push-notifications.md` | `services/push.ts`, `procedures/pushTokens.ts` |
| Location | `location-privacy.md` | `lib/grid.ts`, `procedures/profiles.ts` (updateLocation) |
| GDPR | `gdpr-compliance.md` | `procedures/accounts.ts`, `services/data-export.ts`, queue (hard-delete) |
| Blocking | `blocking-moderation.md` | `services/moderation.ts`, block queries in procedures |
| Onboarding | `onboarding-flow.md` | `mobile/app/onboarding/`, `procedures/profiling.ts` |
| Mobile | `mobile-architecture.md` | `mobile/app/`, `mobile/src/stores/` |
| Infra | `infrastructure.md` | `package.json` (scripts), Railway config |
| Rate Limiting | `rate-limiting.md` | `config/rateLimits.ts`, `services/rate-limiter.ts` |
| Monitoring | `instrumentation.md` | `services/metrics.ts`, `services/prometheus.ts` |

### 2. Collect findings

Merge all agent reports into a single document:

```markdown
## Architecture Compile Report — YYYY-MM-DD

### Accurate (no changes needed)
- [list of docs that match code]

### Outdated (needs update)
- `doc.md` section X: doc says A, code does B

### Missing (new features not documented)
- Feature Y exists in code but has no architecture doc

### Gaps (documented but not implemented)
- `doc.md` describes Z but code doesn't implement it

### PRODUCT.md Alignment
- [list of gaps between product vision and implementation]
```

### 3. PRODUCT.md alignment check

Read `PRODUCT.md` and compare with architecture docs:
- Features described in PRODUCT.md but not in architecture = planned features
- Architecture docs describing things not in PRODUCT.md = undocumented decisions
- Terminology mismatches (e.g., "ping" vs "wave")

### 4. CLAUDE.md cross-reference check

Scan CLAUDE.md for `<!-- arch-ref: docname.md -->` markers. For each marker, compare the CLAUDE.md section with the corresponding architecture doc. Report misalignments in the compile report under a new section:

```markdown
### CLAUDE.md Drift
- `<!-- arch-ref: demo-chatbot.md -->` Seed users section: CLAUDE.md says X, doc says Y
```

### 5. Present to user

Show the full report. Let user decide:
- Which outdated sections to fix now
- Which missing docs to create
- Which PRODUCT.md gaps to create Linear tickets for
- Which CLAUDE.md sections to sync

### 6. Optionally: auto-fix

If user approves, run `/architecture-update` style edits for each outdated section.
