import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";

try {
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
