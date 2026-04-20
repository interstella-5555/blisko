import * as Haptics from "expo-haptics";
import { toast } from "sonner-native";
import { usePreferencesStore } from "@/stores/preferencesStore";

// --- Toast (system feedback — always shown) ---

const hapticMap = {
  error: Haptics.NotificationFeedbackType.Error,
  success: Haptics.NotificationFeedbackType.Success,
  info: Haptics.NotificationFeedbackType.Warning,
} as const;

type ToastType = keyof typeof hapticMap;

export function showToast(type: ToastType, title: string, message?: string, opts?: { id?: string }) {
  Haptics.notificationAsync(hapticMap[type]);
  toast[type](title, {
    ...(message ? { description: message } : {}),
    ...(opts?.id ? { id: opts.id } : {}),
  });
}

// --- Notification (WS-driven — respects user prefs) ---

export type NotificationCategory = "newWaves" | "waveResponses" | "newMessages" | "groupInvites";

export function showNotification(category: NotificationCategory, id: string, jsx: React.ReactElement) {
  const prefs = usePreferencesStore.getState().notificationPrefs;
  if (!prefs[category]) return;

  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  toast.custom(jsx, { id, duration: 4000 });
}

export { toast };
