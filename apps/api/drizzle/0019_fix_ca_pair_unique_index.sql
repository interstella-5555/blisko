-- Custom migration: schema drift fix.
--
-- schema.ts defines ca_pair_uniq as a UNIQUE index, but production actually has
-- a non-unique ca_pair_idx on the same columns. The table pre-dates the
-- migration workflow (0000_baseline.sql is a no-op), so the original db:push
-- created a non-unique index that never got upgraded. Drizzle snapshots and
-- schema.ts both think ca_pair_uniq exists, so drizzle-kit cannot detect this
-- drift automatically -- hence the --custom migration.
--
-- Consequence without this fix: every quick-score and analyze-pair upsert fails
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" because ON CONFLICT (from_user_id, to_user_id) requires a
-- unique constraint or unique index. No writes to connection_analyses have
-- succeeded since ~2026-03-06 (BLI-181).
--
-- Verified 0 duplicate pairs exist in production before creating the unique
-- index, so CREATE UNIQUE INDEX will not fail on existing data.

DROP INDEX IF EXISTS "ca_pair_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "ca_pair_uniq" ON "connection_analyses" ("from_user_id","to_user_id");
