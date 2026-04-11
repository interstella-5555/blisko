# Nearby Group Members

> v1 — AI-generated from source analysis, 2026-04-06.

## Terminology & Product Alignment

| PRODUCT.md term | Code term | UI term (PL) |
|-----------------|-----------|--------------|
| Grupa | Group conversation (`conversations.type = 'group'`) | Grupa |
| W pobliżu | Nearby members (`getNearbyMembers`, `nearbyMemberCount`) | "W pobliżu" / "X osób w pobliżu" |
| Bliskość fizyczna | Haversine distance filter | Odległość w metrach |
| Prywatność lokalizacji | `locationVisible` on `conversation_participants` | "Pokaż moją lokalizację" toggle |

## Where Nearby Members Are Shown

Nearby member information surfaces in three places in the app:

### 1. Map Markers

Groups appear on the map when the filter is set to "Wszystko" or "Grupy". The `groups.getDiscoverable` tRPC query returns `nearbyMemberCount` for each group within the user's visible radius.

**Marker component:** `GroupMarker` (`apps/mobile/src/components/nearby/GroupMarker.tsx`).

- **Shape:** Rounded square (`borderRadius: 12`, 46x46 px) with group avatar inside — visually distinct from circular person markers on the map. White background with drop shadow.
- **Badge:** Green circle (`backgroundColor: #22c55e`, min-width 20px, height 20px) with white bold count text (fontSize 11, fontWeight 700). Positioned at `top: -4, right: -4` (overlapping the marker). White border (2px) separates it from the avatar.
- **Badge visibility:** Only rendered when `nearbyCount > 0`. Groups with no nearby members show just the avatar square, no badge.
- **Tap behavior:** Opens group detail screen via push modal navigation.

### 2. Group List (`GroupRow`)

`GroupRow` (`apps/mobile/src/components/nearby/GroupRow.tsx`) shows discoverable groups in a scrollable list below the map.

**Layout:** Row with avatar (44px), then info column containing: name + distance on the same line, "GRUPA * N czlonkow" metadata, optional description (2 lines max), optional nearby badge.

- **Nearby indicator:** Muted green text (`color: #5B7A5E`, fontSize 12, `fonts.sansMedium`) below description: `"{N} osoba w pobliżu"` (singular) or `"{N} osób w pobliżu"` (plural). Rendered 3px below description.
- **Visibility rule:** Only rendered when `nearbyMemberCount` is defined and > 0.
- **Distance:** Formatted via `formatDistance()` helper (e.g. "1.2 km", "300 m"), shown in muted text aligned to the right of the name.

### 3. Group Detail Screen

The `groups.getNearbyMembers` tRPC procedure returns nearby members for a specific group, powering the "W pobliżu" section on the group detail screen. The `groups.getGroupInfo` procedure returns the overall group information including `memberCount`.

## Display Rules

| Situation | Behavior |
|-----------|----------|
| Group with 5 or fewer total members | Single "Członkowie" list with distance badge on nearby members. No separate nearby section. |
| > 5 members, 0 nearby | No nearby section. Threads, then Members (5) with "Pokaż wszystkich" link. |
| > 5 members, 1-5 nearby | "W pobliżu (N)" section with cards. Below it: Members (5). |
| > 5 members, > 5 nearby | Nearby section shows 5 closest. "Pokaż w pobliżu" expands to max 20 (API hard cap). Section title shows true total count. |
| Non-member, 0 nearby | No nearby section. Avatar + description + "Dołącz" button. |
| Non-member, 1+ nearby | Nearby section (max 5 + expand). No full member list. |

## UI Caps for Large Groups

#### Why caps are necessary

A conference or event group could have hundreds of members. Without caps, the group detail screen would render hundreds of rows inline, destroying scroll performance and making the screen unusable. The cap system ensures the screen stays lightweight regardless of group size.

| Element | Default | Expanded | Why |
|---------|---------|----------|-----|
| Nearby section | 5 closest rows | Max 20 rows (API `limit` parameter max value) | At a 400-person conference, unbounded nearby list would destroy scroll performance. The section title still shows the true total (e.g. "W pobliżu (47)"). |
| Members on group detail | 5 rows (sorted: owner first, then admin, then by join date) | "Pokaż wszystkich (N)" link navigates to dedicated screen | Group detail screen stays lightweight — never hundreds of inline rows. |
| Members on dedicated screen | FlatList (virtualized) with cursor-based pagination by 50 | Search bar appears when > 50 members | FlatList only renders visible rows (React Native virtualization). Cursor pagination via `offset` param prevents loading all members at once. |

#### Member ordering

The `groups.getMembers` query sorts by role priority (`owner` = 0, `admin` = 1, `member` = 2), then by `joinedAt` ascending. This ensures group leadership is always visible at the top without scrolling.

## Privacy: Opt-Out Per Group

#### What

Each group member has a `locationVisible` boolean on the `conversation_participants` table (default: `true`). Toggle: "Pokaż moją lokalizację" in the group actions section. Description: "Inni członkowie zobaczą, że jesteś w pobliżu".

Members with `locationVisible = false` are excluded from all nearby counts and lists.

#### Why

Per-group granularity gives users control over which groups can see their proximity. A user might want to be visible in their running club but not in a work group. The default `true` aligns with the app's core proposition (physical proximity is the product), while the toggle respects PRODUCT.md principle 1: "Kontrola intencji ponad wygodę odkrywania."

#### Config

- Column: `location_visible` boolean, `DEFAULT true`, `NOT NULL`, on `conversation_participants`.
- Procedure: `groups.setLocationVisibility` — takes `{ conversationId, visible }`.
- Read: `groups.getGroupInfo` returns `locationVisible` for the current user's participant record.

## Query: `groups.getNearbyMembers`

#### What

Returns nearby members of a specific group, sorted by distance (closest first).

#### Input

| Param | Type | Default | Constraint |
|-------|------|---------|------------|
| `conversationId` | uuid | required | |
| `latitude` | number | required | -90 to 90 |
| `longitude` | number | required | -180 to 180 |
| `radiusMeters` | number | 5000 | 100 to 50000 |
| `limit` | number | 20 | 1 to 20 |

#### Filters applied

1. `conversationParticipants.conversationId = input` (member of this group)
2. `conversationParticipants.locationVisible = true` (privacy opt-in)
3. `profiles.latitude IS NOT NULL` (has location)
4. Haversine distance <= `radiusMeters`
5. `userId != ctx.userId` (exclude self)
6. `user.deletedAt IS NULL` (exclude soft-deleted users)

#### Query structure

Two queries:
1. **Count query** — total nearby members matching all filters (for "W pobliżu (N)" section title).
2. **Data query** — returns `userId`, `displayName`, `avatarUrl`, `distance` (rounded to nearest meter), limited by `limit`, ordered by distance ascending.

Both queries use INNER JOINs: `conversation_participants` -> `profiles` (for location + display info) -> `user` (for soft-delete filter).

#### Haversine formula

```sql
6371000 * acos(
  cos(radians(lat1)) * cos(radians(lat2)) *
  cos(radians(lon2) - radians(lon1)) +
  sin(radians(lat1)) * sin(radians(lat2))
)
```

Returns distance in meters (Earth radius = 6,371,000 m). Used identically in `getNearbyMembers` (member-to-user distance) and `getDiscoverable` (group-to-user distance + member-to-user in subquery). The formula computes great-circle distance — accurate enough for city-scale distances (Warsaw), negligible error at sub-50km ranges.

#### Performance note

The haversine formula is computed for every candidate row — there is no spatial index. For the current scale (250 seed users, small groups), this is fine. If group sizes grow to thousands of members, a PostGIS `ST_DWithin` index would be needed.

## Query: `groups.getDiscoverable` (nearby member count)

#### What

The discoverable groups query returns groups within a given radius, sorted by distance. For each group, it computes two counts as correlated subqueries:
- `memberCount` — total active (non-deleted) members.
- `nearbyMemberCount` — members within the user's radius who have `locationVisible = true` and a non-null location.

These counts power the green badge on map markers and the "X osob w poblizu" text on group rows.

#### Filter consistency

The `nearbyMemberCount` subquery applies the same filters as `getNearbyMembers`: `locationVisible = true`, `profiles.latitude IS NOT NULL`, haversine distance within `radiusMeters`, `user.deletedAt IS NULL`. This ensures the badge count on the map matches the list the user sees when they open the group detail. If filters diverged, users would see "3 w poblizu" on the badge but only 2 entries in the list — confusing.

#### Query structure

The main query filters on `conversations` where `type = 'group'`, `isDiscoverable = true`, `deletedAt IS NULL`, and haversine distance to group coordinates <= `radiusMeters`. Results are sorted by distance ascending, with cursor-based pagination (`limit` + `offset`).

Both `memberCount` and `nearbyMemberCount` are computed as scalar subqueries within the `SELECT` clause, not as JOINs. This avoids row multiplication from multiple aggregations on different join paths.

## Impact Map

If you change this system, also check:

- **`apps/api/src/trpc/procedures/groups.ts`** — `getNearbyMembers` and `getDiscoverable` procedures contain the haversine queries and privacy filters.
- **`apps/api/src/db/schema.ts`** — `conversationParticipants.locationVisible` column. Changing the default or nullability affects all existing members.
- **`apps/mobile/src/components/nearby/GroupMarker.tsx`** — Map marker with green badge. `nearbyCount` drives badge visibility.
- **`apps/mobile/src/components/nearby/GroupRow.tsx`** — List row with green "X osób w pobliżu" text.
- **`apps/api/src/services/data-export.ts`** — GDPR export. If `locationVisible` preference is considered personal data, it should be included.
- **Soft-delete filter** — All nearby queries INNER JOIN to `user` table with `isNull(user.deletedAt)`. New queries touching group members must maintain this pattern.
- **`apps/api/src/config/rateLimits.ts`** — `profiles.getNearby` rate limit (currently 600/min, temporarily inflated as a mitigation for BLI-189; will be lowered once map polling has proper debounce/dedup) applies to map refresh which triggers `getDiscoverable`. `getNearbyMembers` is currently unrate-limited; consider whether large groups + high-frequency map polls warrant adding one once BLI-189 lands.
