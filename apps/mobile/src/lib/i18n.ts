import { i18n } from "@lingui/core";
import { LOCALE_CODES, type LocaleCode } from "@repo/shared";
import { messages as plMessages } from "@/locales/pl/messages.po";
import { messages as ukMessages } from "@/locales/uk/messages.po";
import { useLocaleStore } from "@/stores/localeStore";

// Bundle both PO files at app start. They're loaded directly by Metro via
// @lingui/metro-transformer (see metro.config.js) — no separate compile step.
// Total payload is small (≤ a few KB per locale even at full migration), so
// there's no incentive to code-split per language.
const CATALOGS: Record<LocaleCode, Record<string, string>> = {
  pl: plMessages,
  uk: ukMessages,
};

for (const locale of LOCALE_CODES) {
  i18n.load(locale, CATALOGS[locale]);
}

// Activate the locale the user already chose on this device. localeStore is
// hydrated synchronously from SecureStore on import (zustand `persist`), so
// reading getState() at module load time gives the right initial value. The
// `useLocaleStore.subscribe` listener wired up in app/_layout.tsx swaps the
// active locale whenever the toggle moves.
i18n.activate(useLocaleStore.getState().locale);

export { i18n };
