-- 0035_add_gender_to_profiles — BLI-306
--
-- Binary gender ("female" | "male"), collected in onboarding Step 1. Nullable:
-- legacy accounts stay null and are filled best-effort by the following backfill
-- migration (0036) from name heuristics. Required only in the mobile UI, never
-- in the DB. Store-only for now (no display / filter / matching).

ALTER TABLE "profiles" ADD COLUMN "gender" text;