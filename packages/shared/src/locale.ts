import { z } from "zod";

export const LOCALE_CODES = ["pl", "uk"] as const;
export type LocaleCode = (typeof LOCALE_CODES)[number];

export const localeCodeSchema = z.enum(LOCALE_CODES);

const UA_DEFAULT_LANGUAGE_CODES = ["uk", "ru", "be"] as const;

export function detectLocaleFromLanguageCode(languageCode: string | null | undefined): LocaleCode {
  if (!languageCode) return "pl";
  return (UA_DEFAULT_LANGUAGE_CODES as readonly string[]).includes(languageCode) ? "uk" : "pl";
}
