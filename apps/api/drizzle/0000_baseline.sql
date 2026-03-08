-- Baseline: schema already exists in database.
-- This migration is a no-op — all tables were created via db:push before
-- we adopted migration-based workflow (March 2026).
--
-- To recreate the full schema from scratch, run: npx drizzle-kit export --sql
SELECT 1;
