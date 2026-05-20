import type { LocaleCode } from "@repo/shared";
import { LOCALE_CODES } from "@repo/shared";

// Inline translation helper for backend templates (push notifications,
// emails). The backend runs on Bun without a babel build step, so Lingui's
// macros (used in mobile) would require adding pre-compilation just to share
// inline syntax — overkill for the ~15 strings the backend will ever ship.
//
// Pattern: pass every locale's translation at the callsite as a record.
// `pl` is required (source of truth); other locales are optional and fall
// back to `pl` when missing. When we add a third locale (EN, ES) we widen
// the record type — TypeScript then flags every callsite that needs the new
// translation; reviewer sees the language addition in one place per
// callsite, no dictionary file to hunt through.
//
// Usage:
//   t(recipient.locale, {
//     pl: `${name} — nowy ping!`,
//     uk: `${name} — новий пінг!`,
//   });

type Translations = { pl: string } & Partial<Record<LocaleCode, string>>;

const SUPPORTED_LOCALES = new Set<string>(LOCALE_CODES);

function resolveLocale(locale: string | null | undefined): LocaleCode {
  return locale && SUPPORTED_LOCALES.has(locale) ? (locale as LocaleCode) : "pl";
}

export function t(locale: string | null | undefined, translations: Translations): string {
  const resolved = resolveLocale(locale);
  return translations[resolved] || translations.pl;
}
