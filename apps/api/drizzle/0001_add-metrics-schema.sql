CREATE SCHEMA IF NOT EXISTS "metrics";
--> statement-breakpoint
CREATE TABLE "metrics"."request_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"request_id" text NOT NULL,
	"method" text NOT NULL,
	"endpoint" text NOT NULL,
	"user_id" text,
	"duration_ms" integer NOT NULL,
	"status_code" smallint NOT NULL,
	"app_version" text,
	"platform" text,
	"auth_provider" text,
	"session_id" text,
	"ip_hash" text,
	"user_agent" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "metrics"."slo_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text,
	"metric_type" text NOT NULL,
	"threshold_ms" integer,
	"threshold_pct" numeric,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_re_timestamp" ON "metrics"."request_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_re_endpoint_ts" ON "metrics"."request_events" USING btree ("endpoint","timestamp");--> statement-breakpoint
CREATE INDEX "idx_re_user_ts" ON "metrics"."request_events" USING btree ("user_id","timestamp");