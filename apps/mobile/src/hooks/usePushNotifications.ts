import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
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
  const { mutateAsync: unregisterPushToken } = trpc.pushTokens.unregister.useMutation();

  // Sync this device's push_tokens row with current permission state. Runs on
  // mount (login / cold start) and on every foreground resume. authStore.pushToken
  // mirrors what we believe the server has for THIS device: register bumps it to
  // the device token, unregister nulls it. Permission changes in system Settings
  // are picked up on the next foreground resume.
  useEffect(() => {
    if (!userId) return;

    const sync = async () => {
      const existing = await Notifications.getPermissionsAsync();
      const status =
        existing.status === "undetermined" ? (await Notifications.requestPermissionsAsync()).status : existing.status;

      let deviceToken: string;
      try {
        deviceToken = (await Notifications.getExpoPushTokenAsync()).data;
      } catch {
        // Simulator, missing projectId, or network — next foreground resume retries
        return;
      }

      const { pushToken: syncedToken, setPushToken } = useAuthStore.getState();

      try {
        if (status === "granted") {
          if (syncedToken !== deviceToken) {
            await registerPushToken({ token: deviceToken, platform: Platform.OS as "ios" | "android" });
            setPushToken(deviceToken);
          }
        } else if (syncedToken !== null) {
          await unregisterPushToken({ token: syncedToken });
          setPushToken(null);
        }
      } catch {
        // Mutation failed — next foreground resume retries
      }
    };

    sync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => sub.remove();
  }, [userId, registerPushToken, unregisterPushToken]);

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
