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
    DONE_FOR_TICKET=$(ls "$DONE_DIR"/*-${TICKET_ID}-*.md 2>/dev/null | wc -l | tr -d ' ' || echo "0")
    REMAINING_FOR_TICKET=$(ls "$QUEUE_DIR"/[0-9]*-${TICKET_ID}-*.md 2>/dev/null | wc -l | tr -d ' ' || echo "0")
    if [[ "$DONE_FOR_TICKET" -eq 0 ]]; then
      IS_FIRST="true"
    fi
    if [[ "$REMAINING_FOR_TICKET" -eq 1 ]]; then
      IS_LAST="true"
    fi
    echo "    Ticket: $TICKET_ID (first=$IS_FIRST, last=$IS_LAST)"
  fi

  # First sub-task: start from main. Otherwise: stay on branch.
  if [[ "$IS_FIRST" == "true" ]]; then
    git checkout main 2>/dev/null
    git pull origin main 2>/dev/null
  fi

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
    # Move blocked file aside so next iteration picks a different one
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
