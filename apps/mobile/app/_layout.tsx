import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClient } from '../src/lib/trpc';
import { useAuthStore } from '../src/stores/authStore';
import { supabase } from '../src/lib/supabase';

const queryClient = new QueryClient();

export default function RootLayout() {
  const setSession = useAuthStore((state) => state.setSession);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [setSession, setLoading]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="(modals)/user/[id]"
            options={{
              presentation: 'modal',
              headerShown: true,
              headerTitle: 'Profil',
            }}
          />
          <Stack.Screen
            name="(modals)/chat/[id]"
            options={{
              presentation: 'modal',
              headerShown: true,
              headerTitle: 'Czat',
            }}
          />
          <Stack.Screen name="onboarding" />
        </Stack>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
