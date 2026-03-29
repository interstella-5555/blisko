#!/bin/bash
# Kill old processes and configure env for local dev

# Kill API (port 3000) and Metro (port 8081)
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:8081 | xargs kill -9 2>/dev/null || true

# Kill old Redis container
docker rm -f blisko-redis 2>/dev/null || true

# Kill iOS Simulator
killall "Simulator" 2>/dev/null || true

# Set mobile to use local API
echo "EXPO_PUBLIC_API_URL=http://localhost:3000" > "$(dirname "$0")/../apps/mobile/.env.local"

echo "Cleanup done."
