CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cr_conversation_idx" ON "conversation_ratings" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "cr_user_idx" ON "conversation_ratings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");