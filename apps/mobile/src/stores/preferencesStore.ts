import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const RADIUS_KEY = 'blisko_nearby_radius';
type RadiusOption = 500 | 1000 | 2000;

interface PreferencesState {
  nearbyRadiusMeters: RadiusOption;
  photoOnly: boolean;
  nearbyOnly: boolean;
  setNearbyRadius: (r: RadiusOption) => void;
  setPhotoOnly: (v: boolean) => void;
  setNearbyOnly: (v: boolean) => void;
  loadPreferences: () => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  nearbyRadiusMeters: 2000,
  photoOnly: false,
  nearbyOnly: false,
  setNearbyRadius: (r) => {
    set({ nearbyRadiusMeters: r });
    SecureStore.setItemAsync(RADIUS_KEY, String(r));
  },
  setPhotoOnly: (v) => set({ photoOnly: v }),
  setNearbyOnly: (v) => set({ nearbyOnly: v }),
  loadPreferences: async () => {
    const stored = await SecureStore.getItemAsync(RADIUS_KEY);
    if (stored && [500, 1000, 2000].includes(Number(stored))) {
      set({ nearbyRadiusMeters: Number(stored) as RadiusOption });
    }
  },
}));
