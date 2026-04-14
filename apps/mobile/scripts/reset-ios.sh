#!/usr/bin/env bash
# Full iOS reset: nukes caches + regenerates native projects + rebuilds.
# Run this when:
#   - Adding/removing a native dependency (expo-* packages with native code)
#   - After an SDK upgrade
#   - When you get "Unable to resolve module" or "Duplicate symbols" from Metro/Xcode
#   - When the simulator "works on my machine" suddenly stops working
#
# Does NOT nuke node_modules — use `bun install` separately if needed.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/5] Killing Metro bundler processes..."
pkill -f "metro" 2>/dev/null || true
pkill -f "expo start" 2>/dev/null || true

echo "[2/5] Clearing Metro + Expo caches..."
rm -rf .expo
rm -rf node_modules/.cache
rm -rf /tmp/metro-* /tmp/haste-map-* 2>/dev/null || true
rm -rf "$HOME/Library/Caches/com.facebook.react.packager" 2>/dev/null || true

echo "[3/5] Clearing Xcode derived data for Blisko..."
rm -rf "$HOME/Library/Developer/Xcode/DerivedData/"*Blisko* 2>/dev/null || true
rm -rf ios/build 2>/dev/null || true

echo "[4/5] Regenerating ios/ from Expo config (prebuild --clean)..."
# --clean nukes ios/ and android/ and regenerates from scratch.
# pod install runs automatically after prebuild.
npx expo prebuild --clean --platform ios

echo "[5/5] Building + launching on iOS simulator..."
npx expo run:ios

echo ""
echo "✓ Done. Simulator should be running with a fresh build."
echo "  Set location to Warsaw: xcrun simctl location booted set 52.2010865,20.9618980"
