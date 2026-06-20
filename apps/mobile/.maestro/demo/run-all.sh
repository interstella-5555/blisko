#!/bin/bash
set -uo pipefail

# Runs all seeded demo-critical flows (BLI-300), PL + UA, each with a fresh seed.
# The fresh map-render / set-status flows do NOT need seeding — run those via
# `bun run mobile:test:e2e:pl` / `:ua` instead.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
FAILURES=()

run_one() {
  local flow="$1" mode="$2"
  echo ""
  echo "================================================================"
  echo "==> FLOW: $flow (mode: $mode)"
  echo "================================================================"
  if "$SCRIPT_DIR/run-test.sh" "$flow" "$mode"; then
    echo "==> PASSED: $flow"
    PASS=$((PASS + 1))
  else
    echo "==> FAILED: $flow"
    FAIL=$((FAIL + 1))
    FAILURES+=("$flow")
  fi
}

run_one send-wave.yaml             nearby
run_one send-wave-ua.yaml          nearby
run_one profile-quickview.yaml     nearby
run_one profile-quickview-ua.yaml  nearby
run_one accept-wave-chat.yaml      incoming-ping
run_one accept-wave-chat-ua.yaml   incoming-ping

echo ""
echo "================================================================"
echo "==> RESULTS: $PASS passed, $FAIL failed (out of $((PASS + FAIL)))"
if [ ${#FAILURES[@]} -gt 0 ]; then
  echo "==> FAILURES:"
  for f in "${FAILURES[@]}"; do
    echo "    - $f"
  done
fi
echo "================================================================"
