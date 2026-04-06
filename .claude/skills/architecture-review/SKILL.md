---
name: architecture-review
description: "Use when reviewing code changes or PRs to verify alignment with documented architecture. Read-only — produces findings, does not edit docs. Triggers: 'architecture review', 'check architecture', '/architecture-review'."
---

# Architecture Review — Code Review Gate

Verify that code changes align with documented architecture. Produce findings. Do NOT edit architecture docs (that's `/architecture-update`).

## Procedure

### 1. Gather changes

```bash
# What changed on this branch vs main
git diff origin/main...HEAD --name-only
git diff origin/main...HEAD --stat
```

Identify affected files and domains.

### 2. Map changes to architecture domains

Read `docs/architecture/` index from `.claude/rules/architect.md`. For each changed file, identify which architecture doc(s) are relevant:

| Changed file pattern | Architecture doc |
|---------------------|-----------------|
| `apps/api/src/db/schema.ts` | `database.md` |
| `apps/api/drizzle/` | `database.md` |
| `apps/api/src/services/ai.ts` | `ai-matching.md` |
| `apps/api/src/services/profiling-ai.ts` | `ai-profiling.md` |
| `apps/api/src/services/queue.ts` | `queues-jobs.md` |
| `apps/api/src/ws/` | `websockets-realtime.md` |
| `apps/api/src/auth.ts` | `auth-sessions.md` |
| `apps/api/src/trpc/procedures/profiles.ts` | `user-profiles.md`, `status-matching.md` |
| `apps/api/src/trpc/procedures/waves.ts` | `waves-connections.md` |
| `apps/api/src/trpc/procedures/messages.ts` | `messaging.md` |
| `apps/api/src/trpc/procedures/groups.ts` | `groups-discovery.md` |
| `apps/api/src/trpc/procedures/accounts.ts` | `gdpr-compliance.md` |
| `apps/api/src/services/push.ts` | `push-notifications.md` |
| `apps/api/src/services/data-export.ts` | `gdpr-compliance.md` |
| `apps/api/src/services/moderation.ts` | `blocking-moderation.md` |
| `apps/api/src/services/rate-limiter.ts` | `rate-limiting.md` |
| `apps/mobile/` | `mobile-architecture.md` |

### 3. Read relevant architecture docs

Read each mapped doc. Note the "Impact Map" section at the end — it lists what else might be affected.

### 4. Check for violations

For each change, verify:

**Schema changes:**
- [ ] New table/column documented in `database.md`?
- [ ] New table -> GDPR checklist: anonymization job? data export? soft-delete filtering?
- [ ] Index strategy makes sense per documented patterns?

**AI changes:**
- [ ] Private status never leaks in AI prompts or outputs?
- [ ] New AI calls go through queue (never synchronous in request handlers)?
- [ ] Model/temperature/token limits match documented values?

**Queue changes:**
- [ ] New job type documented in `queues-jobs.md`?
- [ ] Retry/backoff strategy appropriate?
- [ ] Debouncing where needed?

**WebSocket changes:**
- [ ] New event type documented in `websockets-realtime.md`?
- [ ] Events published via Redis bridge (not just local EventEmitter)?

**GDPR:**
- [ ] New PII fields included in anonymization job?
- [ ] New data included in data export?
- [ ] Soft-deleted users filtered from new queries (INNER JOIN pattern)?

**Privacy:**
- [ ] Private status content not leaked through AI descriptions, snippets, or match reasons?
- [ ] Location precision matches grid-based privacy approach?
- [ ] Blocking filter applied to new user-facing queries?

**Push notifications:**
- [ ] Group messages use collapseId suppression?
- [ ] DM messages have no suppression?
- [ ] Ambient push has cooldown?

### 5. Report findings

Format findings as:

```
## Architecture Review Findings

### Aligned
- [list of things that correctly follow architecture]

### Issues
1. **[SEVERITY]** [description] — Architecture doc `X.md` says Y, but code does Z.

### Missing documentation
- [changes that need architecture doc updates — recommend running /architecture-update]
```

Severity levels: **CRITICAL** (privacy/GDPR/data integrity), **HIGH** (undocumented behavior change), **MEDIUM** (missing doc update), **LOW** (style/convention).

### 6. Append to review log

After reporting, append a summary to `docs/architecture/.review-log.md` (create if doesn't exist). This feeds the `/architecture-compile` feedback loop.

```markdown
## YYYY-MM-DD — Review of [branch/PR]

**Issues found:** N (X critical, Y high, Z medium)
**Key findings:**
- [one-line summary per issue]
**Patterns:** [any recurring issue type, e.g., "missing soft-delete filter" — 3rd time in 5 reviews]
```

Keep entries concise — one review = one section. The compile skill reads this log to prioritize its checks.
