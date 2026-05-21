import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const NOTIF_PREFS_KEY = "blisko_notification_prefs";

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
  photoOnly: boolean;
  showAllNearby: boolean;
  notificationPrefs: NotificationPrefs;
  setPhotoOnly: (v: boolean) => void;
  setShowAllNearby: (v: boolean) => void;
  setNotificationPref: (key: keyof NotificationPrefs, value: boolean) => void;
  loadPreferences: () => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  photoOnly: false,
  showAllNearby: false,
  notificationPrefs: { ...DEFAULT_NOTIF_PREFS },
  setPhotoOnly: (v) => set({ photoOnly: v }),
  setShowAllNearby: (v) => set({ showAllNearby: v }),
  setNotificationPref: (key, value) => {
    const updated = { ...get().notificationPrefs, [key]: value };
    set({ notificationPrefs: updated });
    SecureStore.setItemAsync(NOTIF_PREFS_KEY, JSON.stringify(updated));
  },
  loadPreferences: async () => {
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
