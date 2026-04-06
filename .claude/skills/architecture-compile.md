---
name: architecture-compile
description: "Use for deep maintenance scan of architecture documentation. Reads entire codebase and all architecture docs, finds gaps, outdated sections, and missing domains. Self-improving: learns from review history, detects drift from documented invariants, discovers undocumented code, verifies Impact Maps against real imports. Heavy operation — run periodically, not on every task. Triggers: 'compile architecture', 'architecture audit', 'deep architecture scan', 'verify architecture docs', '/architecture-compile'."
---

# Architecture Compile — Deep Verification Scan

Full codebase analysis to verify architecture docs are complete and accurate. Self-improving: uses past review findings to focus on weak spots, detects architectural drift from documented invariants, discovers undocumented code, and verifies Impact Maps against real import graphs.

## When to Run

- After a batch of features/fixes (e.g., end of sprint)
- After major refactors
- When onboarding a new developer
- When you suspect docs have drifted from code
- Periodically (monthly recommended)

## Procedure

### 1. Gather review history (feedback loop)

Before launching domain agents, check for past `/architecture-review` findings:

```bash
# Check recent PR review comments for architecture issues
gh pr list --state merged --limit 20 --json number,title | head -20
# Check if any review log exists
cat docs/architecture/.review-log.md 2>/dev/null
```

Also scan recent Linear tickets for architecture-related bugs or gaps. Look for patterns:
- Same type of issue found repeatedly → that domain needs deeper scrutiny
- Specific checks that keep failing (e.g., "missing soft-delete filter", "no rate limit on new endpoint") → add to that domain agent's checklist

Pass these patterns to domain agents as **priority checks** — things to look for first.

### 2. Launch parallel analysis agents

Dispatch one agent per architecture domain. Each agent:
1. Reads the architecture doc for its domain
2. Reads ALL relevant source files
3. Compares doc vs code
4. Checks priority patterns from step 1
5. Reports: accurate sections, outdated sections, missing sections, new undocumented features

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

### 3. New category discovery

After domain agents finish, scan for undocumented code:

```bash
# Find source files not covered by any domain agent
ls apps/api/src/services/*.ts
ls apps/api/src/trpc/procedures/*.ts
ls apps/api/src/trpc/middleware/*.ts
ls apps/mobile/src/stores/*.ts
ls apps/*/src/**/*.ts 2>/dev/null
```

For each file found:
1. Check if it maps to an existing architecture doc (use the Domain table above)
2. If no doc covers it → report as "Undocumented code"
3. Suggest: new architecture doc category, or extend an existing doc

Also check for new directories:
```bash
ls apps/  # Any new app not in infrastructure.md?
ls packages/  # Any new package?
```

### 4. Impact Map verification

For each architecture doc that has an Impact Map, verify entries against actual code dependencies:

```bash
# For each doc, grep imports in the source files it covers
# Example for waves-connections.md:
grep -r "from.*push\|import.*push" apps/api/src/trpc/procedures/waves.ts
grep -r "from.*queue\|import.*queue" apps/api/src/trpc/procedures/waves.ts
grep -r "from.*ws\|publishEvent\|ee.emit" apps/api/src/trpc/procedures/waves.ts
```

Compare found dependencies with Impact Map entries:
- Import exists but not in Impact Map → **missing cross-reference** (add it)
- Impact Map entry exists but no import → **stale cross-reference** (verify, may be indirect dependency)

Report as:
```markdown
### Impact Map Gaps
- `waves-connections.md` Impact Map missing: `push-notifications.md` (waves.ts imports push.ts)
- `messaging.md` Impact Map has stale ref: `xyz.md` (no import found — verify if indirect)
```

### 5. Architecture drift detection

Check documented invariants against actual code. Each invariant is a grep-able pattern.

**Invariant checks:**

| Invariant (from docs) | Grep pattern | Violation means |
|---|---|---|
| "All AI via queue, never synchronous" | `generateObject\|generateText\|embed` in `procedures/*.ts` (not in `services/`) | Synchronous AI call in request handler |
| "Private status never leaks" | `currentStatus` or `statusCategories` in AI prompts without privacy guard | Status text sent to LLM without checking visibility |
| "Soft-deleted users filtered" | `profiles` queries without `INNER JOIN.*user` or `isNull.*deletedAt` | Discovery query showing deleted users |
| "No star selects" | `.select()` without explicit columns in procedures | Fetching unnecessary columns |
| "WS events via Redis bridge" | `ee.emit` without corresponding `publishEvent` in same function | Event only delivered to local replica |
| "INNER JOIN not NOT IN for unbounded" | `notInArray.*select` pattern | Potentially slow NOT IN subquery |
| "Group push uses collapseId" | `sendPushToUser` in group message path without `collapseId` | Group messages buzzing on every message |
| "Blocking checked bidirectionally" | New user-facing query without block check | Blocked users visible |

Run each check:
```bash
# Example: AI calls outside services/
grep -rn "generateObject\|generateText\|embed(" apps/api/src/trpc/procedures/ --include="*.ts"

# Example: profiles queries without soft-delete filter
grep -rn "schema.profiles" apps/api/src/trpc/procedures/ --include="*.ts" -l
# Then for each file, check if it also has isNull(schema.user.deletedAt) or INNER JOIN user
```

Report as:
```markdown
### Architectural Drift
- **CRITICAL**: `procedures/newfile.ts` line area — queries profiles without soft-delete filter
- **HIGH**: `procedures/X.ts` — calls generateText directly (should be via queue)
- **MEDIUM**: `procedures/Y.ts` — new user-facing query without block check
```

### 6. PRODUCT.md alignment check

Read `PRODUCT.md` and compare with architecture docs:
- Features described in PRODUCT.md but not in architecture = planned features
- Architecture docs describing things not in PRODUCT.md = undocumented decisions
- Terminology mismatches (e.g., "ping" vs "wave")

### 7. CLAUDE.md cross-reference check

Scan CLAUDE.md for `<!-- arch-ref: docname.md -->` markers. For each marker, compare the CLAUDE.md section with the corresponding architecture doc. Report misalignments:

```markdown
### CLAUDE.md Drift
- `<!-- arch-ref: demo-chatbot.md -->` Seed users section: CLAUDE.md says X, doc says Y
```

### 8. Doc split/merge suggestions

Analyze doc sizes and overlaps:

```bash
wc -l docs/architecture/*.md | sort -rn
```

**Split candidates:** Docs > 500 lines → suggest extracting sub-domains into separate files.

**Merge candidates:** Docs < 50 lines (excluding placeholders) → suggest merging into a parent domain.

**Overlap detection:** For each pair of docs, check if the same source file appears in both domains' key source files. If >3 shared source files → flag potential overlap, suggest consolidation.

### 9. Compile report

Merge all findings into a single report:

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

### Undocumented Code (new category discovery)
- `apps/X/src/services/new-thing.ts` — not covered by any doc
- New directory `apps/admin/` — needs architecture doc

### Impact Map Gaps
- `doc.md` missing cross-ref to `other-doc.md` (import found)
- `doc.md` has stale cross-ref to `old-doc.md` (no import)

### Architectural Drift
- [invariant violations found in code]

### PRODUCT.md Alignment
- [product vision vs implementation gaps]

### CLAUDE.md Drift
- [cross-reference misalignments]

### Doc Structure
- [split/merge suggestions]

### Patterns from Past Reviews
- [recurring issues that should become rules or stronger doc coverage]
```

### 10. Present to user

Show the full report. Let user decide:
- Which outdated sections to fix now
- Which missing docs to create
- Which PRODUCT.md gaps to create Linear tickets for
- Which CLAUDE.md sections to sync
- Which architectural drift items are bugs vs intentional deviations
- Which recurring patterns should become new rules in `.claude/rules/`

### 11. Optionally: auto-fix

If user approves, run `/architecture-update` style edits for each outdated section. For new categories, create placeholder docs following the standard template.

### 12. Update review log

After compile completes, append key findings to `docs/architecture/.review-log.md`:

```markdown
## YYYY-MM-DD Compile

- X docs accurate, Y outdated, Z missing
- Key drift: [summary]
- New patterns: [summary]
- Actions taken: [what was fixed]
```

This log feeds into step 1 of the next compile run — closing the feedback loop.
