import { focusManager, MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
// Workaround: expo-router 6.0.22 bug — Stack uses useLinkPreviewContext
// but ExpoRoot's provider doesn't always reach it (pnpm dual-instance issue)
import { LinkPreviewContextProvider } from "expo-router/build/link/preview/LinkPreviewContext";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, Alert, AppState, Platform, View } from "react-native";
import { NotificationOverlay } from "../src/components/ui/NotificationOverlay";
import { ToastOverlay } from "../src/components/ui/ToastOverlay";
import { authClient } from "../src/lib/auth";
import { getRateLimitMessage } from "../src/lib/rateLimitMessages";
import { trpc, trpcClient } from "../src/lib/trpc";
import { useWebSocket } from "../src/lib/ws";
import { NotificationProvider } from "../src/providers/NotificationProvider";
import { showToastGlobal, ToastProvider } from "../src/providers/ToastProvider";
import { useAuthStore } from "../src/stores/authStore";
import { colors } from "../src/theme";

let accountDeletedAlertShown = false;

function handleAccountDeleted(error: unknown) {
  const err = error as { data?: { code?: string }; message?: string };
  if (err?.data?.code === "FORBIDDEN" && err?.message === "ACCOUNT_DELETED" && !accountDeletedAlertShown) {
    accountDeletedAlertShown = true;
    Alert.alert("Konto usunięte", "Twoje konto jest w trakcie usuwania. Może to potrwać do 14 dni.", [
      {
        text: "OK",
        onPress: () => {
          accountDeletedAlertShown = false;
          authClient.signOut();
          useAuthStore.getState().reset();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }
}

function handleRateLimitError(error: unknown) {
  const err = error as { data?: { code?: string }; message?: string };
  if (err?.data?.code !== "TOO_MANY_REQUESTS") return;

  try {
    const parsed = JSON.parse(err.message ?? "");
    if (parsed.error === "RATE_LIMITED") {
      showToastGlobal({
        type: "error",
        title: getRateLimitMessage(parsed.context),
      });
    }
  } catch {
    showToastGlobal({
      type: "error",
      title: getRateLimitMessage(),
    });
  }
}

function handleGlobalError(error: unknown) {
  handleAccountDeleted(error);
  handleRateLimitError(error);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleGlobalError }),
  mutationCache: new MutationCache({ onError: handleGlobalError }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        const err = error as { data?: { code?: string }; message?: string };
        if (err?.data?.code === "FORBIDDEN" && err?.message === "ACCOUNT_DELETED") return false;
        if (err?.data?.code === "TOO_MANY_REQUESTS") return false;
        return failureCount < 3;
      },
    },
  },
});

export default function RootLayout() {
  const setUser = useAuthStore((state) => state.setUser);
  const setSession = useAuthStore((state) => state.setSession);
  const setLoading = useAuthStore((state) => state.setLoading);

  // Connect WebSocket when user is authenticated
  useWebSocket();

  // Tell React Query when app is focused (required for React Native)
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });
    return () => sub.remove();
  }, []);

  const [fontsLoaded] = useFonts({
    "InstrumentSerif-Regular": require("../assets/fonts/InstrumentSerif-Regular.ttf"),
    "InstrumentSerif-Italic": require("../assets/fonts/InstrumentSerif-Italic.ttf"),
    "DMSans-Regular": require("../assets/fonts/DMSans-Regular.ttf"),
    "DMSans-Medium": require("../assets/fonts/DMSans-Medium.ttf"),
    "DMSans-SemiBold": require("../assets/fonts/DMSans-SemiBold.ttf"),
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
        console.error("Session check error:", error);
      }
      setLoading(false);
    };

    checkSession();
  }, [setUser, setSession, setLoading]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <ToastProvider>
            <StatusBar style="dark" />
            <LinkPreviewContextProvider>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(modals)" options={{ presentation: "modal" }} />
                <Stack.Screen name="chat/[id]" options={{ headerShown: true }} />
                <Stack.Screen
                  name="set-status"
                  options={{
                    presentation: "formSheet",
                    headerShown: false,
                    sheetAllowedDetents: "fitToContents",
                    sheetGrabberVisible: true,
                    sheetCornerRadius: 20,
                    contentStyle: { backgroundColor: colors.bg },
                  }}
                />
                <Stack.Screen
                  name="filters"
                  options={{
                    presentation: "formSheet",
                    headerShown: false,
                    sheetAllowedDetents: "fitToContents",
                    sheetGrabberVisible: true,
                    sheetCornerRadius: 20,
                    contentStyle: { backgroundColor: colors.bg },
                  }}
                />
              </Stack>
            </LinkPreviewContextProvider>
            <NotificationOverlay />
            <ToastOverlay />
          </ToastProvider>
        </NotificationProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
