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
    ua: "{senderName} — новий пінг!",
  },
  "push.wave.accepted.body": {
    pl: "{responderName} — ping przyjęty! Możecie teraz pisać.",
    ua: "{responderName} — пінг прийнято! Тепер можете писати.",
  },
  "push.message.unread.body": {
    pl: "{unreadCount} nowych wiadomości",
    ua: "{unreadCount} нових повідомлень",
  },
  "push.group.invite.body": {
    pl: "Nowe zaproszenie do grupy",
    ua: "Нове запрошення до групи",
  },
  "push.ambient.statusMatch.body": {
    pl: "Ktoś z pasującym profilem jest w pobliżu",
    ua: "Хтось із відповідним профілем поблизу",
  },

  // Email — shared (layout footer + greeting)
  "email.layout.footer": {
    pl: "Pozdrawiamy,<br>Zespół Blisko",
    ua: "З повагою,<br>Команда Blisko",
  },
  "email.greeting": {
    pl: "Cześć!",
    ua: "Привіт!",
  },

  // Email — sign-in OTP
  "email.signIn.subject": {
    pl: "{otp} - Twój kod do Blisko",
    ua: "{otp} - Твій код до Blisko",
  },
  "email.signIn.intro": {
    pl: "Kliknij żeby się zalogować:",
    ua: "Натисни, щоб увійти:",
  },
  "email.signIn.button": {
    pl: "Zaloguj się do Blisko",
    ua: "Увійти до Blisko",
  },
  "email.signIn.orEnterCode": {
    pl: "lub wpisz kod",
    ua: "або введи код",
  },
  "email.signIn.expiry": {
    pl: "Link i kod wygasną za 5 minut.",
    ua: "Посилання та код діють 5 хвилин.",
  },

  // Email — change-email OTP
  "email.changeEmail.subject": {
    pl: "{otp} - Zmiana adresu email w Blisko",
    ua: "{otp} - Зміна адреси email у Blisko",
  },
  "email.changeEmail.intro": {
    pl: "Kod weryfikacyjny do zmiany adresu email:",
    ua: "Код підтвердження зміни адреси email:",
  },
  "email.changeEmail.expiry": {
    pl: "Kod wygaśnie za 5 minut.",
    ua: "Код діє 5 хвилин.",
  },

  // Email — data export delayed
  "email.dataExportDelayed.subject": {
    pl: "Eksport danych z Blisko — opóźnienie",
    ua: "Експорт даних з Blisko — затримка",
  },
  "email.dataExportDelayed.body": {
    pl: "Eksport Twoich danych trwa dłużej niż zwykle. Nasz zespół został powiadomiony i dane zostaną wysłane jak najszybciej.",
    ua: "Експорт твоїх даних триває довше, ніж зазвичай. Наша команда повідомлена і дані буде надіслано якомога швидше.",
  },
  "email.dataExportDelayed.noAction": {
    pl: "Nie musisz nic robić — skontaktujemy się gdy eksport będzie gotowy.",
    ua: "Тобі нічого не потрібно робити — ми зв'яжемося, коли експорт буде готовий.",
  },

  // Email — data export ready
  "email.dataExportReady.subject": {
    pl: "Twoje dane z Blisko są gotowe do pobrania",
    ua: "Твої дані з Blisko готові до завантаження",
  },
  "email.dataExportReady.body": {
    pl: "Twoje dane są gotowe. Kliknij poniższy link, aby pobrać plik JSON z eksportem wszystkich Twoich danych z aplikacji Blisko.",
    ua: "Твої дані готові. Натисни на посилання нижче, щоб завантажити JSON-файл з експортом усіх твоїх даних з застосунку Blisko.",
  },
  "email.dataExportReady.button": {
    pl: "Pobierz dane",
    ua: "Завантажити дані",
  },
  "email.dataExportReady.linkExpiry": {
    pl: "Link jest ważny przez 7 dni. Po tym czasie możesz złożyć nowe żądanie w ustawieniach aplikacji.",
    ua: "Посилання діє 7 днів. Після цього можеш створити новий запит у налаштуваннях застосунку.",
  },
  "email.dataExportReady.ignore": {
    pl: "Jeśli nie prosiłeś/aś o eksport danych, zignoruj tę wiadomość.",
    ua: "Якщо ти не запитував(-ла) експорт даних, проігноруй це повідомлення.",
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
