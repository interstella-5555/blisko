/**
 * Scatter seed users to specific areas defined in a JSON config file.
 * Direct DB update — no API needed, no side-effects.
 *
 * Usage:
 *   bun --env-file=apps/api/.env.production run apps/api/scripts/scatter-targeted.ts \
 *     <area>:<count>:<startIdx> [<area>:<count>:<startIdx> ...]
 *
 * Examples:
 *   # 30 users (user200–user229) to Bemowo, 15 (user230–user244) to Gołaszew
 *   bun --env-file=apps/api/.env.production run apps/api/scripts/scatter-targeted.ts \
 *     bemowo:30:200 golaszew:15:230
 *
 *   # 10 users (user0–user9) to Śródmieście
 *   bun --env-file=apps/api/.env.production run apps/api/scripts/scatter-targeted.ts \
 *     srodmiescie:10:0
 *
 * Config: scatter-areas.json (same directory). Three area types:
 *   - geojson-ref: references a feature from warszawa-dzielnice.geojson by name
 *   - polygon:     inline GeoJSON polygon coordinates [[lng, lat], ...]
 *   - bbox:        simple bounding box { latMin, latMax, lngMin, lngMax }
 *
 * Options:
 *   --config <path>   Custom config file (default: scatter-areas.json next to this script)
 *   --dry-run         Show what would happen without updating the DB
 *   --list            List available areas from config and exit
 */

const GEOJSON_PATH = `${import.meta.dir}/warszawa-dzielnice.geojson`;
const DEFAULT_CONFIG_PATH = `${import.meta.dir}/scatter-areas.json`;

// --- Point-in-polygon (ray casting) ---

type Ring = [number, number][]; // [lng, lat][]
type MultiPolygon = Ring[][][];

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

function pointInMultiPolygon(lat: number, lng: number, mp: MultiPolygon): boolean {
  for (const polygon of mp) {
    for (const ring of polygon) {
      if (pointInRing(lat, lng, ring)) return true;
    }
  }
  return false;
}

// --- Bounding box ---

interface BBox {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

function computeBBox(mp: MultiPolygon): BBox {
  let latMin = Infinity;
  let latMax = -Infinity;
  let lngMin = Infinity;
  let lngMax = -Infinity;
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

function randomPointInPolygon(coords: MultiPolygon, bbox: BBox): { lat: number; lng: number } {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const pt = randomInBBox(bbox);
    if (pointInMultiPolygon(pt.lat, pt.lng, coords)) return pt;
  }
  return { lat: (bbox.latMin + bbox.latMax) / 2, lng: (bbox.lngMin + bbox.lngMax) / 2 };
}

// --- Config types ---

interface GeoJsonRefArea {
  type: "geojson-ref";
  feature: string;
}

interface PolygonArea {
  type: "polygon";
  coordinates: number[][][]; // GeoJSON polygon rings: [[lng, lat], ...][]
}

interface BBoxArea {
  type: "bbox";
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

type AreaConfig = GeoJsonRefArea | PolygonArea | BBoxArea;

interface Config {
  areas: Record<string, AreaConfig>;
}

// --- Resolved area (ready for point generation) ---

interface ResolvedArea {
  name: string;
  coords: MultiPolygon | null; // null = bbox only
  bbox: BBox;
}

interface GeoFeature {
  properties: { name: string };
  geometry: { coordinates: MultiPolygon };
}

async function resolveArea(key: string, config: AreaConfig): Promise<ResolvedArea> {
  if (config.type === "bbox") {
    return {
      name: key,
      coords: null,
      bbox: { latMin: config.latMin, latMax: config.latMax, lngMin: config.lngMin, lngMax: config.lngMax },
    };
  }

  if (config.type === "polygon") {
    // Wrap as MultiPolygon: [[[ring1], [ring2], ...]]
    const mp: MultiPolygon = [config.coordinates as Ring[][]];
    return { name: key, coords: mp, bbox: computeBBox(mp) };
  }

  // geojson-ref — load from warszawa-dzielnice.geojson
  const geo = await Bun.file(GEOJSON_PATH).json();
  const feature = geo.features.find((f: GeoFeature) => f.properties.name === config.feature);
  if (!feature) {
    const available = geo.features.map((f: GeoFeature) => f.properties.name).join(", ");
    throw new Error(`Feature "${config.feature}" not found in geojson. Available: ${available}`);
  }
  const coords: MultiPolygon = feature.geometry.coordinates;
  return { name: key, coords, bbox: computeBBox(coords) };
}

function generatePoint(area: ResolvedArea): { lat: number; lng: number } {
  if (area.coords) return randomPointInPolygon(area.coords, area.bbox);
  return randomInBBox(area.bbox);
}

// --- CLI parsing ---

interface ScatterTarget {
  areaKey: string;
  count: number;
  startIdx: number;
}

function parseArgs(argv: string[]): {
  configPath: string;
  targets: ScatterTarget[];
  dryRun: boolean;
  listAreas: boolean;
} {
  let configPath = DEFAULT_CONFIG_PATH;
  let dryRun = false;
  let listAreas = false;
  const targets: ScatterTarget[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--config") {
      configPath = argv[++i];
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--list") {
      listAreas = true;
    } else if (arg.includes(":")) {
      const parts = arg.split(":");
      if (parts.length < 3) {
        console.error(`Invalid target "${arg}" — expected area:count:startIdx`);
        process.exit(1);
      }
      targets.push({
        areaKey: parts[0],
        count: Number.parseInt(parts[1], 10),
        startIdx: Number.parseInt(parts[2], 10),
      });
    }
  }

  return { configPath, targets, dryRun, listAreas };
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config: Config = await Bun.file(args.configPath).json();

  if (args.listAreas) {
    console.log("Available areas:");
    for (const [key, area] of Object.entries(config.areas)) {
      const detail =
        area.type === "geojson-ref"
          ? `geojson → ${area.feature}`
          : area.type === "polygon"
            ? `polygon (${area.coordinates[0]?.length ?? 0} points)`
            : `bbox (${area.latMin}–${area.latMax} N, ${area.lngMin}–${area.lngMax} E)`;
      console.log(`  ${key.padEnd(16)} ${detail}`);
    }
    return;
  }

  if (args.targets.length === 0) {
    console.error("No targets specified. Usage: scatter-targeted.ts <area>:<count>:<startIdx> ...");
    console.error("Use --list to see available areas.");
    process.exit(1);
  }

  // Validate targets
  for (const t of args.targets) {
    if (!config.areas[t.areaKey]) {
      console.error(`Unknown area "${t.areaKey}". Use --list to see available areas.`);
      process.exit(1);
    }
    if (Number.isNaN(t.count) || t.count <= 0) {
      console.error(`Invalid count for "${t.areaKey}".`);
      process.exit(1);
    }
  }

  // Check for overlapping user ranges
  const ranges = args.targets.map((t) => ({ key: t.areaKey, from: t.startIdx, to: t.startIdx + t.count - 1 }));
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (ranges[i].from <= ranges[j].to && ranges[j].from <= ranges[i].to) {
        console.error(
          `User ranges overlap: ${ranges[i].key} (${ranges[i].from}–${ranges[i].to}) and ${ranges[j].key} (${ranges[j].from}–${ranges[j].to})`,
        );
        process.exit(1);
      }
    }
  }

  // Resolve areas
  const resolved = new Map<string, ResolvedArea>();
  for (const t of args.targets) {
    if (!resolved.has(t.areaKey)) {
      resolved.set(t.areaKey, await resolveArea(t.areaKey, config.areas[t.areaKey]));
    }
  }

  if (args.dryRun) {
    console.log("DRY RUN — no DB changes.\n");
    for (const t of args.targets) {
      const area = resolved.get(t.areaKey)!;
      console.log(`${t.areaKey}: ${t.count} users (user${t.startIdx}–user${t.startIdx + t.count - 1})`);
      const sample = generatePoint(area);
      console.log(`  sample point: ${sample.lat.toFixed(6)}, ${sample.lng.toFixed(6)}`);
      console.log(
        `  bbox: ${area.bbox.latMin.toFixed(4)}–${area.bbox.latMax.toFixed(4)} N, ${area.bbox.lngMin.toFixed(4)}–${area.bbox.lngMax.toFixed(4)} E`,
      );
    }
    return;
  }

  // DB connection
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set — use: bun --env-file=apps/api/.env.production run ...");
    process.exit(1);
  }
  const { default: postgres } = await import("postgres");
  const sql = postgres(dbUrl);

  const totalCount = args.targets.reduce((s, t) => s + t.count, 0);
  console.log(`Scattering ${totalCount} users across ${args.targets.length} area(s)...\n`);

  let grandTotal = 0;

  for (const t of args.targets) {
    const area = resolved.get(t.areaKey)!;
    let updated = 0;

    for (let i = 0; i < t.count; i++) {
      const idx = t.startIdx + i;
      const email = `user${idx}@example.com`;
      const { lat, lng } = generatePoint(area);

      const result = await sql`
        UPDATE profiles
        SET latitude = ${lat}, longitude = ${lng},
            last_location_update = NOW(), updated_at = NOW()
        WHERE user_id IN (SELECT id FROM "user" WHERE email = ${email})
      `;
      if (result.count > 0) updated++;
    }

    console.log(
      `  ${t.areaKey.padEnd(16)} ${updated}/${t.count} updated (user${t.startIdx}–user${t.startIdx + t.count - 1})`,
    );
    grandTotal += updated;
  }

  await sql.end();
  console.log(`\nDone! ${grandTotal}/${totalCount} total.`);
}

main().catch(console.error);
