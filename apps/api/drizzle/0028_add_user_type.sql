-- 0028_add_user_type — user category enum
--
-- BLI-271. Adds enum-typed column distinguishing real users (regular),
-- chatbot seed users (demo), CI test fixtures (test), and Apple/Google store
-- reviewers (review). Drives the visibility partition in userIsVisibleTo()
-- and the cleanup-test-users cron filter (BLI-272). Replaces the prior
-- email-pattern detection. Backfill of existing users in the next migration
-- per migrations/one-concern.

ALTER TABLE "user" ADD COLUMN "type" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
CREATE INDEX "user_type_non_regular_idx" ON "user" USING btree ("type") WHERE "user"."type" <> 'regular';