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
TIMEOUT_MINUTES=10
STAGNATION_LIMIT=3
MAX_RETRIES=2
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
    --max-retries) MAX_RETRIES="$2"; shift 2 ;;
    --stagnation-limit) STAGNATION_LIMIT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    -h|--help)
      echo "Usage: ralph.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --max-iterations N     Max iterations (default: 20)"
      echo "  --max-turns N          Max agent turns per iteration (default: 50)"
      echo "  --timeout N            Max minutes per attempt (default: 10)"
      echo "  --max-retries N        Max retries per task on timeout (default: 2)"
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

# Fetch latest main (without switching)
echo "==> Fetching latest main..."
git fetch origin main

# Dry run — just list the queue
if $DRY_RUN; then
  echo ""
  echo "==> Task queue:"
  TASKS=$(ls "$QUEUE_DIR"/[0-9]*.md 2>/dev/null | sort || true)
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
  echo "==> Done:"
  DONE_TASKS=$(ls "$DONE_DIR"/[0-9]*.md 2>/dev/null | sort || true)
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
ALL_TOOL_CALLS=""
START_TIME=$(date +%s)

echo ""
echo "======================================"
echo "  Ralph — autonomous worker"
echo "======================================"
echo "  Max iterations:    $MAX_ITERATIONS"
echo "  Max turns/iter:    $MAX_TURNS"
echo "  Timeout/attempt:   ${TIMEOUT_MINUTES}m"
echo "  Max retries/task:  $MAX_RETRIES"
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

  TASK_TITLE=$(head -1 "$TASK_FILE" | sed 's/^# //')
  TASK_SUMMARY=$(sed -n '/^## Task$/,/^## /{/^## Task$/d;/^## /d;p;}' "$TASK_FILE" | sed '/^$/d' | head -3)

  echo "==> Iteration $ITERATION/$MAX_ITERATIONS: $TASK_BASENAME"
  echo "    Title: $TASK_TITLE"
  if [[ -n "$TASK_SUMMARY" ]]; then
    echo "$TASK_SUMMARY" | while IFS= read -r line; do
      echo "    > $line"
    done
  fi

  # Determine if first/last sub-task for this ticket
  IS_FIRST="false"
  IS_LAST="false"
  if [[ -n "$TICKET_ID" ]]; then
    DONE_FOR_TICKET=$(set +o pipefail; ls -1 "$DONE_DIR"/*-${TICKET_ID}-*.md 2>/dev/null | wc -l | tr -d ' ')
    REMAINING_FOR_TICKET=$(set +o pipefail; ls -1 "$QUEUE_DIR"/[0-9]*-${TICKET_ID}-*.md 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$DONE_FOR_TICKET" -eq 0 ]]; then
      IS_FIRST="true"
    fi
    if [[ "$REMAINING_FOR_TICKET" -eq 1 ]]; then
      IS_LAST="true"
    fi
    echo "    Ticket: $TICKET_ID (first=$IS_FIRST, last=$IS_LAST)"
  fi

  # Extract target branch from task file
  TARGET_BRANCH=$(grep -m1 '^Branch:' "$TASK_FILE" | sed 's/^Branch: *//' || true)
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")

  if [[ -n "$TARGET_BRANCH" ]]; then
    BRANCH_OK=true
    if [[ "$CURRENT_BRANCH" == "$TARGET_BRANCH" ]]; then
      # Already on correct branch — rebase only if behind main
      if git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
        echo "    Branch: $TARGET_BRANCH (continuing, up to date)"
      else
        echo "    Branch: $TARGET_BRANCH (continuing, rebasing on main)"
        git rebase origin/main 2>/dev/null || true
      fi
    elif git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH" 2>/dev/null; then
      # Branch exists locally — switch to it, rebase only if behind
      echo "    Branch: $TARGET_BRANCH (switching)"
      if ! git checkout "$TARGET_BRANCH" 2>&1; then
        echo "    ERROR: Failed to checkout $TARGET_BRANCH (dirty working tree?)"
        BRANCH_OK=false
      else
        if git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
          echo "    Branch: up to date with main"
        else
          echo "    Branch: rebasing on main"
          git rebase origin/main 2>/dev/null || true
        fi
      fi
    else
      # New branch — create from latest main
      echo "    Branch: $TARGET_BRANCH (creating from main)"
      if ! git checkout -b "$TARGET_BRANCH" origin/main 2>&1; then
        echo "    ERROR: Failed to create $TARGET_BRANCH (dirty working tree?)"
        BRANCH_OK=false
      fi
    fi
    if [[ "$BRANCH_OK" == "false" ]]; then
      echo "==> Skipping iteration — could not switch to branch."
      echo ""
      STAGNATION_COUNT=$((STAGNATION_COUNT + 1))
      if [[ $STAGNATION_COUNT -ge $STAGNATION_LIMIT ]]; then
        echo "==> Stagnation limit reached. Stopping."
        break
      fi
      continue
    fi
  fi

  # Snapshot git HEAD for progress detection
  HEAD_BEFORE=$(git rev-parse HEAD 2>/dev/null)

  # Retry loop for timeouts
  RETRY_COUNT=0
  CONTINUATION_CONTEXT=""

  while true; do
    # Build prompt: system prompt + task file + metadata + optional continuation
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

    if [[ -n "$CONTINUATION_CONTEXT" ]]; then
      PROMPT_INPUT="${PROMPT_INPUT}

---

## Continuation context (previous attempt timed out)

${CONTINUATION_CONTEXT}

**Resume from where the previous attempt left off. Do NOT redo work that's already committed. Check the current state, then continue.**"
    fi

    # Run Claude
    CLAUDE_CMD=(claude -p --model "$MODEL" --output-format json --max-turns "$MAX_TURNS" --dangerously-skip-permissions)

    TIMED_OUT=false
    if [[ -n "$TIMEOUT_CMD" ]]; then
      EXIT_CODE=0
      OUTPUT=$(echo "$PROMPT_INPUT" | $TIMEOUT_CMD "${TIMEOUT_MINUTES}m" "${CLAUDE_CMD[@]}" 2>&1) || EXIT_CODE=$?
      if [[ $EXIT_CODE -eq 124 ]]; then
        TIMED_OUT=true
      fi
    else
      OUTPUT=$(echo "$PROMPT_INPUT" | "${CLAUDE_CMD[@]}" 2>&1) || true
    fi

    # Save log
    RETRY_SUFFIX=""
    [[ $RETRY_COUNT -gt 0 ]] && RETRY_SUFFIX="_retry${RETRY_COUNT}"
    echo "$OUTPUT" > "${LOG_FILE%.json}${RETRY_SUFFIX}.json"

    if $VERBOSE; then
      echo "--- Full output ---"
      echo "$OUTPUT"
      echo "--- End output ---"
    fi

    # Tool usage summary
    if command -v jq &>/dev/null; then
      ITER_TOOLS=$(echo "$OUTPUT" | jq -r '
        [.[] | select(.role == "assistant") | .content[]? | select(.type == "tool_use") | .name] | .[]
      ' 2>/dev/null || true)
      if [[ -n "$ITER_TOOLS" ]]; then
        TOOL_TOTAL=$(echo "$ITER_TOOLS" | wc -l | tr -d ' ')
        echo "    Tools ($TOOL_TOTAL calls):"
        echo "$ITER_TOOLS" | sort | uniq -c | sort -rn | while read -r count name; do
          echo "      $name: $count"
        done
        ALL_TOOL_CALLS="${ALL_TOOL_CALLS}${ITER_TOOLS}"$'\n'
      fi
    fi

    # If not timed out, break out of retry loop — normal signal handling below
    if ! $TIMED_OUT; then
      break
    fi

    # --- Timeout path: assess state and decide retry ---
    RETRY_COUNT=$((RETRY_COUNT + 1))
    HEAD_AFTER=$(git rev-parse HEAD 2>/dev/null || echo "$HEAD_BEFORE")
    NEW_COMMITS=""
    UNCOMMITTED=""
    UNTRACKED=""

    if [[ "$HEAD_BEFORE" != "$HEAD_AFTER" ]]; then
      NEW_COMMITS=$(git log --oneline "${HEAD_BEFORE}..${HEAD_AFTER}" 2>/dev/null || true)
    fi
    UNCOMMITTED=$(git diff --stat 2>/dev/null || true)
    UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)

    echo "==> [$TICKET_ID] Timed out after ${TIMEOUT_MINUTES}m (retry $RETRY_COUNT/$MAX_RETRIES)"

    if [[ -n "$NEW_COMMITS" ]]; then
      echo "    New commits since start:"
      echo "$NEW_COMMITS" | while IFS= read -r line; do echo "      $line"; done
    fi
    if [[ -n "$UNCOMMITTED" ]]; then
      echo "    Uncommitted changes detected"
    fi
    if [[ -z "$NEW_COMMITS" && -z "$UNCOMMITTED" && -z "$UNTRACKED" ]]; then
      echo "    No git changes at all — was likely stuck"
    fi

    # Max retries reached → break out, will be handled as timeout below
    if [[ $RETRY_COUNT -ge $MAX_RETRIES ]]; then
      echo "==> Max retries ($MAX_RETRIES) reached for $TASK_BASENAME"
      break
    fi

    # Build continuation context for next attempt
    CONTINUATION_CONTEXT="Attempt $RETRY_COUNT timed out after ${TIMEOUT_MINUTES}m."
    if [[ -n "$NEW_COMMITS" ]]; then
      CONTINUATION_CONTEXT="${CONTINUATION_CONTEXT}

Commits already made on this branch:
\`\`\`
${NEW_COMMITS}
\`\`\`"
    fi
    if [[ -n "$UNCOMMITTED" ]]; then
      CONTINUATION_CONTEXT="${CONTINUATION_CONTEXT}

Uncommitted changes in working tree:
\`\`\`
${UNCOMMITTED}
\`\`\`"
    fi
    if [[ -n "$UNTRACKED" ]]; then
      CONTINUATION_CONTEXT="${CONTINUATION_CONTEXT}

New untracked files:
\`\`\`
${UNTRACKED}
\`\`\`"
    fi
    if [[ -z "$NEW_COMMITS" && -z "$UNCOMMITTED" && -z "$UNTRACKED" ]]; then
      CONTINUATION_CONTEXT="${CONTINUATION_CONTEXT}
No git changes were made. The previous session likely got stuck on a long-running command (e.g. hanging tests). Take a more focused approach — implement first, commit, then verify."
    fi

    echo "==> Retrying with continuation context..."
    echo ""
  done
  # --- End retry loop ---

  # Check git progress
  HEAD_AFTER=$(git rev-parse HEAD 2>/dev/null || echo "$HEAD_BEFORE")
  GIT_CHANGED=false
  [[ "$HEAD_BEFORE" != "$HEAD_AFTER" ]] && GIT_CHANGED=true

  # Parse signal
  MADE_PROGRESS=false
  if echo "$OUTPUT" | grep -q "RALPH_MERGED"; then
    DONE_COUNT=$((DONE_COUNT + 1))
    MADE_PROGRESS=true
    mv "$TASK_FILE" "$DONE_DIR/"
    DONE_JSON="$DONE_DIR/${TASK_BASENAME%.md}.out.json"
    echo "$OUTPUT" > "$DONE_JSON"
    echo "==> [$TICKET_ID] $TASK_BASENAME completed. ($DONE_COUNT done so far)"

    # If last sub-task was merged, clean up branch
    if [[ "$IS_LAST" == "true" && -n "$TARGET_BRANCH" && "$TARGET_BRANCH" != "main" ]]; then
      git checkout main 2>/dev/null
      git branch -d "$TARGET_BRANCH" 2>/dev/null || true
      git push origin --delete "$TARGET_BRANCH" 2>/dev/null || true
      echo "    Cleaned up branch: $TARGET_BRANCH"
    fi

  elif echo "$OUTPUT" | grep -q "RALPH_BLOCKED"; then
    BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
    MADE_PROGRESS=true
    echo "==> [$TICKET_ID] $TASK_BASENAME blocked. ($BLOCKED_COUNT blocked so far)"
    mv "$TASK_FILE" "${TASK_FILE}.blocked"

  elif $TIMED_OUT && [[ $RETRY_COUNT -ge $MAX_RETRIES ]]; then
    # Exhausted retries — auto-block
    BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
    MADE_PROGRESS=true
    echo "==> [$TICKET_ID] $TASK_BASENAME auto-blocked after $MAX_RETRIES timeouts."
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

# Restore any .blocked files back to normal
for f in "$QUEUE_DIR"/*.blocked; do
  [[ -f "$f" ]] && mv "$f" "${f%.blocked}"
done

# Summary
END_TIME=$(date +%s)
ELAPSED=$(( END_TIME - START_TIME ))
ELAPSED_MIN=$(( ELAPSED / 60 ))
ELAPSED_SEC=$(( ELAPSED % 60 ))

echo ""
echo "======================================"
echo "  Ralph — summary"
echo "======================================"
echo ""
echo "  Tasks"
echo "  ─────────────────────────────"
echo "  Iterations:  $ITERATION"
echo "  Merged:      $DONE_COUNT"
echo "  Blocked:     $BLOCKED_COUNT"
echo "  Stagnated:   $STAGNATION_COUNT"
echo "  Queue:       $(ls "$QUEUE_DIR"/[0-9]*.md 2>/dev/null | wc -l | tr -d ' ') remaining"
echo "  Done:        $(ls "$DONE_DIR"/[0-9]*.md 2>/dev/null | wc -l | tr -d ' ') completed"
echo ""
echo "  Time"
echo "  ─────────────────────────────"
printf "  Total:       %dm %ds\n" "$ELAPSED_MIN" "$ELAPSED_SEC"
if [[ $ITERATION -gt 0 ]]; then
  AVG_SEC=$(( ELAPSED / ITERATION ))
  printf "  Per task:    %dm %ds avg\n" "$(( AVG_SEC / 60 ))" "$(( AVG_SEC % 60 ))"
fi

# Tool usage aggregate
if [[ -n "$ALL_TOOL_CALLS" ]]; then
  TOTAL_CALLS=$(echo -n "$ALL_TOOL_CALLS" | grep -c . || echo "0")
  echo ""
  echo "  Tool calls ($TOTAL_CALLS total)"
  echo "  ─────────────────────────────"
  echo -n "$ALL_TOOL_CALLS" | grep . | sort | uniq -c | sort -rn | while read -r count name; do
    PCT=$(( count * 100 / TOTAL_CALLS ))
    BAR=""
    BAR_LEN=$(( PCT / 5 ))
    for ((i=0; i<BAR_LEN; i++)); do BAR="${BAR}█"; done
    printf "  %-14s %3d  %3d%% %s\n" "$name" "$count" "$PCT" "$BAR"
  done
fi

# Git stats
COMMITS_MADE=$(git log --oneline --since="@$START_TIME" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$COMMITS_MADE" -gt 0 ]]; then
  DIFFSTAT=$(git diff --shortstat "HEAD~${COMMITS_MADE}" HEAD 2>/dev/null || true)
  echo ""
  echo "  Git"
  echo "  ─────────────────────────────"
  echo "  Commits:     $COMMITS_MADE"
  if [[ -n "$DIFFSTAT" ]]; then
    echo "  Changes:    $DIFFSTAT"
  fi
fi

echo ""
echo "  Logs:        $LOG_DIR/"
echo "======================================"
