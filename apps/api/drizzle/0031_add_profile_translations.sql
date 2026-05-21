-- 0031_add_profile_translations — UGC translation cache for profiles
--
-- Adds on-demand translation infrastructure for user-facing profile fields
-- (bio, looking_for, portrait, current_status). Original text stays on
-- `profiles.*` with the new `content_locale` column flagging which language
-- it's in; per-(user, field, locale) translations live in `profile_translations`
-- — invariant: never a row where `locale = content_locale` for the same user.
-- Default `content_locale = 'pl'` matches the seed corpus and pre-i18n users;
-- it gets overwritten whenever the user edits UGC. Mobile picks display text
-- via `pickDisplayText` (locale match → original; mismatch → translation row
-- or "Przetłumacz" affordance). Matching pipeline (T1/T2/T3) always reads the
-- canonical PL via `getCanonicalText`, so translations don't affect AI scoring.
-- BLI-279.

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
ALTER TABLE "profiles" ADD COLUMN "content_locale" varchar(2) DEFAULT 'pl' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_translations" ADD CONSTRAINT "profile_translations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_translations_user_field_locale_uniq" ON "profile_translations" USING btree ("user_id","field","locale");--> statement-breakpoint
CREATE INDEX "profile_translations_user_id_idx" ON "profile_translations" USING btree ("user_id");