CREATE TABLE "metrics"."ai_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"queue_name" text NOT NULL,
	"job_name" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"estimated_cost_usd" numeric(12, 6) NOT NULL,
	"user_id" text,
	"target_user_id" text,
	"duration_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE INDEX "idx_ai_calls_timestamp" ON "metrics"."ai_calls" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_calls_job_ts" ON "metrics"."ai_calls" USING btree ("job_name","timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_calls_user_ts" ON "metrics"."ai_calls" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_calls_model_ts" ON "metrics"."ai_calls" USING btree ("model","timestamp");