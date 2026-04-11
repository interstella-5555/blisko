ALTER TABLE "connection_analyses" ADD COLUMN "tier" text;--> statement-breakpoint
UPDATE "connection_analyses" SET "tier" = CASE WHEN "short_snippet" IS NULL THEN 't2' ELSE 't3' END;--> statement-breakpoint
ALTER TABLE "connection_analyses" ALTER COLUMN "tier" SET NOT NULL;
