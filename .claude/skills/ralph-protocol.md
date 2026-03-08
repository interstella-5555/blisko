---
name: ralph-protocol
description: Use when running as Ralph (autonomous queue worker), preparing tickets for Ralph ("przygotuj tickety na noc"), or generating a Ralph report ("ralph report", "co się stało w nocy"). Covers queue structure, task execution, signals, prep workflow, and reporting.
---

# Ralph Protocol

Autonomous worker — reads task files from `scripts/ralph-queue/`, implements them one by one. The queue directory is gitignored — it's runtime state, not tracked content.

Runner: `pnpm ralph` / `pnpm ralph:dry`

## How it works

1. Shell picks first `.md` file from the queue (sorted by 5-digit prefix)
2. Determines if first/last sub-task for the ticket (checks for other completed tasks with same ticket ID)
3. Claude implements, verifies, commits
4. Shell moves completed file to a `done` subdirectory

**Timeout & retry:** 10m per attempt, max 2 retries with `## Continuation context` describing prior progress.
**Rebase:** Only if branch is actually behind `origin/main`.
**Zero Linear API calls** — Linear automation detects branch names and sets In Progress / Done.

## Task file format

```
# BLI-42: Short description
Ticket: BLI-42
Branch: kwypchlo/bli-42-feature-name

## Task
What to implement.

## Files to modify
- exact/paths/here.ts

## Implementation
Detailed instructions, code snippets, approach.

## Acceptance criteria
- [ ] Criteria 1
- [ ] Criteria 2
```

## Queue structure

5-digit prefix = execution order (`00001-BLI-42-add-schema.md`). One branch per ticket (all sub-tasks share it). First sub-task: checkout from main. Last sub-task: merge to main.

## Scope discipline

Commit must match the task file's acceptance criteria — nothing more, nothing less. Unrelated issues → note in RALPH_BLOCKED or ignore.

## Verify steps

```
pnpm --filter @repo/api typecheck
pnpm --filter @repo/shared typecheck
pnpm --filter @repo/mobile typecheck
pnpm --filter @repo/api test
```

Only fix errors you introduced.

## Signals

- `RALPH_MERGED` — task done
- `RALPH_BLOCKED` — stuck, file renamed to `.blocked`
- `RALPH_DONE` — queue empty

## Ralph prep

Triggered by "przygotuj tickety na noc" or similar.

### Workflow

1. Query Linear: team=Blisko, status=Backlog (or tickets user specifies)
2. For each ticket:
   a. Read description + comments
   b. Explore relevant codebase (schema, API, mobile, shared)
   c. Brainstorm approach with user
   d. Split into atomic sub-tasks (1 commit each)
   e. Generate numbered `.md` files in `scripts/ralph-queue/`:
      - 5-digit prefix for ordering (00001, 00002, ...)
      - Ticket ID in filename: `00001-BLI-42-add-schema.md`
      - Self-contained: task, files, implementation, acceptance criteria
      - All sub-tasks for same ticket share the same Branch value
   f. Update Linear ticket description with structured plan
   g. Move ticket status to Todo
3. Report summary — files created, tickets prepared, any skipped

### File numbering

Continue from the highest existing number in the queue. If queue has `00003-*`, next file is `00004-*`.

### Skip conditions

- Ticket too vague (no clear outcome) → comment asking for clarification, leave in Backlog
- Ticket requires external info → comment "Needs: ...", leave in Backlog

## Ralph report

Triggered by "ralph report" / "co się stało w nocy".

### What to check

1. **Done files** — `ls scripts/ralph-queue/.done/` — completed tasks
2. **Blocked files** — `ls scripts/ralph-queue/*.blocked` — check logs for block reason
3. **Remaining** — `ls scripts/ralph-queue/[0-9]*.md` — tasks still in queue
4. **Git log** — `git log --oneline --since="12 hours ago"` — commits on main

### Output format

```
## Ralph report — [date]

### Done
- 00001-BLI-42-add-schema.md → [commit hash] [commit message]

### Blocked
- 00003-BLI-42-add-mobile.md → BLOCKED: [reason from log]

### Remaining in queue
- 00004-BLI-55-fix-button.md

### Git activity
[N] commits, [summary]
```
