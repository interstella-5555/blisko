#!/bin/bash
set -euo pipefail

# Runner: seeds demo fixtures then runs a demo-critical Maestro flow (BLI-300).
#
# Usage: ./run-test.sh <flow.yaml> [seed-mode]
# Example: ./run-test.sh send-wave.yaml nearby
#          ./run-test.sh accept-wave-chat.yaml incoming-ping

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_FILE="${1:?Usage: ./run-test.sh <flow.yaml> [seed-mode]}"
SEED_MODE="${2:-nearby}"

echo "==> Seeding demo data (mode: $SEED_MODE)..."
eval "$("$SCRIPT_DIR/seed-demo.sh" --mode "$SEED_MODE")"

echo "==> Seed complete:"
echo "    EMAIL_A=$EMAIL_A"
echo "    EMAIL_B=$EMAIL_B"
echo "    DISPLAY_NAME_B=$DISPLAY_NAME_B"

echo "==> Running Maestro flow: $TEST_FILE"
maestro test \
  -e EMAIL="$EMAIL_A" \
  -e DISPLAY_NAME_B="$DISPLAY_NAME_B" \
  "$SCRIPT_DIR/$TEST_FILE"
