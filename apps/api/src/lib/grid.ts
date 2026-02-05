/**
 * Grid-based privacy system for location data.
 * Instead of exposing exact coordinates, we snap locations to ~500m x 500m grid cells.
 */

// ~500m = 0.0045 degrees latitude (roughly, varies by location)
export const GRID_SIZE = 0.0045;

export interface GridPosition {
  gridLat: number;
  gridLng: number;
  gridId: string;
}

/**
 * Converts exact coordinates to the center of a grid cell.
 * This provides ~500m precision instead of exact location.
 */
export function toGridCenter(lat: number, lng: number): GridPosition {
  // Longitude grid size varies with latitude (earth is not flat)
  const lngGridSize = GRID_SIZE / Math.cos(lat * Math.PI / 180);

  const latIdx = Math.floor(lat / GRID_SIZE);
  const lngIdx = Math.floor(lng / lngGridSize);

  return {
    gridLat: (latIdx + 0.5) * GRID_SIZE,
    gridLng: (lngIdx + 0.5) * lngGridSize,
    gridId: `${latIdx}_${lngIdx}`,
  };
}

/**
 * Rounds distance to nearest 100m to prevent triangulation.
 * 347m -> 300m, 1523m -> 1500m
 */
export function roundDistance(meters: number): number {
  return Math.round(meters / 100) * 100;
}
