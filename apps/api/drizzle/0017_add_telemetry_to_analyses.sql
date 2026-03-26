ALTER TABLE "connection_analyses" ADD COLUMN "triggered_by" varchar(50);--> statement-breakpoint
ALTER TABLE "connection_analyses" ADD COLUMN "job_id" varchar(100);--> statement-breakpoint
ALTER TABLE "connection_analyses" ADD COLUMN "enqueued_at" timestamp;--> statement-breakpoint
ALTER TABLE "connection_analyses" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "connection_analyses" ADD COLUMN "process_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "connection_analyses" ADD COLUMN "wait_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "connection_analyses" ADD COLUMN "attempts_made" integer;