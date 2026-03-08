DROP INDEX "messages_conversation_idx";--> statement-breakpoint
DROP INDEX "messages_created_at_idx";--> statement-breakpoint
DROP INDEX "ps_user_id_idx";--> statement-breakpoint
DROP INDEX "waves_from_user_idx";--> statement-breakpoint
DROP INDEX "waves_to_user_idx";--> statement-breakpoint
DROP INDEX "waves_status_idx";--> statement-breakpoint
CREATE INDEX "messages_conv_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ps_user_status_idx" ON "profiling_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "sm_user_id_idx" ON "status_matches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sm_matched_user_id_idx" ON "status_matches" USING btree ("matched_user_id");--> statement-breakpoint
CREATE INDEX "waves_from_user_status_idx" ON "waves" USING btree ("from_user_id","status");--> statement-breakpoint
CREATE INDEX "waves_to_user_status_idx" ON "waves" USING btree ("to_user_id","status");