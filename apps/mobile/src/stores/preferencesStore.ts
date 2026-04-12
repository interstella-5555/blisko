import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const RADIUS_KEY = "blisko_nearby_radius";
const NOTIF_PREFS_KEY = "blisko_notification_prefs";
type RadiusOption = 500 | 1000 | 2000;

interface NotificationPrefs {
  newWaves: boolean;
  waveResponses: boolean;
  newMessages: boolean;
  groupInvites: boolean;
}

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  newWaves: true,
  waveResponses: true,
  newMessages: true,
  groupInvites: true,
};

interface PreferencesState {
  nearbyRadiusMeters: RadiusOption;
  photoOnly: boolean;
  notificationPrefs: NotificationPrefs;
  setNearbyRadius: (r: RadiusOption) => void;
  setPhotoOnly: (v: boolean) => void;
  setNotificationPref: (key: keyof NotificationPrefs, value: boolean) => void;
  loadPreferences: () => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  nearbyRadiusMeters: 2000,
  photoOnly: false,
  notificationPrefs: { ...DEFAULT_NOTIF_PREFS },
  setNearbyRadius: (r) => {
    set({ nearbyRadiusMeters: r });
    SecureStore.setItemAsync(RADIUS_KEY, String(r));
  },
  setPhotoOnly: (v) => set({ photoOnly: v }),
  setNotificationPref: (key, value) => {
    const updated = { ...get().notificationPrefs, [key]: value };
    set({ notificationPrefs: updated });
    SecureStore.setItemAsync(NOTIF_PREFS_KEY, JSON.stringify(updated));
  },
  loadPreferences: async () => {
    const stored = await SecureStore.getItemAsync(RADIUS_KEY);
    if (stored && [500, 1000, 2000].includes(Number(stored))) {
      set({ nearbyRadiusMeters: Number(stored) as RadiusOption });
    }
    const notifStored = await SecureStore.getItemAsync(NOTIF_PREFS_KEY);
    if (notifStored) {
      try {
        const parsed = JSON.parse(notifStored) as Partial<NotificationPrefs>;
        set({ notificationPrefs: { ...DEFAULT_NOTIF_PREFS, ...parsed } });
      } catch {
        // Corrupted data — keep defaults
      }
    }
  },
}));
