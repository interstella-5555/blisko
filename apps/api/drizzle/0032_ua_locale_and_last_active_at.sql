-- 0032_ua_locale_and_last_active_at — combined replacement for the previous
-- 0032 (uk → ua data rename) + 0033 (add last_active_at column).
--
-- Why combined: the previous 0032's journal `when` was hand-bumped into the
-- future, so the subsequently-generated 0033 had an earlier `when` and drizzle's
-- migrator (which filters by `created_at > lastApplied.created_at`) silently
-- skipped 0033 on Railway — "All migrations applied successfully" yet the
-- column never landed. Easiest cleanup: drop both, regenerate, ship as one.
--
-- The UPDATE statements below were carried over verbatim from the original
-- 0032 because drizzle-kit only diffs schema (not data) — without re-pasting
-- them here, a fresh DB clone or CI test DB would skip the uk → ua rename
-- entirely. Re-running these UPDATEs against production is a no-op because
-- rows with locale='uk' / content_locale='uk' have already been migrated.
--
-- We delete the existing 0032 row from `drizzle.__drizzle_migrations` on prod
-- so this combined migration runs cleanly on the next Railway deploy. BLI-287.

UPDATE "profiles" SET "locale" = 'ua' WHERE "locale" = 'uk';--> statement-breakpoint
UPDATE "profiles" SET "content_locale" = 'ua' WHERE "content_locale" = 'uk';--> statement-breakpoint
UPDATE "profile_translations" SET "locale" = 'ua' WHERE "locale" = 'uk';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_active_at" timestamp;
