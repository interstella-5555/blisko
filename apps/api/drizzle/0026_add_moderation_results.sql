-- 0026_add_moderation_results — image moderation audit trail (BLI-268)
--
-- Every flagged upload writes a row here so admins can review or audit later.
-- CSAM hits (sexual/minors) get blocked synchronously and store only metadata
-- (no uploadKey, no bytes in S3 — legal requirement). All other flags allow
-- the upload but queue the row for manual review via the admin panel (BLI-269).
-- user_id is nullable with ON DELETE SET NULL so account anonymization clears
-- the PII link but preserves the audit row, same pattern as `blocks`.

CREATE TABLE "moderation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"upload_key" text,
	"mime_type" text NOT NULL,
	"status" text NOT NULL,
	"flagged_categories" text[] NOT NULL,
	"category_scores" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" text,
	"review_decision" text,
	"review_notes" text
);
--> statement-breakpoint
ALTER TABLE "moderation_results" ADD CONSTRAINT "moderation_results_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_results_status_created_idx" ON "moderation_results" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "moderation_results_user_idx" ON "moderation_results" USING btree ("user_id");