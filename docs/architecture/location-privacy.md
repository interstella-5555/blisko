# Location & Privacy

> v1 --- AI-generated from source analysis, 2026-04-06.

## Terminology & Product Alignment

| PRODUCT.md term | Codebase term | Notes |
|---|---|---|
| Banka na mapie (bubble) | Profile + grid position | Client renders bubbles from profile data + grid-snapped coords |
| ~300m odleglosc (approximate distance) | `roundDistance()` | Rounds to nearest 100m |
| Promien 500m | `GRID_SIZE = 0.0045` | Grid cells are ~500m x 500m |
| Lokalizacja odswiezana co 3 minuty | `updateLocation` + mobile background task | Server receives updates; frequency controlled by mobile client |
| Ninja / Semi-Open / Full Nomad | `visibilityMode`: `ninja` / `semi_open` / `full_nomad` | Stored on profiles table |
| Ping (in PRODUCT.md) | Wave (in code) | See `waves-connections.md` |

## Location Storage

**What:** Location is stored directly on the `profiles` table as two `real` columns with a composite index.

**Why:** Location is read on every map render and nearby-users query. Keeping it on the profiles table avoids an extra join on the hottest read path.

**Config (profiles table columns):**

| Column | Type | Description |
|---|---|---|
| `latitude` | `real`, nullable | GPS latitude, -90 to 90 |
| `longitude` | `real`, nullable | GPS longitude, -180 to 180 |
| `lastLocationUpdate` | `timestamp`, nullable | When location was last updated |

- Composite index: `profiles_location_idx ON (latitude, longitude)` --- enables bounding box queries to use index scans

## Grid-Based Privacy

**What:** Instead of exposing exact GPS coordinates on the map, locations are snapped to the center of ~500m x 500m grid cells.

**Why:** Prevents stalking via precise GPS. PRODUCT.md specifies "banka w promieniu 50-100m" --- the grid system implements this by never revealing the exact pin. A user observing bubble movements cannot determine precise location; they only see which grid cell the person is in.

**Config:** `apps/api/src/lib/grid.ts`

| Constant | Value | Meaning |
|---|---|---|
| `GRID_SIZE` | 0.0045 degrees | ~500m in latitude (~498m at Warsaw's latitude of 52.2N) |

**How it works:**

1. Latitude grid index: `Math.floor(lat / GRID_SIZE)`
2. Longitude grid size adjusts for latitude curvature: `GRID_SIZE / Math.cos(lat * PI / 180)` --- cells stay roughly square regardless of latitude
3. Longitude grid index: `Math.floor(lng / lngGridSize)`
4. Grid center: `(latIdx + 0.5) * GRID_SIZE` for lat, `(lngIdx + 0.5) * lngGridSize` for lng
5. Grid ID: `"{latIdx}_{lngIdx}"` string --- used by client to group/deduplicate

The `toGridCenter()` function returns `{ gridLat, gridLng, gridId }`. The map endpoint sends these grid-snapped coordinates instead of raw lat/lng.

## Distance Rounding

**What:** `roundDistance(meters)` rounds to the nearest 100m.

**Why:** Prevents triangulation. If a user sees "347m", they can move and re-check to narrow down the exact location. With "300m", the precision is too low for triangulation.

**Config:** Rounds to nearest 100: `Math.round(meters / 100) * 100`. Examples: 347m --> 300m, 1523m --> 1500m, 50m --> 100m.

## updateLocation

**What:** `profiles.updateLocation` mutation updates lat/lng/timestamp and triggers three side effects.

**Config (input validation from `updateLocationSchema`):**
- `latitude`: number, -90 to 90
- `longitude`: number, -180 to 180
- `skipAnalysis`: boolean, optional --- suppresses AI jobs (used during bulk scatter scripts)

**Side effects:**

### 1. Proximity Status Matching Enqueue

If `!skipAnalysis`, enqueues a `proximity-status-matching` BullMQ job. Debounced at 2 minutes per user --- rapid location updates (e.g., walking) don't flood the queue.

### 2. nearbyChanged WebSocket Event

Fire-and-forget: queries all non-ninja users within 5km bounding box (excluding self, excluding soft-deleted), then publishes a `nearbyChanged` WebSocket event to each. This tells their clients to refresh the nearby-users list/map.

**Config:**
- Radius: 5000m (hardcoded `radiusMeters` in the bounding box calc)
- Bounding box formula: `latDelta = radiusMeters / 111000`, `lonDelta = radiusMeters / (111000 * cos(lat * PI / 180))`
- Filters: not self, not ninja, within bounding box, not soft-deleted (INNER JOIN to user table)

The query and event publishing run async (`.then().catch()`) --- they don't block the mutation response.

### 3. No AI Analysis Enqueue on Location Update

Note: `updateLocation` does NOT enqueue pair analysis jobs. Those are triggered by profile changes (`enqueueUserPairAnalysis` in `profiles.update`). Location changes only trigger status matching.

## Nearby Users Queries

Two endpoints serve different use cases. Both share the same filtering logic with minor differences.

### getNearbyUsers (List View)

**What:** Returns nearby users ranked by distance, with cosine similarity scores.

**Config (from `getNearbyUsersSchema`):**

| Param | Type | Range | Default |
|---|---|---|---|
| `latitude` | number | -90 to 90 | required |
| `longitude` | number | -180 to 180 | required |
| `radiusMeters` | number | 100 to 50,000 | 5000 |
| `limit` | number | 1 to 50 | 20 |
| `photoOnly` | boolean | --- | false |

**Query strategy:**

1. **Bounding box pre-filter** (uses composite index): `BETWEEN minLat/maxLat` and `BETWEEN minLon/maxLon`
2. **Haversine fine filter**: SQL-level `6371000 * acos(...)` formula, `<= radiusMeters`
3. **Soft-delete filter**: INNER JOIN to `user` table, `deletedAt IS NULL`
4. **Ninja filter**: `visibilityMode != 'ninja'`
5. **Self filter**: `userId != ctx.userId`
6. **Photo filter** (optional): `avatarUrl IS NOT NULL`
7. **Blocking filter**: fetch blocked IDs (both directions) in parallel, filter in application code
8. **Order**: distance ascending
9. **Limit**: `limit + allBlockedIds.size` (fetch extra to account for post-query blocking filter)

**Returns:** `{ profile, distance, similarityScore }` where `similarityScore` is cosine similarity between profile embeddings (null if either embedding missing).

### getNearbyUsersForMap (Map View)

**What:** Returns nearby users with grid-snapped coordinates, ranking scores, status match flags, and cursor pagination.

**Config (from `getNearbyUsersForMapSchema`):**

| Param | Type | Range | Default |
|---|---|---|---|
| `latitude` | number | -90 to 90 | required |
| `longitude` | number | -180 to 180 | required |
| `radiusMeters` | number | 100 to 50,000 | 5000 |
| `limit` | number | 1 to 100 | 50 |
| `cursor` | number (int) | >= 0 | 0 |
| `photoOnly` | boolean | --- | false |

**Additional data fetched in parallel** (7 concurrent queries):
- Blocked users (both directions)
- Decline-cooldown users (recently declined waves, hidden from map for 24h)
- Current user's profile (for embedding, interests, status)
- All connection analyses from current user
- All status matches for current user
- Total count of nearby users

**Decline cooldown on map:** Users whom the current user sent a wave to that was declined within `DECLINE_COOLDOWN_HOURS` (24h) are filtered out of the map. This is a UX decision --- avoids showing someone who just rejected you.

**Ranking formula:**

```
proximity = 1 - min(distance, radiusMeters) / radiusMeters
matchScore = aiMatchScore / 100         (if AI analysis exists)
           | 0.7 * cosineSim + 0.3 * interestOverlap  (fallback)
           | interestOverlap            (if no embedding)
rankScore  = 0.6 * matchScore + 0.4 * proximity
```

The weights favor match quality (60%) over proximity (40%).

**Interest overlap:** `commonInterests.length / myInterests.length` --- fraction of MY interests that appear in THEIR interests array.

**Grid position:** Each result includes `gridLat`, `gridLng`, `gridId` from `toGridCenter()`.

**Status visibility enforcement:**
- `currentStatus` is returned as `null` for private statuses (`isStatusPublic()` check)
- `hasStatusMatch` boolean is returned regardless --- controls pulsing bubble animation

**Safety net for missing analyses:** Users without any connection analysis get queued for a quick score (`enqueueQuickScore`) so their match percentage populates on the next map refresh.

**Cursor pagination:** offset-based via `cursor` param. `nextCursor = offset + limit` if more results exist, `null` otherwise.

**Returns:**
```
{
  users: [{ profile, distance, gridLat, gridLng, gridId, rankScore,
            matchScore, commonInterests, shortSnippet, analysisReady,
            hasStatusMatch }],
  totalCount,
  nextCursor,
  myStatus: { text, setAt } | null
}
```

**Sort:** Results are sorted by `rankScore` descending (highest match quality first) in application code after the distance-ordered SQL query.

## Rate Limits

From `rateLimits.ts`:

| Endpoint | Limit | Window | Applies to |
|---|---|---|---|
| `profiles.getNearby` | 30 requests | 60 seconds | Both `getNearbyUsers` and `getNearbyUsersForMap` |

This prevents pull-to-refresh abuse. Both endpoints share the same rate limit key.

## Haversine

**What:** `packages/shared/src/math.ts` exports `cosineSimilarity()` (used for embeddings, not geo). The actual geographic Haversine formula is inlined as SQL in the nearby queries.

**SQL Haversine formula** (used in both nearby endpoints):
```sql
6371000 * acos(
  LEAST(1.0, GREATEST(-1.0,
    cos(radians(lat)) * cos(radians(profiles.latitude)) *
    cos(radians(profiles.longitude) - radians(lng)) +
    sin(radians(lat)) * sin(radians(profiles.latitude))
  ))
)
```

The `LEAST(1.0, GREATEST(-1.0, ...))` clamping prevents `acos` domain errors from floating-point imprecision.

**Also computed in-app:** The accept-time distance in `waves.respond` uses a JavaScript Haversine implementation (not the shared helper --- it's inlined in the procedure).

## Seed User Locations

**What:** 250 seed users (`user0@example.com` through `user249@example.com`) scattered across 7 Warsaw districts.

**Why:** Testing and demo data. Provides realistic map density for development.

**Config:**
- District polygons: `apps/api/scripts/warszawa-dzielnice.geojson`
- Uniform scatter: `bun run api:scatter` (direct DB, no side-effects)
- API scatter: `bun run apps/api/scripts/scatter-locations.ts` (fires AI re-analysis + WS events)
- Targeted scatter: `bun --env-file=apps/api/.env.production run apps/api/scripts/scatter-targeted.ts <area>:<count>:<startIdx>` (`--list` for areas, `--dry-run` to preview)
- Default simulator location: `xcrun simctl location booted set 52.2010865,20.9618980` (ul. Altowa, Warszawa)

## Visibility Modes

| Mode | Visible on map | Can send waves | Can receive waves | Nearby queries include |
|---|---|---|---|---|
| `ninja` | No | No (server blocks with `hidden_cannot_ping`) | No | Excluded by `ne(visibilityMode, "ninja")` |
| `semi_open` | Yes | Yes | Yes | Included |
| `full_nomad` | Yes | Yes | Yes | Included |

Note: `semi_open` and `full_nomad` are functionally identical in the API. The difference is client-side: Full Nomad shows an "AI zacheca do kontaktu bezposredniego" prompt. The `doNotDisturb` flag is orthogonal --- it suppresses push notifications but the user remains visible and can be pinged.

## Impact Map

If you change this system, also check:

- **`apps/api/src/lib/grid.ts`** --- `GRID_SIZE`, `toGridCenter()`, `roundDistance()`
- **`apps/api/src/trpc/procedures/profiles.ts`** --- `updateLocation`, `getNearbyUsers`, `getNearbyUsersForMap`
- **`packages/shared/src/validators.ts`** --- `updateLocationSchema`, `getNearbyUsersSchema`, `getNearbyUsersForMapSchema`
- **`packages/shared/src/math.ts`** --- `cosineSimilarity()` (used in ranking)
- **`apps/api/src/services/queue.ts`** --- `enqueueProximityStatusMatching` (triggered by location update), `processAnalyzeUserPairs` (uses same bounding box pattern)
- **`apps/api/src/ws/redis-bridge.ts`** --- `nearbyChanged` event
- **`apps/api/src/config/rateLimits.ts`** --- `profiles.getNearby` rate limit
- **`apps/mobile/`** --- map rendering, bubble positioning, background location tracking frequency
- **`docs/architecture/status-matching.md`** --- proximity-triggered matching pipeline
- **`docs/architecture/waves-connections.md`** --- ninja mode blocks wave sending
- **`apps/api/scripts/`** --- scatter scripts for seed user locations
