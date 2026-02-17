import { useEffect } from 'react';
import { View, ActivityIndicator, AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
// Workaround: expo-router 6.0.22 bug — Stack uses useLinkPreviewContext
// but ExpoRoot's provider doesn't always reach it (pnpm dual-instance issue)
// @ts-expect-error internal expo-router module
import { LinkPreviewContextProvider } from 'expo-router/build/link/preview/LinkPreviewContext';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClient } from '../src/lib/trpc';
import { useAuthStore } from '../src/stores/authStore';
import { authClient } from '../src/lib/auth';
import { useWebSocket } from '../src/lib/ws';
import { NotificationProvider } from '../src/providers/NotificationProvider';
import { NotificationOverlay } from '../src/components/ui/NotificationOverlay';
import { colors } from '../src/theme';

const queryClient = new QueryClient();

export default function RootLayout() {
  const setUser = useAuthStore((state) => state.setUser);
  const setSession = useAuthStore((state) => state.setSession);
  const setLoading = useAuthStore((state) => state.setLoading);

  // Connect WebSocket when user is authenticated
  useWebSocket();

  // Tell React Query when app is focused (required for React Native)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  const [fontsLoaded] = useFonts({
    'InstrumentSerif-Regular': require('../assets/fonts/InstrumentSerif-Regular.ttf'),
    'InstrumentSerif-Italic': require('../assets/fonts/InstrumentSerif-Italic.ttf'),
    'DMSans-Regular': require('../assets/fonts/DMSans-Regular.ttf'),
    'DMSans-Medium': require('../assets/fonts/DMSans-Medium.ttf'),
    'DMSans-SemiBold': require('../assets/fonts/DMSans-SemiBold.ttf'),
  });

  useEffect(() => {
    // Check initial session
    const checkSession = async () => {
      try {
        const { data } = await authClient.getSession();
        if (data?.session && data?.user) {
          setUser(data.user);
          setSession(data.session);
        }
      } catch (error) {
        console.error('Session check error:', error);
      }
      setLoading(false);
    };

    checkSession();
  }, [setUser, setSession, setLoading]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <StatusBar style="dark" />
          <LinkPreviewContextProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
            </Stack>
          </LinkPreviewContextProvider>
          <NotificationOverlay />
        </NotificationProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
