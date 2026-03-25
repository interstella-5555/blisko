ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "superpower" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "superpower_tags" text[];--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "offer_type" text;
