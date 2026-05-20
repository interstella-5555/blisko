import { LOCALE_CODES, type LocaleCode } from "@repo/shared";

// Backend i18n helper for push notifications + emails. The backend runs on
// Bun without a babel build step, so Lingui's macros (used in mobile) would
// need pre-compilation just for ~15 strings — overkill. We keep all
// translations in a single typed TS object below: callers pass a stable key
// + locale + params; the helper looks up the row and substitutes
// `{placeholder}` tokens.
//
// Adding a new key: add a row to TRANSLATIONS with `pl` (required) and any
// other locales we've configured. Adding a new locale: widen LOCALE_CODES
// in `@repo/shared`, then TypeScript will accept partial entries (only `pl`
// is required at the type level) and the helper falls back to PL when a
// translation is missing — so partial coverage ships safely.

type Translations = { pl: string } & Partial<Record<LocaleCode, string>>;

const TRANSLATIONS = {
  "push.wave.new.body": {
    pl: "{senderName} — nowy ping!",
    uk: "{senderName} — новий пінг!",
  },
  "push.wave.accepted.body": {
    pl: "{responderName} — ping przyjęty! Możecie teraz pisać.",
    uk: "{responderName} — пінг прийнято! Тепер можете писати.",
  },
  "push.message.unread.body": {
    pl: "{unreadCount} nowych wiadomości",
    uk: "{unreadCount} нових повідомлень",
  },
  "push.group.invite.body": {
    pl: "Nowe zaproszenie do grupy",
    uk: "Нове запрошення до групи",
  },
  "push.ambient.statusMatch.body": {
    pl: "Ktoś z pasującym profilem jest w pobliżu",
    uk: "Хтось із відповідним профілем поблизу",
  },
} as const satisfies Record<string, Translations>;

export type BackendTranslationKey = keyof typeof TRANSLATIONS;

const SUPPORTED_LOCALES = new Set<string>(LOCALE_CODES);

function resolveLocale(locale: string | null | undefined): LocaleCode {
  return locale && SUPPORTED_LOCALES.has(locale) ? (locale as LocaleCode) : "pl";
}

export function t(
  key: BackendTranslationKey,
  locale: string | null | undefined,
  params?: Record<string, string | number>,
): string {
  const resolved = resolveLocale(locale);
  const entry = TRANSLATIONS[key] as Translations | undefined;
  // `key` is typed via BackendTranslationKey so a missing entry shouldn't be
  // possible — but defensive fall-through to the key name itself keeps push
  // handlers from crashing on a stray runtime cast.
  const template = entry?.[resolved] || entry?.pl || key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match: string, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}
