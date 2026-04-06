# Friends System

> Not implemented — planned in PRODUCT.md.

## Product Vision

Per PRODUCT.md:

- **Contact scanning:** User scans phone contacts → sees who has Blisko (they don't know you checked)
- **Friend request:** Invitation → acceptance = connected as friends
- **Friend privileges:**
  - See each other's statuses after tapping profile on map (no ping needed)
  - Friend's bubble on map stays visually neutral (like everyone else)
  - Direct chat without ping, no limit
  - Pings to friends don't count toward daily limit
  - Notification when friend is nearby
- **No friend limit**, available for all plans
- **Unfriending:** No notification to the removed person

## Current Implementation

**None.** No friends table, no contact scanning, no friend-specific behavior. All connections go through the wave/ping system.

## Implementation Notes

When implementing, consider:
- New `friends` table (userId, friendId, status, createdAt)
- Contact permission handling on mobile (expo-contacts)
- Privacy: contact hashes vs raw phone numbers
- Modifying nearby queries to show friend indicators
- Separate chat creation path (skip wave requirement)
- Push notification for "friend nearby"
- Impact on: `waves-connections.md` (ping limit exemption), `push-notifications.md` (friend nearby push), `location-privacy.md` (friend proximity), `messaging.md` (direct chat)
