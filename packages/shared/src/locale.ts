import { z } from "zod";

// Internal locale codes. We use ISO 3166-1 country codes ("ua") internally
// rather than ISO 639-1 language codes ("uk") because "uk" reads like
// "United Kingdom" in the codebase and creates constant confusion.
// The OS — via expo-localization — still returns the ISO 639-1 code "uk"
// for Ukrainian; the mapping from OS code to our internal code happens in
// `detectLocaleFromLanguageCode` below. PO file headers in
// `apps/mobile/src/locales/ua/messages.po` keep `Language: uk` because
// that's a Lingui/gettext convention (ISO 639-1).
export const LOCALE_CODES = ["pl", "ua"] as const;
export type LocaleCode = (typeof LOCALE_CODES)[number];

export const localeCodeSchema = z.enum(LOCALE_CODES);

// OS-returned ISO 639-1 codes that should map to our "ua" locale. These are
// the codes expo-localization / Intl emits — NEVER rename these to "ua".
const UA_DEFAULT_LANGUAGE_CODES = ["uk", "ru", "be"] as const;

export function detectLocaleFromLanguageCode(languageCode: string | null | undefined): LocaleCode {
  if (!languageCode) return "pl";
  return (UA_DEFAULT_LANGUAGE_CODES as readonly string[]).includes(languageCode) ? "ua" : "pl";
}
