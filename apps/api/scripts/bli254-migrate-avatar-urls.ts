/**
 * BLI-254 one-shot cutover: rewrite legacy presigned URLs in profiles.avatar_url
 * to the new s3:// scheme. Pre-BLI-254, POST /uploads stored presigned Tigris URLs
 * (with ?X-Amz-Expires=604800) directly in profiles.avatar_url. Those URLs have
 * long expired. After imgproxy goes live, the helper expects an s3:// source.
 *
 * Strategy:
 *   1. SELECT all avatar_url / portrait that look like our Tigris bucket.
 *   2. For each, HEAD the S3 key with our creds.
 *      - exists → rewrite to s3://bucket/key (strip querystring + hostname).
 *      - 404    → NULL the column (anonymization/cleanup already should have
 *                  covered this, but pre-migration state may have orphans).
 *   3. Print counts. Idempotent — safe to re-run.
 *
 * Run against production (it's the only DB we have):
 *   bun --env-file=apps/api/.env.production run apps/api/scripts/bli254-migrate-avatar-urls.ts
 *   bun --env-file=apps/api/.env.production run apps/api/scripts/bli254-migrate-avatar-urls.ts --dry-run
 */

import { S3Client } from "bun";
import postgres from "postgres";

const DRY_RUN = process.argv.includes("--dry-run");

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL not set (pass --env-file=apps/api/.env.production)");

const bucketName = process.env.BUCKET_NAME;
if (!bucketName) throw new Error("BUCKET_NAME not set");

const s3 = new S3Client({
  accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
  secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
  endpoint: process.env.BUCKET_ENDPOINT!,
  bucket: bucketName,
});

const sql = postgres(dbUrl);

// Match any HTTP(S) URL hosting the configured bucket. Covers both legacy Tigris
// endpoint variants and strips querystrings. `uploads/` is the prefix our /uploads
// handler has always used.
const legacyUrlPattern = new RegExp(`^https?://[^/]+/${bucketName}/uploads/`);
function extractLegacyKey(url: string): string | null {
  if (!legacyUrlPattern.test(url)) return null;
  const withoutQuery = url.split("?")[0];
  const match = withoutQuery.match(new RegExp(`^https?://[^/]+/${bucketName}/(.+)$`));
  return match?.[1] ?? null;
}

type Column = "avatar_url" | "portrait";

interface Row {
  user_id: string;
  avatar_url: string | null;
  portrait: string | null;
}

async function main() {
  console.log(`[migrate] ${DRY_RUN ? "DRY RUN — no writes" : "LIVE"}, bucket=${bucketName}`);

  const rows = (await sql`
    SELECT user_id, avatar_url, portrait
    FROM profiles
    WHERE avatar_url LIKE ${`%/${bucketName}/uploads/%`}
       OR portrait LIKE ${`%/${bucketName}/uploads/%`}
  `) as Row[];

  console.log(`[migrate] ${rows.length} profile rows to inspect`);

  const counts = { migrated: 0, nulled: 0, skipped: 0 };
  const nulled: Array<{ userId: string; column: Column; url: string }> = [];

  for (const row of rows) {
    for (const column of ["avatar_url", "portrait"] as const) {
      const url = row[column];
      if (!url) continue;

      const key = extractLegacyKey(url);
      if (!key) {
        counts.skipped += 1;
        continue;
      }

      const exists = await s3.exists(key);
      if (exists) {
        const newUrl = `s3://${bucketName}/${key}`;
        if (!DRY_RUN) {
          if (column === "avatar_url") {
            await sql`UPDATE profiles SET avatar_url = ${newUrl} WHERE user_id = ${row.user_id}`;
          } else {
            await sql`UPDATE profiles SET portrait = ${newUrl} WHERE user_id = ${row.user_id}`;
          }
        }
        counts.migrated += 1;
      } else {
        nulled.push({ userId: row.user_id, column, url });
        if (!DRY_RUN) {
          if (column === "avatar_url") {
            await sql`UPDATE profiles SET avatar_url = NULL WHERE user_id = ${row.user_id}`;
          } else {
            await sql`UPDATE profiles SET portrait = NULL WHERE user_id = ${row.user_id}`;
          }
        }
        counts.nulled += 1;
      }
    }
  }

  console.log(`[migrate] migrated=${counts.migrated} nulled=${counts.nulled} skipped=${counts.skipped}`);
  if (nulled.length) {
    console.log("[migrate] nulled entries (S3 object was missing):");
    for (const n of nulled) console.log(`  - userId=${n.userId} column=${n.column} url=${n.url}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
