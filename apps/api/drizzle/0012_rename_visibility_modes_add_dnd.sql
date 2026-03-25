-- Custom migration: rename visibility modes and add DND
-- Old: visible | matches_only | hidden
-- New: semi_open | full_nomad | ninja
-- Mapping: visible → semi_open, matches_only → semi_open, hidden → ninja

UPDATE "profiles" SET "visibility_mode" = 'semi_open' WHERE "visibility_mode" = 'visible';
UPDATE "profiles" SET "visibility_mode" = 'semi_open' WHERE "visibility_mode" = 'matches_only';
UPDATE "profiles" SET "visibility_mode" = 'ninja' WHERE "visibility_mode" = 'hidden';

ALTER TABLE "profiles" ALTER COLUMN "visibility_mode" SET DEFAULT 'semi_open';
ALTER TABLE "profiles" ADD COLUMN "do_not_disturb" boolean DEFAULT false NOT NULL;
