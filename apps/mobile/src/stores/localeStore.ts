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

// Device-scoped — preserved across logout (a Polish user logging out and
// signing up as someone new should keep the UI in Polish). Detection runs
// once on first install when `hasUserChosen` is false. After the user taps
// the toggle, `hasUserChosen` flips to true and detection never overrides
// the choice again. Cross-device sync happens via profiles.locale →
// AppGate seeds the store with `userInitiated=true` after profile fetch.
// BLI-277.
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
