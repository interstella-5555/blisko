-- 0025_add_ai_call_payloads — full prompt/completion logging for debug
--
-- metrics.ai_calls already captures metadata (tokens, cost, duration, model).
-- When the chatbot started responding identically after the gpt-5-mini migration
-- we had no way to reconstruct what actually went to the model. These two nullable
-- jsonb columns hold the raw SDK input (system/prompt/messages/temperature/...) and
-- output (text/object/embed meta). 24h retention — a new `prune-ai-payloads`
-- maintenance job nulls these fields hourly; the surrounding metric row stays 7d so
-- the admin cost dashboard keeps working. BLI-239.

ALTER TABLE "metrics"."ai_calls" ADD COLUMN "input_jsonb" jsonb;--> statement-breakpoint
ALTER TABLE "metrics"."ai_calls" ADD COLUMN "output_jsonb" jsonb;
