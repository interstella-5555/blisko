import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

// Same adapter shape as onboardingStore — expo-secure-store is the standard
// persistence layer for this codebase. Location isn't credential-sensitive
// but the data is private, so encrypted storage is appropriate.
const secureStoreAdapter: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  lastUpdate: number | null; // epoch ms — plain JSON-serialisable
  permissionStatus: "undetermined" | "granted" | "denied";
  setLocation: (latitude: number, longitude: number) => void;
  setPermissionStatus: (status: "undetermined" | "granted" | "denied") => void;
  reset: () => void;
}

const initialState = {
  latitude: null,
  longitude: null,
  lastUpdate: null,
  permissionStatus: "undetermined" as const,
};

// Persist the last known GPS fix across app kills so returning users see the
// map at their last location immediately on cold launch while the fresh fix
// is fetched in the background (BLI-243 follow-up: "siedzę w bunkrze, chcę
// zobaczyć gdzie ostatnio byłem"). permissionStatus is persisted too so the
// root-layout AppGate can decide whether to hold the splash for a GPS fix
// (granted + no cached → gate) vs let the app through (denied / undetermined
// → let (tabs)/index handle the prompt or show the error screen).
export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      ...initialState,
      setLocation: (latitude, longitude) => set({ latitude, longitude, lastUpdate: Date.now() }),
      setPermissionStatus: (permissionStatus) => set({ permissionStatus }),
      reset: () => set(initialState),
    }),
    {
      name: "blisko-location",
      storage: createJSONStorage(() => secureStoreAdapter),
    },
  ),
);
