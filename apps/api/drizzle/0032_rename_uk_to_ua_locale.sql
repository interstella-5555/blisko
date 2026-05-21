-- 0032_rename_uk_to_ua_locale — internal locale code rename
--
-- We previously stored Ukrainian as the ISO 639-1 code "uk" everywhere
-- (profiles.locale, profiles.content_locale, profile_translations.locale).
-- "uk" constantly reads like "United Kingdom" inside the codebase, so we
-- switch the internal code to the ISO 3166-1 country code "ua". The 2-char
-- varchar columns stay the same — only the values change. The OS-returned
-- code from expo-localization is still "uk" (ISO 639-1) and gets mapped to
-- "ua" inside `detectLocaleFromLanguageCode` in @repo/shared. PO files keep
-- the gettext `Language: uk` header. BLI-279 follow-up.

UPDATE "profiles" SET "locale" = 'ua' WHERE "locale" = 'uk';--> statement-breakpoint
UPDATE "profiles" SET "content_locale" = 'ua' WHERE "content_locale" = 'uk';--> statement-breakpoint
UPDATE "profile_translations" SET "locale" = 'ua' WHERE "locale" = 'uk';
