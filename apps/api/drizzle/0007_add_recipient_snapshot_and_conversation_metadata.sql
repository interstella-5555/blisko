ALTER TABLE "conversations" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "waves" ADD COLUMN "recipient_status_snapshot" text;