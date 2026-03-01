#!/usr/bin/env bash
set -euo pipefail

# Ralph — autonomous worker loop for Blisko
# Runs Claude in a loop, one ticket per iteration, using Linear as state tracker.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPT_FILE="$SCRIPT_DIR/ralph-prompt.md"
LOG_DIR="$SCRIPT_DIR/ralph-logs"

# Defaults
MAX_ITERATIONS=20
BUDGET_PER=5
TOTAL_BUDGET=50
MODEL="opus"
DRY_RUN=false
VERBOSE=false

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
    --budget-per) BUDGET_PER="$2"; shift 2 ;;
    --total-budget) TOTAL_BUDGET="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    -h|--help)
      echo "Usage: ralph.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --max-iterations N   Max iterations (default: 20)"
      echo "  --budget-per N       USD budget per iteration (default: 5)"
      echo "  --total-budget N     USD total budget cap (default: 50)"
      echo "  --model MODEL        Claude model (default: opus)"
      echo "  --dry-run            Preview ticket queue only"
      echo "  --verbose            Show full Claude output"
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

# Stats
DONE_COUNT=0
BLOCKED_COUNT=0
ITERATION=0
SPENT=0

echo ""
echo "======================================"
echo "  Ralph — autonomous worker"
echo "======================================"
echo "  Max iterations: $MAX_ITERATIONS"
echo "  Budget per iteration: \$$BUDGET_PER"
echo "  Total budget cap: \$$TOTAL_BUDGET"
echo "  Model: $MODEL"
echo "======================================"
echo ""

# Main loop
while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
  ITERATION=$((ITERATION + 1))
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  LOG_FILE="$LOG_DIR/ralph_${TIMESTAMP}_iter${ITERATION}.json"

  echo "==> Iteration $ITERATION/$MAX_ITERATIONS (spent so far: ~\$$SPENT)"

  # Budget check
  if (( $(echo "$SPENT >= $TOTAL_BUDGET" | bc -l) )); then
    echo "==> Total budget cap reached (\$$TOTAL_BUDGET). Stopping."
    break
  fi

  # Ensure on main between iterations
  git checkout main 2>/dev/null
  git pull origin main 2>/dev/null

  # Run Claude
  OUTPUT=$(cat "$PROMPT_FILE" | claude -p \
    --model "$MODEL" \
    --output-format json \
    --max-budget-usd "$BUDGET_PER" \
    --dangerously-skip-permissions \
    2>&1) || true

  # Save log
  echo "$OUTPUT" > "$LOG_FILE"

  # Extract cost from JSON (best effort)
  ITER_COST=$(echo "$OUTPUT" | grep -o '"cost_usd":[0-9.]*' | head -1 | cut -d: -f2 || echo "0")
  if [[ -z "$ITER_COST" ]]; then
    ITER_COST="$BUDGET_PER"
  fi
  SPENT=$(echo "$SPENT + $ITER_COST" | bc -l 2>/dev/null || echo "$SPENT")

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
    echo "==> Ticket merged successfully. ($DONE_COUNT done so far)"
  elif echo "$OUTPUT" | grep -q "RALPH_BLOCKED"; then
    BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
    echo "==> Ticket blocked. ($BLOCKED_COUNT blocked so far)"
  else
    echo "==> No clear signal detected. Check log: $LOG_FILE"
    # Continue anyway — might be a partial output
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
echo "  Est. cost:  ~\$$SPENT"
echo "  Logs:       $LOG_DIR/"
echo "======================================"
