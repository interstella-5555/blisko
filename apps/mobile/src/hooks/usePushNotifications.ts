import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { trpc } from "../lib/trpc";
import { useAuthStore } from "../stores/authStore";

// Suppress push banners in foreground — in-app banners handle it
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

export function usePushNotifications() {
  const userId = useAuthStore((s) => s.user?.id);
  const { mutateAsync: registerPushToken } = trpc.pushTokens.register.useMutation();
  const registeredTokenRef = useRef<string | null>(null);

  // Try to register the push token on mount and on every foreground resume.
  // Covers the user-grants-permission-later case: if they denied initially and
  // flipped it on in system Settings, coming back to the app re-attempts register.
  // If they later revoke, we accept the stale server token — iOS drops silently
  // and server-side DeviceNotRegistered cleanup catches it eventually.
  useEffect(() => {
    if (!userId) return;

    const tryRegister = async () => {
      const existing = await Notifications.getPermissionsAsync();
      const finalStatus =
        existing.status === "undetermined" ? (await Notifications.requestPermissionsAsync()).status : existing.status;
      if (finalStatus !== "granted") return;

      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? undefined;
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (registeredTokenRef.current === token) return;
        await registerPushToken({ token, platform: Platform.OS as "ios" | "android" });
        registeredTokenRef.current = token;
      } catch {
        // Simulator, network, or config error — next foreground resume retries
      }
    };

    tryRegister();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") tryRegister();
    });
    return () => sub.remove();
  }, [userId, registerPushToken]);

  // Deep link on notification tap
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (!data?.type) return;

      if (data.type === "wave" && data.userId) {
        router.push({
          pathname: "/(modals)/user/[userId]",
          params: { userId: data.userId },
        });
      } else if ((data.type === "chat" || data.type === "group") && data.conversationId) {
        router.push(`/chat/${data.conversationId}` as never);
      }
    });

    return () => sub.remove();
  }, []);
}
