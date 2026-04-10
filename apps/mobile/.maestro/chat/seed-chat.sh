#!/bin/bash
set -euo pipefail

# Seed script for chat E2E tests
# Creates users with profiles, optionally a conversation and messages.
#
# Usage: ./seed-chat.sh --mode <empty|basic|messages|unread|many|search>
# Output: Exports env vars for Maestro (EMAIL_A, EMAIL_B, TOKEN_A, TOKEN_B, CONVERSATION_ID)

API="${API_URL:-http://127.0.0.1:3000}"
MODE="messages"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# --- Helpers ---

auto_login() {
  local email="$1"
  local resp
  resp=$(curl -sf "$API/dev/auto-login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\"}")
  echo "$resp"
}

trpc_mutate() {
  local token="$1"
  local procedure="$2"
  local input="$3"
  curl -sf "$API/trpc/$procedure" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "$input"
}

# --- Generate unique emails ---

RAND_A="seedA$(date +%s)$RANDOM"
EMAIL_A="${RAND_A}@example.com"

# --- Step 1: Create User A ---

RESP_A=$(auto_login "$EMAIL_A")
USER_ID_A=$(echo "$RESP_A" | jq -r '.user.id')
TOKEN_A=$(echo "$RESP_A" | jq -r '.token')

# Create profile for A + mark complete (E2E needs isComplete for waves/groups)
trpc_mutate "$TOKEN_A" "profiles.create" \
  '{"displayName":"Chat User A","bio":"Testowy uzytkownik A do testow czatu w Blisko","lookingFor":"Szukam ludzi do rozmow i testowania czatu"}' \
  > /dev/null
curl -sf "$API/dev/mark-complete" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID_A\"}" > /dev/null

# Update location for A (Warsaw)
trpc_mutate "$TOKEN_A" "profiles.updateLocation" \
  '{"latitude":52.2297,"longitude":21.0122}' \
  > /dev/null

# For empty mode, only user A is needed (no conversation)
if [ "$MODE" = "empty" ]; then
  cat <<EOF
export EMAIL="$EMAIL_A"
export EMAIL_A="$EMAIL_A"
export TOKEN_A="$TOKEN_A"
export USER_ID_A="$USER_ID_A"
EOF
  exit 0
fi

# --- Step 2: Create User B ---

RAND_B="seedB$(date +%s)$RANDOM"
EMAIL_B="${RAND_B}@example.com"

RESP_B=$(auto_login "$EMAIL_B")
USER_ID_B=$(echo "$RESP_B" | jq -r '.user.id')
TOKEN_B=$(echo "$RESP_B" | jq -r '.token')

# Create profile for B + mark complete
trpc_mutate "$TOKEN_B" "profiles.create" \
  '{"displayName":"Chat User B","bio":"Testowy uzytkownik B do testow czatu w Blisko","lookingFor":"Szukam ludzi do rozmow i testowania czatu"}' \
  > /dev/null
curl -sf "$API/dev/mark-complete" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID_B\"}" > /dev/null

# Update location for B (Warsaw, slightly offset)
trpc_mutate "$TOKEN_B" "profiles.updateLocation" \
  '{"latitude":52.2300,"longitude":21.0130}' \
  > /dev/null

# --- Step 3: Wave + Accept → Conversation ---

WAVE_RESP=$(trpc_mutate "$TOKEN_A" "waves.send" \
  "{\"toUserId\":\"$USER_ID_B\",\"message\":\"Hej, testowe zaczepienie!\"}")
WAVE_ID=$(echo "$WAVE_RESP" | jq -r '.result.data.id')

ACCEPT_RESP=$(trpc_mutate "$TOKEN_B" "waves.respond" \
  "{\"waveId\":\"$WAVE_ID\",\"accept\":true}")
CONVERSATION_ID=$(echo "$ACCEPT_RESP" | jq -r '.result.data.conversationId')

if [ -z "$CONVERSATION_ID" ] || [ "$CONVERSATION_ID" = "null" ]; then
  echo "ERROR: Failed to create conversation" >&2
  echo "Wave response: $WAVE_RESP" >&2
  echo "Accept response: $ACCEPT_RESP" >&2
  exit 1
fi

# --- Step 4: Seed messages based on mode ---

send_msg() {
  local sender_id="$1"
  local content="$2"
  curl -sf "$API/dev/send-message" \
    -H "Content-Type: application/json" \
    -d "{\"conversationId\":\"$CONVERSATION_ID\",\"senderId\":\"$sender_id\",\"content\":\"$content\"}" \
    > /dev/null
}

case "$MODE" in
  basic)
    # No messages — just the conversation
    ;;
  messages)
    send_msg "$USER_ID_A" "Jak sie masz?"
    send_msg "$USER_ID_B" "Hej! Dobrze, a Ty?"
    send_msg "$USER_ID_A" "Super, dzieki za odpowiedz"
    send_msg "$USER_ID_B" "Nie ma sprawy, milo Cie poznac"
    send_msg "$USER_ID_A" "Wzajemnie! Co robisz w weekend?"
    send_msg "$USER_ID_B" "Moze spotkamy sie na kawe?"
    send_msg "$USER_ID_A" "Swietny pomysl!"
    send_msg "$USER_ID_B" "To sie umawiamy"
    send_msg "$USER_ID_A" "Jasne, do zobaczenia!"
    send_msg "$USER_ID_B" "Na razie!"
    ;;
  unread)
    send_msg "$USER_ID_A" "Jak sie masz?"
    send_msg "$USER_ID_B" "Hej! Dobrze, a Ty?"
    send_msg "$USER_ID_A" "Swietnie, dzieki"
    # These messages from B will be unread by A
    send_msg "$USER_ID_B" "Mam pytanie do Ciebie"
    send_msg "$USER_ID_B" "Czy mozemy sie spotkac?"
    send_msg "$USER_ID_B" "Odezwij sie jak bedziesz mogl"
    ;;
  many)
    # 60 messages for pagination test
    for i in $(seq 1 30); do
      send_msg "$USER_ID_A" "Wiadomosc od A numer $i"
      send_msg "$USER_ID_B" "Odpowiedz od B numer $i"
    done
    ;;
  search)
    send_msg "$USER_ID_A" "Jak sie masz?"
    send_msg "$USER_ID_B" "Hej! Wszystko dobrze"
    send_msg "$USER_ID_A" "Szukam restauracji na obiad"
    send_msg "$USER_ID_B" "Polecam pizzerie na Mokotowie"
    send_msg "$USER_ID_A" "UNIKALNA FRAZA TESTOWA do wyszukiwania"
    send_msg "$USER_ID_B" "O czym mowisz?"
    send_msg "$USER_ID_A" "To tylko test wyszukiwania"
    send_msg "$USER_ID_B" "Aha, rozumiem"
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    exit 1
    ;;
esac

# --- Output env vars for eval ---

cat <<EOF
export EMAIL="$EMAIL_A"
export EMAIL_A="$EMAIL_A"
export EMAIL_B="$EMAIL_B"
export TOKEN_A="$TOKEN_A"
export TOKEN_B="$TOKEN_B"
export USER_ID_A="$USER_ID_A"
export USER_ID_B="$USER_ID_B"
export CONVERSATION_ID="$CONVERSATION_ID"
EOF
