#!/bin/bash
set -euo pipefail

# Runner script: seeds data then runs a Maestro test
#
# Usage: ./run-test.sh <test.yaml> [seed-mode]
# Example: ./run-test.sh send-message.yaml basic

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_FILE="${1:?Usage: ./run-test.sh <test.yaml> [seed-mode]}"
SEED_MODE="${2:-messages}"

echo "==> Seeding chat data (mode: $SEED_MODE)..."
eval "$("$SCRIPT_DIR/seed-chat.sh" --mode "$SEED_MODE")"

echo "==> Seed complete:"
echo "    EMAIL_A=$EMAIL_A"
echo "    EMAIL_B=${EMAIL_B:-n/a}"
echo "    CONVERSATION_ID=${CONVERSATION_ID:-n/a}"

echo "==> Running Maestro test: $TEST_FILE"

MAESTRO_ARGS=(-e EMAIL="$EMAIL_A")
[ -n "${EMAIL_B:-}" ] && MAESTRO_ARGS+=(-e EMAIL_B="$EMAIL_B")
[ -n "${CONVERSATION_ID:-}" ] && MAESTRO_ARGS+=(-e CONVERSATION_ID="$CONVERSATION_ID")

maestro test "${MAESTRO_ARGS[@]}" "$SCRIPT_DIR/$TEST_FILE"
