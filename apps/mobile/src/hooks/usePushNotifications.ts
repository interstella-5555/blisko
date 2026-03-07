import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { trpc } from '../lib/trpc';

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

const PUSH_TOKEN_KEY = 'lastRegisteredPushToken';

export function usePushNotifications() {
  const userId = useAuthStore((s) => s.user?.id);
  const registerMutation = trpc.pushTokens.register.useMutation();
  const registeredRef = useRef(false);

  // Token registration
  useEffect(() => {
    if (!userId || registeredRef.current) return;

    (async () => {
      const { status: existing } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existing;

      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? undefined;

      let token: string;
      try {
        const result = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        token = result.data;
      } catch {
        // Simulator doesn't support push tokens — silently skip
        return;
      }

      const lastToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
      if (token === lastToken) {
        registeredRef.current = true;
        return;
      }

      registerMutation.mutate(
        { token, platform: Platform.OS as 'ios' | 'android' },
        {
          onSuccess: async () => {
            await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
            registeredRef.current = true;
          },
        },
      );
    })();
  }, [userId]);

  // Deep link on notification tap
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content
          .data as Record<string, string> | undefined;
        if (!data?.type) return;

        if (data.type === 'wave' && data.userId) {
          router.push({
            pathname: '/(modals)/user/[userId]',
            params: { userId: data.userId },
          });
        } else if (
          (data.type === 'chat' || data.type === 'group') &&
          data.conversationId
        ) {
          router.push(`/chat/${data.conversationId}` as any);
        }
      },
    );

    return () => sub.remove();
  }, []);
}
