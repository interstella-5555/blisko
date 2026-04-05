-- Custom migration: offerType from text to text[]
-- Column is never populated, so no data to migrate.
-- Changing type to support multi-select offer types in onboarding.
ALTER TABLE "profiles" ALTER COLUMN "offer_type" TYPE text[] USING CASE WHEN "offer_type" IS NOT NULL THEN ARRAY["offer_type"] ELSE NULL END;
