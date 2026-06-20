-- 0034_add_bio_essence — nearby-list subtitle source
--
-- BLI-304. The nearby people list now shows, per person: their active status if
-- they have one, otherwise a one-sentence AI "essence" of their bio (instead of
-- the old raw "Wspólne: [tagi]" interest line). bio_essence holds the canonical
-- (content_locale) version, regenerated on every bio change by the
-- generate-profile-ai pipeline; the other-locale version lives in
-- profile_translations (field "bio_essence"). Nullable — old profiles backfill
-- on next regen or via the one-off backfill script.

ALTER TABLE "profiles" ADD COLUMN "bio_essence" text;