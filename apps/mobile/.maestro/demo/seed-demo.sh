#!/bin/bash
set -euo pipefail

# Seed script for the demo-critical E2E flows (BLI-300).
# Creates the fixtures the seeded flows depend on:
#   - send-wave / profile-quickview: user A (logged into the app) + user B nearby,
#     so B shows up in A's nearby list and A can open B's profile / ping B.
#   - accept-wave-chat: B sends a REAL ping to A so the app exercises the
#     ping -> accept -> conversation-creation path (NOT a pre-seeded conversation).
#
# Both users are `test` type (via /dev/auto-login) so they live in the E2E
# discovery bubble — test users only see other test users (db/filters.ts).
#
# Usage: ./seed-demo.sh --mode <nearby|incoming-ping>
# Output: exports env vars for Maestro (EMAIL, EMAIL_A, EMAIL_B, USER_ID_A, USER_ID_B)

API="${API_URL:-http://127.0.0.1:3000}"
MODE="nearby"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# A 1x1 transparent png on a stable host — any valid https URL satisfies the
# avatarUrl url() validator and the `no_avatar` ping gate (waves.send).
AVATAR_URL="https://placehold.co/200x200/png"

auto_login() {
  curl -sf "$API/dev/auto-login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\"}"
}

trpc_mutate() {
  local token="$1" procedure="$2" input="$3"
  curl -sf "$API/trpc/$procedure" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "$input"
}

mark_complete() {
  curl -sf "$API/dev/mark-complete" \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"$1\"}" > /dev/null
}

# --- User A (logged into the app under test) ---

EMAIL_A="demoA$(date +%s)$RANDOM@example.com"
RESP_A=$(auto_login "$EMAIL_A")
USER_ID_A=$(echo "$RESP_A" | jq -r '.user.id')
TOKEN_A=$(echo "$RESP_A" | jq -r '.token')

trpc_mutate "$TOKEN_A" "profiles.create" \
  '{"displayName":"Demo User A","bio":"Testowy uzytkownik A dla flow demo w Blisko","lookingFor":"Szukam ludzi do wspolnych projektow i rozmow"}' \
  > /dev/null
mark_complete "$USER_ID_A"
# A needs an avatar to be able to ping B from the UI (waves.send no_avatar gate).
trpc_mutate "$TOKEN_A" "profiles.update" "{\"avatarUrl\":\"$AVATAR_URL\"}" > /dev/null
trpc_mutate "$TOKEN_A" "profiles.updateLocation" \
  '{"latitude":52.2297,"longitude":21.0122,"skipAnalysis":true}' \
  > /dev/null

# --- User B (the nearby peer) ---

EMAIL_B="demoB$(date +%s)$RANDOM@example.com"
RESP_B=$(auto_login "$EMAIL_B")
USER_ID_B=$(echo "$RESP_B" | jq -r '.user.id')
TOKEN_B=$(echo "$RESP_B" | jq -r '.token')

trpc_mutate "$TOKEN_B" "profiles.create" \
  '{"displayName":"Demo User B","bio":"Testowy uzytkownik B dla flow demo w Blisko","lookingFor":"Szukam ludzi do wspolnych projektow i rozmow"}' \
  > /dev/null
mark_complete "$USER_ID_B"
# B needs an avatar so B can ping A (incoming-ping mode) and so B renders in the list.
trpc_mutate "$TOKEN_B" "profiles.update" "{\"avatarUrl\":\"$AVATAR_URL\"}" > /dev/null
# B is ~70m from A — comfortably inside the nearby radius.
trpc_mutate "$TOKEN_B" "profiles.updateLocation" \
  '{"latitude":52.2300,"longitude":21.0130,"skipAnalysis":true}' \
  > /dev/null

# --- incoming-ping mode: B sends a REAL ping to A ---
# The flow then logs in as A, opens the ping, taps Accept, and the app creates
# the conversation live (the path the chat tests previously faked).

if [ "$MODE" = "incoming-ping" ]; then
  WAVE_RESP=$(trpc_mutate "$TOKEN_B" "waves.send" "{\"toUserId\":\"$USER_ID_A\"}")
  WAVE_ID=$(echo "$WAVE_RESP" | jq -r '.result.data.wave.id // .result.data.id // empty')
  if [ -z "$WAVE_ID" ]; then
    echo "ERROR: B failed to ping A" >&2
    echo "Wave response: $WAVE_RESP" >&2
    exit 1
  fi
fi

cat <<EOF
export EMAIL="$EMAIL_A"
export EMAIL_A="$EMAIL_A"
export EMAIL_B="$EMAIL_B"
export USER_ID_A="$USER_ID_A"
export USER_ID_B="$USER_ID_B"
export DISPLAY_NAME_B="Demo User B"
EOF
