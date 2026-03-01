#!/usr/bin/env bash
set -euo pipefail

# Ralph — autonomous worker loop for Blisko
# Runs Claude in a loop, one task per iteration, using progress.txt for state.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPT_FILE="$SCRIPT_DIR/ralph-prompt.md"
PROGRESS_FILE="$SCRIPT_DIR/ralph-progress.txt"
LOG_DIR="$SCRIPT_DIR/ralph-logs"

# Defaults
MAX_ITERATIONS=20
MAX_TURNS=50
MODEL="opus"
DRY_RUN=false
VERBOSE=false

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
    --max-turns) MAX_TURNS="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    --reset) echo "==> Clearing progress file"; rm -f "$PROGRESS_FILE"; shift ;;
    -h|--help)
      echo "Usage: ralph.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --max-iterations N   Max iterations (default: 20)"
      echo "  --max-turns N        Max agent turns per iteration (default: 50)"
      echo "  --model MODEL        Claude model (default: opus)"
      echo "  --dry-run            Preview ticket queue only"
      echo "  --verbose            Show full Claude output"
      echo "  --reset              Clear progress file before starting"
      echo "  -h, --help           Show this help"
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
  cat "$PROMPT_FILE" | claude -p \
    --model "$MODEL" \
    --output-format text \
    --max-turns 3 \
    --dangerously-skip-permissions \
    -a "Query Linear: team=Blisko, status=Todo, label=Ralph. List all matching tickets sorted by priority DESC then identifier ASC. Output each as: [identifier] [title] [priority]. If none found, say 'No Ralph tickets in queue.'. Do NOT work on any ticket — just list them."
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
ITERATION=0

echo ""
echo "======================================"
echo "  Ralph — autonomous worker"
echo "======================================"
echo "  Max iterations: $MAX_ITERATIONS"
echo "  Max turns/iter: $MAX_TURNS"
echo "  Model:          $MODEL"
echo "  Progress file:  $PROGRESS_FILE"
echo "======================================"
echo ""

# Main loop
while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
  ITERATION=$((ITERATION + 1))
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  LOG_FILE="$LOG_DIR/ralph_${TIMESTAMP}_iter${ITERATION}.json"

  echo "==> Iteration $ITERATION/$MAX_ITERATIONS"

  # Ensure on main between iterations
  git checkout main 2>/dev/null
  git pull origin main 2>/dev/null

  # Run Claude with progress file as context (concatenated into prompt)
  OUTPUT=$({ cat "$PROMPT_FILE"; echo -e "\n\n---\n\n## Current progress file contents\n"; cat "$PROGRESS_FILE"; } | claude -p \
    --model "$MODEL" \
    --output-format json \
    --max-turns "$MAX_TURNS" \
    --dangerously-skip-permissions \
    2>&1) || true

  # Save log
  echo "$OUTPUT" > "$LOG_FILE"

  if $VERBOSE; then
    echo "--- Full output ---"
    echo "$OUTPUT"
    echo "--- End output ---"
  fi

  # Parse signal from output
  if echo "$OUTPUT" | grep -q "RALPH_DONE"; then
    echo "==> No more tickets. Ralph is done."
    break
  elif echo "$OUTPUT" | grep -q "RALPH_MERGED"; then
    DONE_COUNT=$((DONE_COUNT + 1))
    echo "==> Task completed and merged. ($DONE_COUNT done so far)"
  elif echo "$OUTPUT" | grep -q "RALPH_BLOCKED"; then
    BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
    echo "==> Task blocked. ($BLOCKED_COUNT blocked so far)"
  elif echo "$OUTPUT" | grep -q "error_max_turns"; then
    echo "==> Hit max turns ($MAX_TURNS). Task left in progress for next iteration."
  else
    echo "==> No clear signal detected. Check log: $LOG_FILE"
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
echo "  Iterations: $ITERATION"
echo "  Merged:     $DONE_COUNT"
echo "  Blocked:    $BLOCKED_COUNT"
echo "  Logs:       $LOG_DIR/"
echo "  Progress:   $PROGRESS_FILE"
echo "======================================"
