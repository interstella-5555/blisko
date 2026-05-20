import { LOCALE_CODES, type LocaleCode } from "@repo/shared";
import plMessages from "../locales/pl.json";
import ukMessages from "../locales/uk.json";

// Tiny translation helper for backend templates (push notifications,
// emails). The backend is not a React app — Lingui's macros would be
// overkill — so we keep the surface to a single `t(key, locale, params)`
// function with flat JSON catalogs.
//
// `key` uses dot notation (`push.wave.new.body`); `locale` is `"pl"` /
// `"uk"`; `params` substitutes `{placeholder}` tokens in the template.
// Missing key → returns the key itself so the bug surfaces visibly
// instead of sending an empty string. Missing locale or empty translation
// → falls back to PL.
//
// Catalogs are kept in `apps/api/src/locales/{pl,uk}.json` and edited
// manually. With <30 backend strings total we don't need the
// extract/translate pipeline that mobile uses. BLI-281 / BLI-282.

const CATALOGS: Record<LocaleCode, Record<string, string>> = {
  pl: plMessages,
  uk: ukMessages,
};

const SUPPORTED_LOCALES = new Set<string>(LOCALE_CODES);

function resolveLocale(locale: string | null | undefined): LocaleCode {
  return locale && SUPPORTED_LOCALES.has(locale) ? (locale as LocaleCode) : "pl";
}

export function t(key: string, locale: string | null | undefined, params?: Record<string, string | number>): string {
  const resolved = resolveLocale(locale);
  const template = CATALOGS[resolved][key] || CATALOGS.pl[key] || key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match: string, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}
