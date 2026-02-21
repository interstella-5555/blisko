/**
 * Scatter seed users across Warsaw districts via direct DB update.
 * Uses real district boundary polygons from warszawa-dzielnice.geojson.
 * Does NOT require the API to be running — connects to Postgres directly.
 *
 * Run from root: pnpm api:scatter
 */

const USER_COUNT = 250;
const GEOJSON_PATH = `${import.meta.dir}/warszawa-dzielnice.geojson`;

// Districts to scatter users across (change this list to control distribution)
const TARGET_DISTRICTS = [
  'Ochota',
  'Włochy',
  'Wola',
  'Śródmieście',
  'Mokotów',
  'Ursynów',
  'Bemowo',
];

// --- Point-in-polygon (ray casting) ---

type Ring = [number, number][]; // [lng, lat][]
type MultiPolygon = Ring[][][];

function pointInRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; // [lng, lat]
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

// --- Bounding box for faster rejection ---

interface BBox {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

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

function randomInBBox(bbox: BBox): { lat: number; lng: number } {
  return {
    lat: bbox.latMin + Math.random() * (bbox.latMax - bbox.latMin),
    lng: bbox.lngMin + Math.random() * (bbox.lngMax - bbox.lngMin),
  };
}

// --- District data ---

interface District {
  name: string;
  coords: MultiPolygon;
  bbox: BBox;
}

async function loadDistricts(targetNames: string[]): Promise<District[]> {
  const geo = await Bun.file(GEOJSON_PATH).json();
  const targetSet = new Set(targetNames);
  return geo.features
    .filter((f: any) => targetSet.has(f.properties.name))
    .map((f: any) => ({
      name: f.properties.name,
      coords: f.geometry.coordinates,
      bbox: computeBBox(f.geometry.coordinates),
    }));
}

/** Generate a random point guaranteed to be inside one of the target districts */
function randomPointInDistricts(districts: District[]): { lat: number; lng: number; district: string } {
  // Pick a random district (uniform)
  const d = districts[Math.floor(Math.random() * districts.length)];
  // Rejection sampling within its bounding box
  for (let attempt = 0; attempt < 1000; attempt++) {
    const pt = randomInBBox(d.bbox);
    if (pointInMultiPolygon(pt.lat, pt.lng, d.coords)) {
      return { ...pt, district: d.name };
    }
  }
  // Fallback: centroid of bbox (should never happen)
  return {
    lat: (d.bbox.latMin + d.bbox.latMax) / 2,
    lng: (d.bbox.lngMin + d.bbox.lngMax) / 2,
    district: d.name,
  };
}

// --- DB ---

async function loadDatabaseUrl(): Promise<string> {
  const dir = import.meta.dir + '/..';
  const mainEnv = await Bun.file(`${dir}/.env`).text().catch(() => '');
  const localEnv = await Bun.file(`${dir}/.env.local`).text().catch(() => '');
  const allEnv = mainEnv + '\n' + localEnv;
  const match = allEnv.match(/DATABASE_URL=(.+)/);
  if (!match) throw new Error('DATABASE_URL not found in apps/api/.env or .env.local');
  return match[1].trim();
}

async function main() {
  const districts = await loadDistricts(TARGET_DISTRICTS);
  console.log(`Loaded ${districts.length} district polygons: ${districts.map(d => d.name).join(', ')}`);

  const dbUrl = await loadDatabaseUrl();
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl);

  console.log(`Scattering ${USER_COUNT} seed users...`);

  const districtCounts: Record<string, number> = {};
  let updated = 0;

  for (let i = 0; i < USER_COUNT; i++) {
    const email = `user${i}@example.com`;
    const { lat, lng, district } = randomPointInDistricts(districts);
    districtCounts[district] = (districtCounts[district] || 0) + 1;

    const result = await sql`
      UPDATE profiles
      SET latitude = ${lat},
          longitude = ${lng},
          last_location_update = NOW(),
          updated_at = NOW()
      WHERE user_id IN (
        SELECT id FROM "user" WHERE email = ${email}
      )
    `;

    if (result.count > 0) updated++;
  }

  await sql.end();

  console.log(`\nDone! Updated ${updated} users.\n`);
  console.log('Dzielnica           | Kont');
  console.log('--------------------|------');
  const sorted = Object.entries(districtCounts).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sorted) {
    console.log(`${name.padEnd(20)}| ${count}`);
  }
}

main().catch(console.error);
