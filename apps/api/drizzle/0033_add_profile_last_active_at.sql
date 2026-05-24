-- 0033_add_profile_last_active_at — last-active timestamp on profiles (BLI-287)
--
-- Bumped by the isAuthed tRPC middleware on every authenticated request,
-- throttled DB-side to at most once per minute per user. Drives the
-- "teraz / X temu" affordance on nearby and profile views. Decoupled
-- from `last_location_update` on purpose — a user sitting in one place
-- for 10 h is still "active" even though their location hasn't moved.

ALTER TABLE "profiles" ADD COLUMN "last_active_at" timestamp;
