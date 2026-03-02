# Ralph Local Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Ralph's Linear-driven task selection with local file-based queue to eliminate token waste on Linear API calls.

**Architecture:** Shell script handles task selection (first `.md` file in `scripts/ralph-queue/`), passes file contents to Claude. Claude only implements + verifies. Zero Linear API calls — Linear automation detects branch names and sets In Progress / Done automatically. No sub-issues in Linear — sub-tasks live as numbered files.

**Tech Stack:** Bash, Claude CLI

---

### Task 1: Create queue directory structure

**Files:**
- Create: `scripts/ralph-queue/.done/.gitkeep`
- Modify: `.gitignore`

**Step 1: Create directories**

```bash
mkdir -p scripts/ralph-queue/.done
touch scripts/ralph-queue/.done/.gitkeep
```

**Step 2: Add to .gitignore**

Add to `.gitignore` under the existing `# Ralph` section:

```
scripts/ralph-queue/
!scripts/ralph-queue/.done/.gitkeep
```

Wait — the queue is gitignored but `.done/.gitkeep` keeps the directory in git. Actually, since the whole queue is ephemeral, we don't need `.gitkeep` either. The shell script will `mkdir -p` on start. Simpler:

Add to `.gitignore`:
```
scripts/ralph-queue/
```

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "Add ralph-queue to gitignore"
```

---

### Task 2: Write new ralph-prompt.md

**Files:**
- Rewrite: `scripts/ralph-prompt.md`

The prompt shrinks dramatically. No ticket selection logic. No memory file. Task content arrives via stdin from the shell script.

**Step 1: Write the new prompt**

```markdown
# Ralph — autonomous worker session

You are Ralph, an autonomous worker for the Blisko project. Your task file is provided below.

## Workflow

### 1. Read task file

The task file below contains everything you need:
- **Ticket** — Linear ticket ID (e.g. BLI-42)
- **Branch** — git branch name
- **Task** — what to implement
- **Files to modify** — exact paths
- **Implementation** — detailed instructions
- **Acceptance criteria** — checkboxes to satisfy

### 2. Setup

- Create or checkout branch (from `Branch:` in task file)
- If branch already exists, checkout and continue. If not, create from main.

### 3. Implement

- Read the task file for implementation details
- Implement the change
- Commit with format: `Verb description (BLI-X)` — GPG signed
- **Stuck detection:** if you hit the same error 3 times or spend more than ~15 turns without progress, stop and treat as blocked.

### 4. Verify

Run typechecks:
```
pnpm --filter @repo/api typecheck
pnpm --filter @repo/shared typecheck
pnpm --filter @repo/mobile typecheck
pnpm --filter @repo/api test
```

- **Only fix errors you introduced.** Pre-existing errors are not your problem.
- If tests fail: 2 attempts to fix, then treat as blocked.

### 5. Finish

**Success (LAST_SUBTASK=true):**
- Merge branch to main: `git checkout main && git merge <branch> && git push origin main`
- Delete branch: `git branch -d <branch>`
- Output: `RALPH_MERGED`

**Success (not last sub-task):**
- Stay on branch, commit is there for next sub-task
- Output: `RALPH_MERGED`

**Blocked:**
- Push branch: `git push -u origin <branch>`
- Output: `RALPH_BLOCKED`

## Rules

- **ONE task per session.** Implement the task file, then stop.
- **Scope = acceptance criteria.** Nothing more, nothing less.
- **No Linear API calls.** Linear automation handles status via branch detection.
- **All commits must be GPG signed.** Never use `--no-gpg-sign`.
- **Never run `drizzle-kit migrate` on production.**
```

**Step 2: Commit**

```bash
git add scripts/ralph-prompt.md
git commit -m "Rewrite ralph-prompt for local queue workflow"
```

---

### Task 3: Rewrite ralph.sh

**Files:**
- Rewrite: `scripts/ralph.sh`

The shell script now handles task selection (first `.md` file), extracts metadata, determines first/last sub-task, passes everything to Claude.

**Step 1: Write the new ralph.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Ralph — autonomous worker loop
# Reads tasks from scripts/ralph-queue/*.md, passes to Claude for implementation.

cleanup() {
  echo ""
  echo "==> Ralph interrupted."
  kill -- -$$ 2>/dev/null || true
  exit 1
}
trap cleanup SIGINT SIGTERM

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPT_FILE="$SCRIPT_DIR/ralph-prompt.md"
QUEUE_DIR="$SCRIPT_DIR/ralph-queue"
DONE_DIR="$QUEUE_DIR/.done"
LOG_DIR="$SCRIPT_DIR/ralph-logs"

# Defaults
MAX_ITERATIONS=20
MAX_TURNS=50
TIMEOUT_MINUTES=30
STAGNATION_LIMIT=3
MODEL="opus"
DRY_RUN=false
VERBOSE=false

# Detect timeout command
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
fi

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
    --max-turns) MAX_TURNS="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --timeout) TIMEOUT_MINUTES="$2"; shift 2 ;;
    --stagnation-limit) STAGNATION_LIMIT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    -h|--help)
      echo "Usage: ralph.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --max-iterations N     Max iterations (default: 20)"
      echo "  --max-turns N          Max agent turns per iteration (default: 50)"
      echo "  --timeout N            Max minutes per iteration (default: 30)"
      echo "  --stagnation-limit N   Stop after N iterations with no progress (default: 3)"
      echo "  --model MODEL          Claude model (default: opus)"
      echo "  --dry-run              Preview task queue only"
      echo "  --verbose              Show full Claude output"
      echo "  -h, --help             Show this help"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

cd "$PROJECT_DIR"

# Ensure queue directory exists
mkdir -p "$QUEUE_DIR" "$DONE_DIR" "$LOG_DIR"

# Kill leftover Ralph processes
EXISTING_RALPHS=$(pgrep -f "ralph.sh" | grep -v $$ | grep -v $PPID || true)
if [[ -n "$EXISTING_RALPHS" ]]; then
  echo "==> Killing leftover Ralph processes..."
  echo "$EXISTING_RALPHS" | xargs kill 2>/dev/null || true
  sleep 1
  echo "$EXISTING_RALPHS" | xargs kill -9 2>/dev/null || true
fi

# Ensure on main
echo "==> Ensuring on main branch..."
git checkout main
git pull origin main

# Dry run — just list the queue
if $DRY_RUN; then
  echo ""
  echo "==> Task queue:"
  TASKS=$(ls "$QUEUE_DIR"/[0-9]*.md 2>/dev/null | sort)
  if [[ -z "$TASKS" ]]; then
    echo "    (empty)"
  else
    while IFS= read -r f; do
      BASENAME=$(basename "$f")
      TICKET=$(echo "$BASENAME" | grep -oE 'BLI-[0-9]+' || echo "???")
      TITLE=$(head -1 "$f" | sed 's/^# //')
      echo "    $BASENAME  →  $TICKET  →  $TITLE"
    done <<< "$TASKS"
  fi
  echo ""
  echo "==> Done queue:"
  DONE_TASKS=$(ls "$DONE_DIR"/[0-9]*.md 2>/dev/null | sort)
  if [[ -z "$DONE_TASKS" ]]; then
    echo "    (empty)"
  else
    while IFS= read -r f; do
      echo "    $(basename "$f")"
    done <<< "$DONE_TASKS"
  fi
  exit 0
fi

# Stats
DONE_COUNT=0
BLOCKED_COUNT=0
STAGNATION_COUNT=0
ITERATION=0

echo ""
echo "======================================"
echo "  Ralph — autonomous worker"
echo "======================================"
echo "  Max iterations:    $MAX_ITERATIONS"
echo "  Max turns/iter:    $MAX_TURNS"
echo "  Timeout/iter:      ${TIMEOUT_MINUTES}m"
echo "  Stagnation limit:  $STAGNATION_LIMIT"
echo "  Model:             $MODEL"
echo "  Queue:             $QUEUE_DIR"
echo "======================================"
echo ""

# Main loop
while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
  ITERATION=$((ITERATION + 1))
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  LOG_FILE="$LOG_DIR/ralph_${TIMESTAMP}_iter${ITERATION}.json"

  # Pick first task file
  TASK_FILE=$(ls "$QUEUE_DIR"/[0-9]*.md 2>/dev/null | sort | head -1 || true)
  if [[ -z "$TASK_FILE" ]]; then
    echo "==> No more tasks in queue. Ralph is done."
    break
  fi

  TASK_BASENAME=$(basename "$TASK_FILE")
  TICKET_ID=$(echo "$TASK_BASENAME" | grep -oE 'BLI-[0-9]+' || echo "")

  echo "==> Iteration $ITERATION/$MAX_ITERATIONS: $TASK_BASENAME"

  # Determine if first/last sub-task for this ticket
  IS_FIRST="false"
  IS_LAST="false"
  if [[ -n "$TICKET_ID" ]]; then
    DONE_FOR_TICKET=$(ls "$DONE_DIR"/*-${TICKET_ID}-*.md 2>/dev/null | wc -l | tr -d ' ')
    REMAINING_FOR_TICKET=$(ls "$QUEUE_DIR"/[0-9]*-${TICKET_ID}-*.md 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$DONE_FOR_TICKET" -eq 0 ]]; then
      IS_FIRST="true"
    fi
    if [[ "$REMAINING_FOR_TICKET" -eq 1 ]]; then
      IS_LAST="true"
    fi
    echo "    Ticket: $TICKET_ID (first=$IS_FIRST, last=$IS_LAST)"
  fi

  # Ensure on main between iterations
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
  if [[ "$IS_FIRST" == "true" ]]; then
    # First sub-task: start from main
    git checkout main 2>/dev/null
    git pull origin main 2>/dev/null
  fi
  # Not first: stay on branch from previous sub-task (branch carries over)

  # Snapshot git HEAD for progress detection
  HEAD_BEFORE=$(git rev-parse HEAD 2>/dev/null)

  # Build prompt: system prompt + task file + metadata
  TASK_CONTENT=$(cat "$TASK_FILE")
  PROMPT_INPUT=$(cat <<PROMPT_EOF
$(cat "$PROMPT_FILE")

---

## Task file: $TASK_BASENAME

FIRST_SUBTASK=$IS_FIRST
LAST_SUBTASK=$IS_LAST

$TASK_CONTENT
PROMPT_EOF
)

  # Run Claude
  CLAUDE_CMD=(claude -p --model "$MODEL" --output-format json --max-turns "$MAX_TURNS" --dangerously-skip-permissions)

  if [[ -n "$TIMEOUT_CMD" ]]; then
    OUTPUT=$(echo "$PROMPT_INPUT" | $TIMEOUT_CMD "${TIMEOUT_MINUTES}m" "${CLAUDE_CMD[@]}" 2>&1) || true
  else
    OUTPUT=$(echo "$PROMPT_INPUT" | "${CLAUDE_CMD[@]}" 2>&1) || true
  fi

  # Save log
  echo "$OUTPUT" > "$LOG_FILE"

  if $VERBOSE; then
    echo "--- Full output ---"
    echo "$OUTPUT"
    echo "--- End output ---"
  fi

  # Check git progress
  HEAD_AFTER=$(git rev-parse HEAD 2>/dev/null || echo "$HEAD_BEFORE")
  GIT_CHANGED=false
  [[ "$HEAD_BEFORE" != "$HEAD_AFTER" ]] && GIT_CHANGED=true

  # Parse signal
  MADE_PROGRESS=false
  if echo "$OUTPUT" | grep -q "RALPH_MERGED"; then
    DONE_COUNT=$((DONE_COUNT + 1))
    MADE_PROGRESS=true
    # Move task file to .done/
    mv "$TASK_FILE" "$DONE_DIR/"
    echo "==> [$TICKET_ID] $TASK_BASENAME completed. ($DONE_COUNT done so far)"

    # If last sub-task was merged, clean up branch
    if [[ "$IS_LAST" == "true" ]]; then
      CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
      if [[ "$CURRENT_BRANCH" != "main" ]]; then
        git checkout main 2>/dev/null
        git branch -d "$CURRENT_BRANCH" 2>/dev/null || true
        git push origin --delete "$CURRENT_BRANCH" 2>/dev/null || true
        echo "    Cleaned up branch: $CURRENT_BRANCH"
      fi
    fi

  elif echo "$OUTPUT" | grep -q "RALPH_BLOCKED"; then
    BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
    MADE_PROGRESS=true
    echo "==> [$TICKET_ID] $TASK_BASENAME blocked. ($BLOCKED_COUNT blocked so far)"
    # Blocked file stays in queue — skip to next different ticket
    # Move blocked file aside temporarily so next iteration picks a different one
    mv "$TASK_FILE" "${TASK_FILE}.blocked"

  elif echo "$OUTPUT" | grep -q "error_max_turns"; then
    echo "==> [$TICKET_ID] Hit max turns ($MAX_TURNS)."
    $GIT_CHANGED && MADE_PROGRESS=true
  else
    echo "==> No clear signal. Check log: $LOG_FILE"
    $GIT_CHANGED && MADE_PROGRESS=true
  fi

  # Stagnation detection
  if $MADE_PROGRESS || $GIT_CHANGED; then
    STAGNATION_COUNT=0
  else
    STAGNATION_COUNT=$((STAGNATION_COUNT + 1))
    echo "==> No progress. ($STAGNATION_COUNT/$STAGNATION_LIMIT before auto-stop)"
    if [[ $STAGNATION_COUNT -ge $STAGNATION_LIMIT ]]; then
      echo "==> Stagnation limit reached. Stopping."
      break
    fi
  fi

  echo ""
done

# Return to main
git checkout main 2>/dev/null || true

# Restore any .blocked files back to normal
for f in "$QUEUE_DIR"/*.blocked; do
  [[ -f "$f" ]] && mv "$f" "${f%.blocked}"
done

# Summary
echo ""
echo "======================================"
echo "  Ralph — summary"
echo "======================================"
echo "  Iterations:  $ITERATION"
echo "  Merged:      $DONE_COUNT"
echo "  Blocked:     $BLOCKED_COUNT"
echo "  Stagnated:   $STAGNATION_COUNT"
echo "  Logs:        $LOG_DIR/"
echo "  Queue:       $(ls "$QUEUE_DIR"/[0-9]*.md 2>/dev/null | wc -l | tr -d ' ') remaining"
echo "  Done:        $(ls "$DONE_DIR"/[0-9]*.md 2>/dev/null | wc -l | tr -d ' ') completed"
echo "======================================"
```

**Step 2: Commit**

```bash
git add scripts/ralph.sh
git commit -m "Rewrite ralph.sh for local file-based queue"
```

---

### Task 4: Clean up old files

**Files:**
- Delete: `scripts/ralph-pick.sh`
- Delete: `scripts/ralph-pick-prompt.md`
- Delete: `scripts/ralph-progress.txt`
- Delete: `scripts/ralph-session.txt`
- Modify: `package.json` — remove `ralph:pick` script
- Modify: `.gitignore` — remove old ralph entries

**Step 1: Remove files and update configs**

Delete the old files:
```bash
rm -f scripts/ralph-pick.sh scripts/ralph-pick-prompt.md
rm -f scripts/ralph-progress.txt scripts/ralph-session.txt
```

Remove from `package.json`:
```diff
-    "ralph:pick": "bash scripts/ralph-pick.sh",
```

Update `.gitignore` — replace old Ralph section:
```diff
 # Ralph
 scripts/ralph-logs/
-scripts/ralph-progress.txt
-scripts/ralph-session.txt
+scripts/ralph-queue/
```

**Step 2: Commit**

```bash
git add -A scripts/ralph-pick.sh scripts/ralph-pick-prompt.md package.json .gitignore
git commit -m "Remove old Ralph pick scripts and progress files"
```

---

### Task 5: Update CLAUDE.md — Ralph protocol

**Files:**
- Modify: `CLAUDE.md` — replace Ralph protocol section (~180 lines → ~60 lines)

**Step 1: Replace the Ralph protocol section**

Replace everything from `### Ralph protocol` to `#### Review (for Karol)` (inclusive) with:

```markdown
### Ralph protocol

Autonomous worker — reads task files from `scripts/ralph-queue/`, implements them one by one.

Runner: `pnpm ralph` / `pnpm ralph:dry`

#### How it works

1. Shell picks first `.md` file from `scripts/ralph-queue/` (sorted by 5-digit prefix)
2. Shell determines if first/last sub-task for the ticket (by checking `.done/`)
3. Claude gets: system prompt + task file contents + FIRST_SUBTASK/LAST_SUBTASK flags
4. Claude implements, verifies, commits
5. Shell moves file to `.done/` on success

**Zero Linear API calls.** Linear automation detects branch names and sets In Progress / Done automatically.

#### Task file format

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

#### Queue structure

```
scripts/ralph-queue/          ← gitignored
├── .done/                    ← completed files
├── 00001-BLI-42-add-schema.md
├── 00002-BLI-42-add-api.md
├── 00003-BLI-42-add-mobile.md
└── 00004-BLI-55-fix-button.md
```

- 5-digit prefix = execution order
- One branch per ticket (all sub-tasks share it)
- First sub-task: checkout from main. Subsequent: continue on branch.
- Last sub-task: merge to main.

#### Scope discipline

Commit must match the task file's acceptance criteria — nothing more, nothing less. If you spot an unrelated issue, note it in the RALPH_BLOCKED output or ignore it.

#### Verify steps

```
pnpm --filter @repo/api typecheck
pnpm --filter @repo/shared typecheck
pnpm --filter @repo/mobile typecheck
pnpm --filter @repo/api test
```

Only fix errors you introduced. Pre-existing failures are not your problem.

#### Signals

- `RALPH_MERGED` — task done, file moved to `.done/`
- `RALPH_BLOCKED` — stuck, file stays in queue (renamed `.blocked`)
- `RALPH_DONE` — queue empty, nothing to do

#### Review (for Karol)

1. `pnpm ralph:dry` — see queue state
2. `git log --oneline -20` — see what was merged
3. Blocked files: `ls scripts/ralph-queue/*.blocked` — check logs for why
4. Unblock: fix the issue, rename `.blocked` back to `.md`
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Simplify Ralph protocol in CLAUDE.md for local queue"
```

---

### Task 6: Update CLAUDE.md — Ralph prep section

**Files:**
- Modify: `CLAUDE.md` — update Ralph prep to generate local files instead of Linear sub-issues

**Step 1: Replace Ralph prep section**

Replace the `### Ralph prep` section with:

```markdown
### Ralph prep

Prepares task files for Ralph from Linear tickets. Triggered by "przygotuj tickety na noc" or similar.

#### Workflow

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

#### File numbering

Continue from the highest existing number in the queue. If queue has `00003-*`, next file is `00004-*`.

#### Skip conditions
- Ticket too vague (no clear outcome) → comment asking for clarification, leave in Backlog
- Ticket requires external info → comment "Needs: ...", leave in Backlog
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Update Ralph prep for local file queue"
```

---

### Task 7: Update Ralph report section

**Files:**
- Modify: `CLAUDE.md` — update Ralph report to check local queue

**Step 1: Update the report section**

The report now checks `.done/` instead of querying Linear for recent updates:

```markdown
### Ralph report

Summary of Ralph's work. Triggered by "ralph report" or "co się stało w nocy".

#### What to check

1. **Done files** — `ls scripts/ralph-queue/.done/` — completed tasks with ticket IDs
2. **Blocked files** — `ls scripts/ralph-queue/*.blocked` — check logs for block reason
3. **Remaining** — `ls scripts/ralph-queue/[0-9]*.md` — tasks still in queue
4. **Git log** — `git log --oneline --since="12 hours ago"` — commits on main

#### Output format

```
## Ralph report — [date]

### Done
- 00001-BLI-42-add-schema.md → [commit hash] [commit message]
- 00002-BLI-42-add-api.md → [commit hash] [commit message]

### Blocked
- 00003-BLI-42-add-mobile.md → BLOCKED: [reason from log]

### Remaining in queue
- 00004-BLI-55-fix-button.md

### Git activity
[N] commits, [summary]
```
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Update Ralph report for local queue"
```

---

### Task 8: Verify everything works

**Step 1: Create a test task file**

```bash
mkdir -p scripts/ralph-queue/.done
cat > scripts/ralph-queue/00001-BLI-TEST-hello-world.md << 'EOF'
# BLI-TEST: Hello world test

Ticket: BLI-TEST
Branch: test/ralph-queue-test

## Task
Create a test file to verify Ralph queue works.

## Files to modify
- Create: `scripts/ralph-queue-test.txt`

## Implementation
Create a file with "Hello from Ralph queue" content.

## Acceptance criteria
- [ ] File exists with correct content
EOF
```

**Step 2: Run dry-run**

```bash
pnpm ralph:dry
```

Expected output shows the test task in queue.

**Step 3: Clean up test file**

```bash
rm scripts/ralph-queue/00001-BLI-TEST-hello-world.md
```

**Step 4: Final commit with all remaining changes**

```bash
git add -A
git status  # verify only expected files
git commit -m "Complete Ralph local queue redesign"
```
