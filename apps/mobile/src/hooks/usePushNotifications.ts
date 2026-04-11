import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
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

const PUSH_TOKEN_KEY = "lastRegisteredPushToken";

export function usePushNotifications() {
  const userId = useAuthStore((s) => s.user?.id);
  const registerMutation = trpc.pushTokens.register.useMutation();
  const unregisterMutation = trpc.pushTokens.unregister.useMutation();
  const inFlightRef = useRef(false);
  const registerRef = useRef(registerMutation);
  const unregisterRef = useRef(unregisterMutation);
  registerRef.current = registerMutation;
  unregisterRef.current = unregisterMutation;

  // Token sync — runs on mount and on every foreground resume. Handles both:
  // granting permission mid-session (register) and revoking it mid-session (unregister),
  // so users can toggle push in Settings without re-login and server state stays in sync.
  useEffect(() => {
    if (!userId) return;

    const syncPushToken = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;

        if (existing === "undetermined") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") {
          // Permission revoked — drop the token from server + local store so OS-level
          // silent drops don't become invisible delivery failures.
          const storedToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
          if (storedToken) {
            try {
              await unregisterRef.current.mutateAsync({ token: storedToken });
            } catch {
              // Server unreachable — clear local anyway; next foreground retries via register path.
            }
            await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
          }
          return;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? undefined;

        let token: string;
        let storedToken: string | null;
        try {
          const [tokenResult, stored] = await Promise.all([
            Notifications.getExpoPushTokenAsync({ projectId }),
            SecureStore.getItemAsync(PUSH_TOKEN_KEY),
          ]);
          token = tokenResult.data;
          storedToken = stored;
        } catch {
          // Simulator doesn't support push tokens — silently skip
          return;
        }

        if (token === storedToken) return;

        await registerRef.current.mutateAsync({ token, platform: Platform.OS as "ios" | "android" });
        await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
      } catch {
        // Mutation failed — next foreground resume will retry
      } finally {
        inFlightRef.current = false;
      }
    };

    syncPushToken();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncPushToken();
    });
    return () => sub.remove();
  }, [userId]);

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
