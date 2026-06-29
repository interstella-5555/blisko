import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";

// Railway PR-preview environments (named like "blisko-pr-257") get a brand-new,
// empty database. Our migration chain CANNOT bootstrap one from zero: 0000_baseline
// is a no-op because the original tables (user, profiles, conversations, …) were
// created via `db:push` before we adopted migrations, so the first migration that
// alters a pre-baseline table fails on an empty DB. For these throwaway envs we
// build the schema directly from schema.ts with `drizzle-kit push` instead — it
// reflects the branch's schema exactly, which is what a preview wants.
//
// Production (RAILWAY_ENVIRONMENT_NAME === "production") and local dev (unset)
// ALWAYS take the normal migration path — this branch can never run against them.
const envName = process.env.RAILWAY_ENVIRONMENT_NAME;
const isPrPreview = !!envName && /-pr-\d+$/.test(envName);

try {
  if (isPrPreview) {
    console.log(`[migrate] PR preview env "${envName}" — building schema from schema.ts via drizzle-kit push`);
    const proc = Bun.spawnSync(["bunx", "drizzle-kit", "push", "--force"], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (proc.exitCode !== 0) {
      console.error(`[migrate] drizzle-kit push failed (exit ${proc.exitCode})`);
      process.exit(1);
    }
    console.log("[migrate] Schema pushed successfully");
    process.exit(0);
  }

  console.log("[migrate] Starting migrations...");
  // The runtime client is `postgres-js`, but the migrator is `node-postgres`-based
  // because `drizzle-orm/postgres-js/migrator` has Bun compat issues
  // (see infrastructure.md → Post-Deploy Migration). Both drivers send the same
  // SQL to Postgres, so the call works at runtime; the type system can't see that.
  // @ts-expect-error — driver mismatch is intentional, runtime-equivalent
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] All migrations applied successfully");
  process.exit(0);
} catch (err) {
  console.error("[migrate] Migration failed:", err);
  process.exit(1);
}
