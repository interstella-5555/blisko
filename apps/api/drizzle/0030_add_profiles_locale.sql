-- 0030_add_profiles_locale — i18n preference per user
--
-- Adds optional locale column to profiles for cross-device language sync.
-- Null = user has not explicitly chosen, mobile falls back to device locale
-- from localeStore. Set = user explicitly chose (Settings → Konto, or any
-- future per-user override). Used by mobile to seed localeStore on session
-- start so a user logging in on a new device picks up their preference.
-- BLI-277.

ALTER TABLE "profiles" ADD COLUMN "locale" varchar(2);
