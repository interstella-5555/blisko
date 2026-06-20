import { readFileSync } from "node:fs";

/**
 * Warsaw district (dzielnica) lookup from a point.
 *
 * Powers the "Połączeni [data] · [dzielnica]" first-contact memory (v4 §10,
 * BLI-296). At wave-accept time we resolve the grid-centre coordinate (the same
 * ~500m privacy cell used everywhere else) to a Warsaw district so the chat can
 * show *where* two people met without ever exposing exact coordinates.
 *
 * The polygons come from the same `warszawa-dzielnice.geojson` the seed/scatter
 * scripts use, so districts stay consistent across the app. The "Warszawa"
 * feature is the whole-city outline — it would match every point, so it is
 * skipped; only the 18 real districts are kept.
 */

type Ring = [number, number][];

interface DistrictPolygon {
  name: string;
  // GeoJSON MultiPolygon coordinates: polygon[] → ring[] → [lng, lat][]
  coords: number[][][][];
  bbox: { latMin: number; latMax: number; lngMin: number; lngMax: number };
}

interface GeoFeature {
  properties: { name: string };
  geometry: { coordinates: number[][][][] };
}

const GEOJSON_PATH = `${import.meta.dir}/../../scripts/warszawa-dzielnice.geojson`;

function computeBBox(coords: number[][][][]): DistrictPolygon["bbox"] {
  let latMin = Infinity;
  let latMax = -Infinity;
  let lngMin = Infinity;
  let lngMax = -Infinity;
  for (const polygon of coords) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        if (lat < latMin) latMin = lat;
        if (lat > latMax) latMax = lat;
        if (lng < lngMin) lngMin = lng;
        if (lng > lngMax) lngMax = lng;
      }
    }
  }
  return { latMin, latMax, lngMin, lngMax };
}

// Loaded once at module init. The file is ~600KB and parsing is cheap; doing it
// lazily on first lookup would just move the cost to the first accept.
const districts: DistrictPolygon[] = (() => {
  try {
    const geo = JSON.parse(readFileSync(GEOJSON_PATH, "utf8")) as { features: GeoFeature[] };
    return geo.features
      .filter((f) => f.properties.name !== "Warszawa")
      .map((f) => ({
        name: f.properties.name,
        coords: f.geometry.coordinates,
        bbox: computeBBox(f.geometry.coordinates),
      }));
  } catch {
    // Missing/corrupt geojson must never break wave acceptance — district is a
    // cosmetic enrichment. Fall back to "no district" everywhere.
    return [];
  }
})();

// Ray-casting point-in-polygon. Ring coordinates are [lng, lat]; `xi`/`xj` are
// longitudes, `yi`/`yj` latitudes. Same algorithm as the scatter scripts.
function pointInRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Resolve a coordinate to its Warsaw district name, or `null` if the point
 * falls outside every district (e.g. a user outside Warsaw) or the geojson
 * failed to load.
 */
export function districtForPoint(lat: number, lng: number): string | null {
  for (const d of districts) {
    if (lat < d.bbox.latMin || lat > d.bbox.latMax || lng < d.bbox.lngMin || lng > d.bbox.lngMax) {
      continue;
    }
    for (const polygon of d.coords) {
      for (const ring of polygon) {
        if (pointInRing(lat, lng, ring as Ring)) return d.name;
      }
    }
  }
  return null;
}
