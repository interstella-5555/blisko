CREATE TABLE "status_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"matched_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"matched_via" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "current_status" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "status_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "status_embedding" real[];--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "status_set_at" timestamp;--> statement-breakpoint
ALTER TABLE "status_matches" ADD CONSTRAINT "status_matches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_matches" ADD CONSTRAINT "status_matches_matched_user_id_user_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;