/**
 * Scatter seed users across Warsaw districts via API calls.
 * Uses real district boundary polygons from warszawa-dzielnice.geojson.
 * Goes through the API so side-effects fire (AI re-analysis, WS broadcasts).
 *
 * Run: cd apps/api && bun run scripts/scatter-locations.ts
 */

const API = process.env.API_URL || 'http://localhost:3000';
const USER_COUNT = 250;
const BATCH_SIZE = 10;
const GEOJSON_PATH = `${import.meta.dir}/warszawa-dzielnice.geojson`;

const TARGET_DISTRICTS = [
  'Ochota', 'Włochy', 'Wola', 'Śródmieście', 'Mokotów', 'Ursynów', 'Bemowo',
];

// --- Point-in-polygon (ray casting) ---

type Ring = [number, number][];
type MultiPolygon = Ring[][][];

function pointInRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInMultiPolygon(lat: number, lng: number, mp: MultiPolygon): boolean {
  for (const polygon of mp) {
    for (const ring of polygon) {
      if (pointInRing(lat, lng, ring)) return true;
    }
  }
  return false;
}

interface BBox { latMin: number; latMax: number; lngMin: number; lngMax: number }

function computeBBox(mp: MultiPolygon): BBox {
  let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
  for (const polygon of mp) {
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

interface District { name: string; coords: MultiPolygon; bbox: BBox }

async function loadDistricts(): Promise<District[]> {
  const geo = await Bun.file(GEOJSON_PATH).json();
  const targetSet = new Set(TARGET_DISTRICTS);
  return geo.features
    .filter((f: any) => targetSet.has(f.properties.name))
    .map((f: any) => ({
      name: f.properties.name,
      coords: f.geometry.coordinates,
      bbox: computeBBox(f.geometry.coordinates),
    }));
}

function randomPointInDistricts(districts: District[]): { lat: number; lng: number } {
  const d = districts[Math.floor(Math.random() * districts.length)];
  for (let attempt = 0; attempt < 1000; attempt++) {
    const lat = d.bbox.latMin + Math.random() * (d.bbox.latMax - d.bbox.latMin);
    const lng = d.bbox.lngMin + Math.random() * (d.bbox.lngMax - d.bbox.lngMin);
    if (pointInMultiPolygon(lat, lng, d.coords)) return { lat, lng };
  }
  return { lat: (d.bbox.latMin + d.bbox.latMax) / 2, lng: (d.bbox.lngMin + d.bbox.lngMax) / 2 };
}

// --- API calls ---

async function autoLogin(email: string): Promise<string> {
  const res = await fetch(`${API}/dev/auto-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`auto-login failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function updateLocation(token: string, latitude: number, longitude: number) {
  const res = await fetch(`${API}/trpc/profiles.updateLocation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ latitude, longitude, skipAnalysis: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`update location failed: ${res.status} ${text}`);
  }
}

async function main() {
  const districts = await loadDistricts();
  console.log(`Loaded ${districts.length} district polygons: ${districts.map(d => d.name).join(', ')}`);
  console.log(`Scattering ${USER_COUNT} users via API...`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < USER_COUNT; i += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, USER_COUNT - i) }, (_, j) => i + j);

    await Promise.all(
      batch.map(async (idx) => {
        const email = `user${idx}@example.com`;
        try {
          const token = await autoLogin(email);
          const { lat, lng } = randomPointInDistricts(districts);
          await updateLocation(token, lat, lng);
          updated++;
          if (updated % 25 === 0) console.log(`  ${updated}/${USER_COUNT}`);
        } catch (err) {
          failed++;
          console.error(`Failed ${email}:`, err);
        }
      })
    );
  }

  console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`);
}

main().catch(console.error);
