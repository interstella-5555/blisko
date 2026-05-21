import ms from "ms";

/**
 * Viewport debounce ↔ rate limit coupling (BLI-189).
 * 500ms debounce = max 2 req/s = 20 in 10s window.
 * If you change this, update NEARBY_RATE_LIMIT to match.
 */
export const VIEWPORT_DEBOUNCE_MS = ms("500ms");

/**
 * Rate limit budget for nearby endpoints (profiles.getNearby, profiles.getNearbyMap).
 * Coupled with VIEWPORT_DEBOUNCE_MS — at 500ms debounce, max 2 req/s fits 20 in 10s.
 */
export const NEARBY_RATE_LIMIT = { limit: 20, window: 10 } as const;

/** Grid cell size for location privacy (~500m ≈ 0.0045 degrees latitude). */
export const GRID_SIZE = 0.0045;

/** Page size for nearby user list queries. */
export const NEARBY_PAGE_SIZE = 20;

/**
 * Default radius (meters) used by all nearby queries when client doesn't pass `radiusMeters`.
 * Exposed via `app.getConfig` so mobile can change radius without a rebuild — bump this
 * value + redeploy API, and clients pick it up on next config refetch.
 */
export const NEARBY_DEFAULT_RADIUS_METERS = 5000;
