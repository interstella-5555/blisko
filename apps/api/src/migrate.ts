import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";

try {
  console.log("[migrate] Starting migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] All migrations applied successfully");
  process.exit(0);
} catch (err) {
  console.error("[migrate] Migration failed:", err);
  process.exit(1);
}
