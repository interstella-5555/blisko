import { detectLocaleFromLanguageCode, type LocaleCode } from "@repo/shared";
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

const secureStoreAdapter: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface LocaleState {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
}

// Device-scoped UI language. The store is authoritative for what's
// displayed on this phone; `profiles.locale` in the DB is a one-way mirror
// that AppGate pushes on session restore so the server has a value for
// emails / push (see AppGate.tsx and docs/architecture/i18n.md).
//
// First-install detection runs at module load: `Localization.getLocales()`
// reads the OS language synchronously and the result is mapped (uk / ru /
// be → "uk", else "pl") into the store's initial `locale`. Persist then
// hydrates from SecureStore — if anything is saved, it replaces the initial
// value; if not, the OS-derived initial sticks and is persisted on the next
// setLocale call. This means once a user has been through the app, their
// locale is fixed in SecureStore and OS-language changes no longer affect
// the UI — they have to tap the toggle. BLI-277 / BLI-280.
const initialLocale: LocaleCode = detectLocaleFromLanguageCode(Localization.getLocales()[0]?.languageCode);

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: initialLocale,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "blisko_locale",
      storage: createJSONStorage(() => secureStoreAdapter),
    },
  ),
);
