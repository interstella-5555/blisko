-- 0024_add_service_tier_to_ai_calls — track OpenAI service_tier + reasoning_effort per logged AI call
--
-- BLI-236. Async workers now send `service_tier: 'flex'` (50% off) on gpt-5-mini
-- while sync call-sites stay on Standard. `reasoning_effort` (minimal | medium) is
-- the other axis — reasoning models charge reasoning tokens as output, so knowing
-- which effort was used per call is needed to attribute cost + latency shifts.
-- Logging both lets the admin AI-costs dashboard break down spend post-migration.
-- `service_tier` defaults to 'standard' for historical rows; `reasoning_effort`
-- stays NULL when not applicable (gpt-4.1-mini, embeddings).

ALTER TABLE "metrics"."ai_calls" ADD COLUMN "service_tier" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "metrics"."ai_calls" ADD COLUMN "reasoning_effort" text;--> statement-breakpoint
CREATE INDEX "idx_ai_calls_tier_ts" ON "metrics"."ai_calls" USING btree ("service_tier","timestamp");
