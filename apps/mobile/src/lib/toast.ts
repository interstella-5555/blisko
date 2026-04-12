import * as Haptics from "expo-haptics";
import { toast } from "sonner-native";

const hapticMap = {
  error: Haptics.NotificationFeedbackType.Error,
  success: Haptics.NotificationFeedbackType.Success,
  info: Haptics.NotificationFeedbackType.Warning,
} as const;

type ToastType = keyof typeof hapticMap;

export function showToast(type: ToastType, title: string, message?: string) {
  Haptics.notificationAsync(hapticMap[type]);
  toast[type](title, message ? { description: message } : undefined);
}

export { toast };
