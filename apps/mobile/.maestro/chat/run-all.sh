#!/bin/bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
FAILURES=()

run_one() {
  local test="$1"
  local mode="$2"
  echo ""
  echo "================================================================"
  echo "==> TEST: $test (mode: $mode)"
  echo "================================================================"
  if "$SCRIPT_DIR/run-test.sh" "$test" "$mode"; then
    echo "==> ✅ PASSED: $test"
    PASS=$((PASS + 1))
  else
    echo "==> ❌ FAILED: $test"
    FAIL=$((FAIL + 1))
    FAILURES+=("$test")
  fi
}

run_one empty-chats.yaml      empty
run_one conversation-list.yaml messages
run_one send-message.yaml      basic
run_one read-receipts.yaml     unread
run_one reply-message.yaml     messages
run_one delete-message.yaml    messages
run_one emoji-reaction.yaml    messages
run_one search-messages.yaml   search
run_one pagination.yaml        many

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
