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
ALTER TABLE "conversation_participants" ADD COLUMN "role" varchar(10) DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD COLUMN "muted_until" timestamp;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD COLUMN "last_read_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "type" varchar(10) DEFAULT 'dm' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "name" varchar(100);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "invite_code" varchar(20);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "creator_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "max_members" integer DEFAULT 200;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "latitude" real;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "longitude" real;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "is_discoverable" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "discovery_radius_meters" integer DEFAULT 5000;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topics_conversation_idx" ON "topics" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "topics_sort_idx" ON "topics" USING btree ("conversation_id","is_pinned","sort_order");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_type_idx" ON "conversations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "conversations_invite_code_idx" ON "conversations" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "conversations_location_idx" ON "conversations" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "conversations_discoverable_idx" ON "conversations" USING btree ("is_discoverable");--> statement-breakpoint
CREATE INDEX "messages_topic_idx" ON "messages" USING btree ("topic_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_invite_code_unique" UNIQUE("invite_code");