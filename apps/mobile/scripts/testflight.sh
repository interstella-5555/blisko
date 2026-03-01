#!/bin/bash
set -e

MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$MOBILE_DIR/ios"
ARCHIVE_PATH="$IOS_DIR/build/Blisko.xcarchive"

echo "=== Blisko → TestFlight ==="
echo ""

# 1. Install CocoaPods if needed
echo "[1/3] Checking CocoaPods..."
cd "$IOS_DIR"
if [ Podfile -nt Pods/Manifest.lock ] 2>/dev/null; then
  echo "  Installing pods..."
  pod install --silent
else
  echo "  Pods up to date."
fi

# 2. Archive
echo "[2/3] Building archive (this takes a few minutes)..."
xcodebuild \
  -workspace Blisko.xcworkspace \
  -scheme Blisko \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  -quiet \
  archive

echo "[3/3] Opening archive in Xcode Organizer..."
open "$ARCHIVE_PATH"

echo ""
echo "=== Archive ready! ==="
echo ""
echo "In Xcode Organizer:"
echo "  1. Click 'Distribute App'"
echo "  2. Select 'App Store Connect'"
echo "  3. Click 'Upload'"
echo "  4. Build appears in TestFlight in ~5-15 min"
