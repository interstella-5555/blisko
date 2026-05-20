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
  hasUserChosen: boolean;
  setLocale: (locale: LocaleCode, userInitiated?: boolean) => void;
}

// Device-scoped and authoritative — the store is the source of truth for
// what the user sees on THIS phone. Two phones can legitimately show
// different languages. `profiles.locale` in the DB is push-only from the
// device perspective (AppGate writes after login so the server can render
// emails / push in the user's last-active language). DB → store sync does
// NOT happen — pulling would surprise users who deliberately chose a
// different language on this device.
//
// `hasUserChosen` exists only to block OS re-detection across app launches.
// Detection runs once on first install (`hasUserChosen=false`); after the
// user taps the toggle it flips to true and the OS locale is ignored from
// then on, even if the user changes their iOS / Android language. BLI-277.
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: "pl",
      hasUserChosen: false,
      setLocale: (locale, userInitiated = true) => set({ locale, hasUserChosen: userInitiated || get().hasUserChosen }),
    }),
    {
      name: "blisko_locale",
      storage: createJSONStorage(() => secureStoreAdapter),
      onRehydrateStorage: () => (state) => {
        // After hydration, if the user has never explicitly chosen, seed from
        // device locale. Done here (not in a useEffect) because we need access
        // to the post-hydration value, and a useEffect would race the
        // hydration on cold start.
        if (state && !state.hasUserChosen) {
          const languageCode = Localization.getLocales()[0]?.languageCode;
          state.locale = detectLocaleFromLanguageCode(languageCode);
        }
      },
    },
  ),
);
