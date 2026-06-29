-- 0000_baseline — squashed schema baseline (BLI-308)
--
-- Squash of the original migrations 0000–0036 into one full-schema baseline so a
-- fresh database (e.g. a Railway PR-preview env) can be built from zero. The old
-- chain couldn't: the original 0000_baseline was a no-op because the core tables
-- were created via db:push before the migration workflow, so the first migration
-- that altered a pre-baseline table failed on an empty DB. Generated from
-- packages/db/src/schema.ts (the source of truth).
--
-- The journal entry for this migration is backdated (when=1772978970341, the
-- original baseline slot) so PRODUCTION — which already has every table and all
-- 0000–0036 recorded as applied — SKIPS it: drizzle runs a migration only when
-- last-applied.created_at < its `when`. Fresh databases have nothing applied, so
-- they run it and get the full current schema.
--
-- NOTE: drizzle-kit generate does not emit `CREATE SCHEMA "metrics"` for the
-- pgSchema-defined metrics schema (it lived in the old 0001_add_metrics_schema),
-- so it is added manually here — without it the metrics.* tables below fail on a
-- fresh DB with: schema "metrics" does not exist.
CREATE SCHEMA IF NOT EXISTS "metrics";
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"service_tier" text DEFAULT 'standard' NOT NULL,
	"reasoning_effort" text,
	"duration_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"input_jsonb" jsonb,
	"output_jsonb" jsonb
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"short_snippet" text,
	"long_description" text,
	"ai_match_score" real NOT NULL,
	"tier" text NOT NULL,
	"from_profile_hash" varchar(8) NOT NULL,
	"to_profile_hash" varchar(8) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(10) DEFAULT 'member' NOT NULL,
	"muted_until" timestamp,
	"last_read_at" timestamp,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"location_visible" boolean DEFAULT true NOT NULL,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(10) DEFAULT 'dm' NOT NULL,
	"name" varchar(100),
	"description" text,
	"avatar_url" text,
	"invite_code" varchar(20),
	"creator_id" text,
	"max_members" integer DEFAULT 200,
	"latitude" real,
	"longitude" real,
	"is_discoverable" boolean DEFAULT false,
	"discovery_radius_meters" integer DEFAULT 5000,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "feature_gates" (
	"feature" text PRIMARY KEY NOT NULL,
	"requires" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"emoji" varchar(8) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"topic_id" uuid,
	"content" text NOT NULL,
	"type" varchar(20) DEFAULT 'text' NOT NULL,
	"metadata" jsonb,
	"reply_to_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp,
	"deleted_at" timestamp,
	"seq" bigint NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "profile_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"field" varchar(32) NOT NULL,
	"locale" varchar(2) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"display_name" varchar(50) NOT NULL,
	"avatar_url" text,
	"bio" text NOT NULL,
	"looking_for" text NOT NULL,
	"social_links" jsonb,
	"locale" varchar(2),
	"content_locale" varchar(2) DEFAULT 'pl' NOT NULL,
	"visibility_mode" text DEFAULT 'semi_open' NOT NULL,
	"do_not_disturb" boolean DEFAULT false NOT NULL,
	"superpower" text,
	"superpower_tags" text[],
	"offer_type" text,
	"gender" text,
	"interests" text[],
	"embedding" real[],
	"portrait" text,
	"bio_essence" text,
	"portrait_shared_for_matching" boolean DEFAULT true NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"current_status" text,
	"status_expires_at" timestamp,
	"status_embedding" real[],
	"status_set_at" timestamp,
	"date_of_birth" timestamp,
	"status_categories" text[],
	"latitude" real,
	"longitude" real,
	"last_location_update" timestamp,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "profiling_qa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_number" integer NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"sufficient" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiling_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"based_on_session_id" uuid,
	"generated_bio" text,
	"generated_looking_for" text,
	"generated_portrait" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "push_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"collapse_id" varchar(100),
	"status" varchar(20) NOT NULL,
	"suppression_reason" varchar(30),
	"token_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
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
	"error_message" text,
	"target_user_id" text,
	"target_group_id" text,
	"db_query_count" integer,
	"db_duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
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
CREATE TABLE "status_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"matched_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"matched_via" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sm_user_matched_user_uniq" UNIQUE("user_id","matched_user_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"emoji" varchar(8),
	"creator_id" text,
	"is_pinned" boolean DEFAULT false,
	"is_closed" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"last_message_at" timestamp,
	"message_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"anonymized_at" timestamp,
	"suspended_at" timestamp,
	"suspend_reason" text,
	"type" text DEFAULT 'regular' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "waves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"sender_status_snapshot" text,
	"recipient_status_snapshot" text,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"pair_key" text GENERATED ALWAYS AS (md5(LEAST("from_user_id", "to_user_id") || ':' || GREATEST("from_user_id", "to_user_id"))) STORED NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_analyses" ADD CONSTRAINT "connection_analyses_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_analyses" ADD CONSTRAINT "connection_analyses_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_ratings" ADD CONSTRAINT "conversation_ratings_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_ratings" ADD CONSTRAINT "conversation_ratings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_results" ADD CONSTRAINT "moderation_results_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_translations" ADD CONSTRAINT "profile_translations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiling_qa" ADD CONSTRAINT "profiling_qa_session_id_profiling_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."profiling_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiling_sessions" ADD CONSTRAINT "profiling_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_matches" ADD CONSTRAINT "status_matches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_matches" ADD CONSTRAINT "status_matches_matched_user_id_user_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waves" ADD CONSTRAINT "waves_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waves" ADD CONSTRAINT "waves_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_calls_timestamp" ON "metrics"."ai_calls" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_calls_job_ts" ON "metrics"."ai_calls" USING btree ("job_name","timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_calls_user_ts" ON "metrics"."ai_calls" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_calls_model_ts" ON "metrics"."ai_calls" USING btree ("model","timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_calls_tier_ts" ON "metrics"."ai_calls" USING btree ("service_tier","timestamp");--> statement-breakpoint
CREATE INDEX "blocks_blocker_idx" ON "blocks" USING btree ("blocker_id");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ca_pair_uniq" ON "connection_analyses" USING btree ("from_user_id","to_user_id");--> statement-breakpoint
CREATE INDEX "ca_to_user_idx" ON "connection_analyses" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "cp_conversation_idx" ON "conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "cp_user_idx" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cr_conversation_idx" ON "conversation_ratings" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "cr_user_idx" ON "conversation_ratings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_type_idx" ON "conversations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "conversations_invite_code_idx" ON "conversations" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "conversations_location_idx" ON "conversations" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "conversations_discoverable_idx" ON "conversations" USING btree ("is_discoverable");--> statement-breakpoint
CREATE INDEX "reactions_message_idx" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "reactions_user_emoji_idx" ON "message_reactions" USING btree ("message_id","user_id","emoji");--> statement-breakpoint
CREATE INDEX "messages_conv_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_sender_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "messages_topic_idx" ON "messages" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conv_seq_uniq" ON "messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "moderation_results_status_created_idx" ON "moderation_results" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "moderation_results_user_idx" ON "moderation_results" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_translations_user_field_locale_uniq" ON "profile_translations" USING btree ("user_id","field","locale");--> statement-breakpoint
CREATE INDEX "profile_translations_user_id_idx" ON "profile_translations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profiles_user_id_idx" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profiles_location_idx" ON "profiles" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "pqa_session_id_idx" ON "profiling_qa" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ps_user_status_idx" ON "profiling_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "push_sends_user_idx" ON "push_sends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_sends_created_at_idx" ON "push_sends" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "push_sends_status_idx" ON "push_sends" USING btree ("status");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_re_timestamp" ON "metrics"."request_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_re_endpoint_ts" ON "metrics"."request_events" USING btree ("endpoint","timestamp");--> statement-breakpoint
CREATE INDEX "idx_re_user_ts" ON "metrics"."request_events" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_re_target_user_ts" ON "metrics"."request_events" USING btree ("target_user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_re_target_group" ON "metrics"."request_events" USING btree ("target_group_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sm_user_id_idx" ON "status_matches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sm_matched_user_id_idx" ON "status_matches" USING btree ("matched_user_id");--> statement-breakpoint
CREATE INDEX "topics_conversation_idx" ON "topics" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "topics_sort_idx" ON "topics" USING btree ("conversation_id","is_pinned","sort_order");--> statement-breakpoint
CREATE INDEX "user_suspended_at_idx" ON "user" USING btree ("suspended_at") WHERE "user"."suspended_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_type_non_regular_idx" ON "user" USING btree ("type") WHERE "user"."type" <> 'regular';--> statement-breakpoint
CREATE INDEX "waves_from_user_status_idx" ON "waves" USING btree ("from_user_id","status");--> statement-breakpoint
CREATE INDEX "waves_to_user_status_idx" ON "waves" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "waves_active_unique" ON "waves" USING btree ("pair_key") WHERE "waves"."status" in ('pending', 'accepted');