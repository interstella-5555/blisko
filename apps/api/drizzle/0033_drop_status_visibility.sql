-- 0033_drop_status_visibility — remove status public/private feature (BLI-289)
--
-- Status "na teraz" is now always public. The public/private choice is gone
-- from the UI (set-status selector) and the API (setStatusSchema.visibility,
-- isStatusPublic filtering, getMyStatusMatches reason redaction). Dropping the
-- column makes every existing status effectively public with no separate UPDATE:
-- the display/matching code no longer filters on visibility, so all active
-- statuses are shown. Old mobile clients still sending `visibility` are harmless
-- (Zod strips it); getById simply stops returning the field.

ALTER TABLE "profiles" DROP COLUMN "status_visibility";