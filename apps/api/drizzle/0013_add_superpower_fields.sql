ALTER TABLE "profiles" ALTER COLUMN "visibility_mode" SET DEFAULT 'semi_open';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "do_not_disturb" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "superpower" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "superpower_tags" text[];--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "offer_type" text;