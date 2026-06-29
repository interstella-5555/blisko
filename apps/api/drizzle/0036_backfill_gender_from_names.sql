-- 0036_backfill_gender_from_names — BLI-306
--
-- One-time best-effort backfill of the new gender column for pre-existing rows
-- (mostly demo/seed accounts). Polish first-name heuristic: a first name ending
-- in "a" is almost always female, minus a small exception list of male "-a"
-- names. Misfires are acceptable per product (legacy = demo data). Custom
-- migration because Drizzle can't express this heuristic; runs via the Railway
-- post-deploy hook only — never applied manually against production.

UPDATE "profiles"
SET "gender" = CASE
  WHEN lower(split_part(trim("display_name"), ' ', 1)) ~ 'a$'
   AND lower(split_part(trim("display_name"), ' ', 1)) NOT IN
       ('kuba', 'barnaba', 'bonawentura', 'kosma', 'jarema', 'sawa', 'dyzma', 'juda', 'aleksa')
  THEN 'female'
  ELSE 'male'
END
WHERE "gender" IS NULL;
