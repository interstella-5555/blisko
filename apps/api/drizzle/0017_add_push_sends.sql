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
CREATE INDEX "push_sends_user_idx" ON "push_sends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_sends_created_at_idx" ON "push_sends" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "push_sends_status_idx" ON "push_sends" USING btree ("status");