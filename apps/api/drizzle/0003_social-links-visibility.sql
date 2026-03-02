ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "social_links" jsonb;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "visibility_mode" text DEFAULT 'visible' NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_hidden') THEN
    UPDATE "profiles" SET "visibility_mode" = CASE WHEN "is_hidden" = true THEN 'hidden' ELSE 'visible' END;
  END IF;
END $$;

ALTER TABLE "profiles" DROP COLUMN IF EXISTS "is_hidden";
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "social_profile";
