/**
 * One-off: find the 10 most clustered seed bots (smallest distance to nearest
 * other bot) and move them to Gołaszew (05-850). Direct DB, no side-effects.
 *
 * Usage:
 *   bun --env-file=apps/api/.env.production run dev-cli:move-clustered-to-golaszew
 *   bun --env-file=apps/api/.env.production run dev-cli:move-clustered-to-golaszew -- --dry-run
 */

import { createDb, schema } from "@repo/db";
import { and, eq, isNotNull, isNull, like } from "drizzle-orm";

const GOLASZEW = { latMin: 52.201, latMax: 52.215, lngMin: 20.738, lngMax: 20.76 };
const PICK_COUNT = 10;

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function randomInBBox(b: typeof GOLASZEW) {
  return {
    lat: b.latMin + Math.random() * (b.latMax - b.latMin),
    lng: b.lngMin + Math.random() * (b.lngMax - b.lngMin),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set. Use: bun --env-file=apps/api/.env.production run ...");
  }
  const db = createDb(url);

  const rows = await db
    .select({
      email: schema.user.email,
      userId: schema.user.id,
      lat: schema.profiles.latitude,
      lng: schema.profiles.longitude,
    })
    .from(schema.user)
    .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.user.id))
    .where(
      and(
        like(schema.user.email, "user%@example.com"),
        isNull(schema.user.deletedAt),
        isNotNull(schema.profiles.latitude),
        isNotNull(schema.profiles.longitude),
      ),
    );

  console.log(`Fetched ${rows.length} seed bots with location.`);

  const points = rows.map((r) => ({
    email: r.email,
    userId: r.userId,
    lat: r.lat as number,
    lng: r.lng as number,
  }));

  const withNN = points.map((r) => {
    let nn = Number.POSITIVE_INFINITY;
    let nnEmail = "";
    for (const o of points) {
      if (o.userId === r.userId) continue;
      const d = haversineMeters(r.lat, r.lng, o.lat, o.lng);
      if (d < nn) {
        nn = d;
        nnEmail = o.email;
      }
    }
    return { ...r, nn, nnEmail };
  });

  withNN.sort((a, b) => a.nn - b.nn);
  const picked = withNN.slice(0, PICK_COUNT);

  console.log(`\nTop ${PICK_COUNT} most-clustered bots (smallest NN distance):`);
  for (const p of picked) {
    console.log(
      `  ${p.email.padEnd(26)} @ ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}  ` +
        `NN=${p.nn.toFixed(1)}m (→ ${p.nnEmail})`,
    );
  }

  if (dryRun) {
    console.log("\nDRY RUN — no DB changes.");
    process.exit(0);
  }

  console.log(`\nMoving ${picked.length} bots to Gołaszew...`);
  let updated = 0;
  for (const p of picked) {
    const { lat, lng } = randomInBBox(GOLASZEW);
    const result = await db
      .update(schema.profiles)
      .set({ latitude: lat, longitude: lng, lastLocationUpdate: new Date(), updatedAt: new Date() })
      .where(eq(schema.profiles.userId, p.userId))
      .returning({ userId: schema.profiles.userId });
    if (result.length > 0) {
      updated++;
      console.log(`  ${p.email.padEnd(26)} → ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
  }

  console.log(`\nDone! ${updated}/${picked.length} moved to Gołaszew.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
