-- 0027_add_user_suspension — admin account suspension
--
-- Adds a moderation-driven suspension state separate from soft-delete. A
-- suspended user cannot log in or reach any API surface; discovery hides them;
-- existing conversations preserve their history with a "Konto zawieszone"
-- indicator rendered client-side. No anonymization is scheduled — admin either
-- unsuspends (clears both columns) or soft-deletes via the existing flow. The
-- partial index keeps lookups on suspended users cheap while staying small on
-- the 99.9% active-user case. BLI-156.

ALTER TABLE "user" ADD COLUMN "suspended_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspend_reason" text;--> statement-breakpoint
CREATE INDEX "user_suspended_at_idx" ON "user" USING btree ("suspended_at") WHERE "user"."suspended_at" IS NOT NULL;