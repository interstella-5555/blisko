#!/usr/bin/env bash
set -euo pipefail

# Ralph — autonomous worker loop for Blisko
# Runs Claude in a loop, one task per iteration, using progress.txt for state.

# Kill all child processes (including Claude) on exit/interrupt
# Session file is preserved so next run can --resume
cleanup() {
  echo ""
  echo "==> Ralph interrupted. Killing child processes..."
  if [[ -f "$SCRIPT_DIR/ralph-session.txt" ]]; then
    echo "==> Session saved. Next 'pnpm ralph' will resume where it left off."
  fi
  kill -- -$$ 2>/dev/null || true
  exit 1
}
trap cleanup SIGINT SIGTERM

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPT_FILE="$SCRIPT_DIR/ralph-prompt.md"
PROGRESS_FILE="$SCRIPT_DIR/ralph-progress.txt"
SESSION_FILE="$SCRIPT_DIR/ralph-session.txt"
LOG_DIR="$SCRIPT_DIR/ralph-logs"

# Defaults
MAX_ITERATIONS=20
MAX_TURNS=50
TIMEOUT_MINUTES=30
STAGNATION_LIMIT=3
MODEL="opus"
DRY_RUN=false
VERBOSE=false

# Detect timeout command (gtimeout on macOS, timeout on Linux)
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
    --reset) echo "==> Clearing progress and session files"; rm -f "$PROGRESS_FILE" "$SCRIPT_DIR/ralph-session.txt"; shift ;;
    -h|--help)
      echo "Usage: ralph.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --max-iterations N     Max iterations (default: 20)"
      echo "  --max-turns N          Max agent turns per iteration (default: 50)"
      echo "  --timeout N            Max minutes per iteration (default: 30)"
      echo "  --stagnation-limit N   Stop after N iterations with no progress (default: 3)"
      echo "  --model MODEL          Claude model (default: opus)"
      echo "  --dry-run              Preview ticket queue only"
      echo "  --verbose              Show full Claude output"
      echo "  --reset                Clear progress and session files before starting"
      echo "  -h, --help             Show this help"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Ensure we're in the project directory
cd "$PROJECT_DIR"

# Ensure on main and up to date
echo "==> Ensuring on main branch..."
git checkout main
git pull origin main

# Dry run mode — just show the queue
if $DRY_RUN; then
  echo ""
  echo "==> DRY RUN: Querying Linear for Ralph tickets..."
  echo ""
  { cat "$PROMPT_FILE"; echo -e "\n\nQuery Linear: team=Blisko, status=Todo, label=Ralph. List all matching tickets sorted by priority DESC then identifier ASC. Output each as: [identifier] [title] [priority]. If none found, say 'No Ralph tickets in queue.'. Do NOT work on any ticket — just list them."; } | claude -p \
    --model "$MODEL" \
    --output-format text \
    --max-turns 3 \
    --dangerously-skip-permissions
  exit 0
fi

# Create log directory
mkdir -p "$LOG_DIR"

# Initialize progress file if it doesn't exist
if [[ ! -f "$PROGRESS_FILE" ]]; then
  echo "# Ralph Progress" > "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
  echo "No work started yet." >> "$PROGRESS_FILE"
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
echo "  Progress file:     $PROGRESS_FILE"
echo "======================================"
echo ""

# Main loop
while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
  ITERATION=$((ITERATION + 1))
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  LOG_FILE="$LOG_DIR/ralph_${TIMESTAMP}_iter${ITERATION}.json"

  echo "==> Iteration $ITERATION/$MAX_ITERATIONS"

  # Ensure on main between iterations and clean up merged branches
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
  git checkout main 2>/dev/null
  git pull origin main 2>/dev/null
  if [[ "$CURRENT_BRANCH" != "main" ]]; then
    # Delete branch only if fully merged to main (-d fails if not merged)
    if git branch -d "$CURRENT_BRANCH" 2>/dev/null; then
      echo "    Cleaned up merged branch: $CURRENT_BRANCH"
      git push origin --delete "$CURRENT_BRANCH" 2>/dev/null || true
    fi
  fi

  # Snapshot git HEAD before iteration (for progress detection)
  HEAD_BEFORE=$(git rev-parse HEAD)

  # Check for saved session to resume (from previous Ctrl+C)
  RESUME_SESSION=""
  if [[ -f "$SESSION_FILE" ]] && [[ $ITERATION -eq 1 ]]; then
    RESUME_SESSION=$(cat "$SESSION_FILE")
    echo "    Resuming interrupted session: $RESUME_SESSION"
  fi

  # Generate session ID for this iteration
  CURRENT_SESSION=$(uuidgen | tr '[:upper:]' '[:lower:]')
  echo "$CURRENT_SESSION" > "$SESSION_FILE"

  # Build claude command
  if [[ -n "$RESUME_SESSION" ]]; then
    # Resume interrupted session — no prompt needed, context is preserved
    CLAUDE_CMD=(claude -p --resume "$RESUME_SESSION" --model "$MODEL" --output-format json --max-turns "$MAX_TURNS" --dangerously-skip-permissions)
  else
    CLAUDE_CMD=(claude -p --session-id "$CURRENT_SESSION" --model "$MODEL" --output-format json --max-turns "$MAX_TURNS" --dangerously-skip-permissions)
  fi

  # Run Claude with progress file as context (concatenated into prompt)
  # Wall-clock timeout prevents infinite hangs
  # When resuming, send minimal prompt (session already has context)
  if [[ -n "$RESUME_SESSION" ]]; then
    PROMPT_INPUT="Continue where you left off. Check Linear and progress file for current state."
  else
    PROMPT_INPUT=$({ cat "$PROMPT_FILE"; echo -e "\n\n---\n\n## Current progress file contents\n"; cat "$PROGRESS_FILE"; })
  fi

  if [[ -n "$TIMEOUT_CMD" ]]; then
    OUTPUT=$(echo "$PROMPT_INPUT" | $TIMEOUT_CMD "${TIMEOUT_MINUTES}m" "${CLAUDE_CMD[@]}" 2>&1) || true
  else
    OUTPUT=$(echo "$PROMPT_INPUT" | "${CLAUDE_CMD[@]}" 2>&1) || true
  fi

  # Session completed normally — clear session file
  rm -f "$SESSION_FILE"

  # Save log
  echo "$OUTPUT" > "$LOG_FILE"

  if $VERBOSE; then
    echo "--- Full output ---"
    echo "$OUTPUT"
    echo "--- End output ---"
  fi

  # Check if git HEAD changed (independent progress verification)
  HEAD_AFTER=$(git rev-parse HEAD 2>/dev/null || echo "$HEAD_BEFORE")
  if [[ "$HEAD_BEFORE" != "$HEAD_AFTER" ]]; then
    GIT_CHANGED=true
  else
    GIT_CHANGED=false
  fi

  # Extract ticket identifier from output (e.g. BLI-16)
  TICKET_ID=$(echo "$OUTPUT" | grep -oE 'BLI-[0-9]+' | head -1)
  if [[ -n "$TICKET_ID" ]]; then
    echo "    Ticket: $TICKET_ID"
  fi

  # Parse signal from output
  MADE_PROGRESS=false
  if echo "$OUTPUT" | grep -q "RALPH_DONE"; then
    echo "==> No more tickets. Ralph is done."
    break
  elif echo "$OUTPUT" | grep -q "RALPH_MERGED"; then
    DONE_COUNT=$((DONE_COUNT + 1))
    MADE_PROGRESS=true
    echo "==> [$TICKET_ID] Completed and merged. ($DONE_COUNT done so far)"
  elif echo "$OUTPUT" | grep -q "RALPH_BLOCKED"; then
    BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
    MADE_PROGRESS=true  # blocked is still a valid outcome
    echo "==> [$TICKET_ID] Blocked. ($BLOCKED_COUNT blocked so far)"
  elif echo "$OUTPUT" | grep -q "error_max_turns"; then
    echo "==> [$TICKET_ID] Hit max turns ($MAX_TURNS). Left in progress for next iteration."
    $GIT_CHANGED && MADE_PROGRESS=true
  else
    echo "==> No clear signal detected. Check log: $LOG_FILE"
    $GIT_CHANGED && MADE_PROGRESS=true
  fi

  # Stagnation detection: stop after N consecutive iterations with no progress
  if $MADE_PROGRESS || $GIT_CHANGED; then
    STAGNATION_COUNT=0
  else
    STAGNATION_COUNT=$((STAGNATION_COUNT + 1))
    echo "==> No progress detected. ($STAGNATION_COUNT/$STAGNATION_LIMIT before auto-stop)"
    if [[ $STAGNATION_COUNT -ge $STAGNATION_LIMIT ]]; then
      echo "==> Stagnation limit reached ($STAGNATION_LIMIT iterations with no progress). Stopping."
      break
    fi
  fi

  echo ""
done

# Return to main
git checkout main 2>/dev/null

# Summary
echo ""
echo "======================================"
echo "  Ralph — summary"
echo "======================================"
echo "  Iterations:  $ITERATION"
echo "  Merged:      $DONE_COUNT"
echo "  Blocked:     $BLOCKED_COUNT"
echo "  Stagnated:   $STAGNATION_COUNT"
echo "  Logs:       $LOG_DIR/"
echo "  Progress:   $PROGRESS_FILE"
echo "======================================"
