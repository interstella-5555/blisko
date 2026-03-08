DROP INDEX "ca_pair_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "ca_pair_uniq" ON "connection_analyses" USING btree ("from_user_id","to_user_id");