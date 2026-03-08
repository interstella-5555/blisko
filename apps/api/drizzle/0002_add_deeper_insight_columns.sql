ALTER TABLE "metrics"."request_events" ADD COLUMN "target_user_id" text;--> statement-breakpoint
ALTER TABLE "metrics"."request_events" ADD COLUMN "target_group_id" text;--> statement-breakpoint
ALTER TABLE "metrics"."request_events" ADD COLUMN "db_query_count" integer;--> statement-breakpoint
ALTER TABLE "metrics"."request_events" ADD COLUMN "db_duration_ms" integer;--> statement-breakpoint
CREATE INDEX "idx_re_target_user_ts" ON "metrics"."request_events" USING btree ("target_user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_re_target_group" ON "metrics"."request_events" USING btree ("target_group_id");