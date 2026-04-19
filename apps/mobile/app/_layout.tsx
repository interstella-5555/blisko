import { focusManager, MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
// Workaround: expo-router 6.0.22 bug — Stack uses useLinkPreviewContext
// but ExpoRoot's provider doesn't always reach it
import { LinkPreviewContextProvider } from "expo-router/build/link/preview/LinkPreviewContext";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Alert, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { AppGate } from "@/components/AppGate";
import { IconCheck, IconChevronLeft, IconX } from "@/components/ui/icons";
import { SplashHold } from "@/components/ui/SplashHold";
import { authClient } from "@/lib/auth";
import { getRateLimitMessage } from "@/lib/rateLimitMessages";
import { showToast } from "@/lib/toast";
import { trpc, trpcClient } from "@/lib/trpc";
import { useWebSocket } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import { resetUserScopedStores } from "@/stores/reset";
import { colors, fonts, layout, spacing } from "@/theme";

// Keep the native splash visible until RN has mounted and fonts are loaded.
// Fires at module import (before any render). Once `fontsLoaded` flips in
// RootLayout we call `SplashScreen.hideAsync()` to fade the native layer;
// <SplashHold> sits underneath rendering the same dot + wordmark so there's
// no visible flash if the native layer dismisses before the Stack paints.
// See BLI-243 and docs/architecture/mobile-architecture.md → Splash.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or native module unavailable (web) — nothing to do.
});

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
          void signOutAndReset();
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
      showToast("error", getRateLimitMessage(parsed.context));
    }
  } catch {
    showToast("error", getRateLimitMessage());
  }
}

function handleContentModeration(error: unknown) {
  const err = error as { data?: { code?: string }; message?: string };
  if (err?.data?.code !== "BAD_REQUEST") return;

  try {
    const parsed = JSON.parse(err.message ?? "");
    if (parsed.error === "CONTENT_MODERATED") {
      showToast("error", "Treść narusza regulamin");
    }
  } catch {
    // Not a moderation error — ignore
  }
}

function handleGlobalError(error: unknown) {
  handleAccountDeleted(error);
  handleRateLimitError(error);
  handleContentModeration(error);
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

// Single sign-out path for all logout flows (settings, account deletion, onboarding abort,
// ACCOUNT_DELETED error handler). Clears every user-scoped store + React Query cache + Better
// Auth session + SecureStore tokens. Leaves `locationStore` (device state) and `preferencesStore`
// (intentionally persisted) untouched.
export async function signOutAndReset() {
  const pushToken = useAuthStore.getState().pushToken;
  if (pushToken) {
    try {
      await trpcClient.pushTokens.unregister.mutate({ token: pushToken });
    } catch {
      // Best-effort — token unregister must not block logout. authStore.reset()
      // below nulls the local mirror regardless; server-side DeviceNotRegistered
      // cleanup catches orphaned rows if this POST never lands.
    }
  }

  try {
    await authClient.signOut();
  } catch {
    // Server may already consider the session invalid (e.g. ACCOUNT_DELETED). Continue cleanup.
  }
  await SecureStore.deleteItemAsync("blisko_session_token");

  queryClient.clear();
  resetUserScopedStores();

  router.replace("/(auth)/login");
}

const badgeBase = {
  width: 22,
  height: 22,
  borderRadius: 11,
  alignItems: "center",
  justifyContent: "center",
} as const;

const toastBadgeStyles = StyleSheet.create({
  success: { ...badgeBase, backgroundColor: colors.status.success.text },
  error: { ...badgeBase, backgroundColor: colors.status.error.text },
  warning: { ...badgeBase, backgroundColor: colors.status.warning.text },
  info: { ...badgeBase, backgroundColor: colors.muted },
  warningGlyph: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 15,
    color: colors.bg,
  },
  infoGlyph: {
    fontFamily: fonts.serifItalic,
    fontSize: 14,
    lineHeight: 15,
    color: colors.bg,
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

  // Hide the native splash as soon as fonts are ready — <SplashHold> below
  // covers the brief moment between the native layer fading and the Stack
  // first painting so the user never sees a background flash.
  useEffect(() => {
    if (!fontsLoaded) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Safety net: if font loading hangs (e.g. asset missing on an unexpected
  // build), force-hide the native splash after 3s so the user isn't stranded
  // on it. Anything fatal beyond that point would surface as an error screen
  // rather than a stuck splash.
  useEffect(() => {
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 3000);
    return () => clearTimeout(timeout);
  }, []);

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

  // Render <SplashHold> under the native splash while fonts load. Same dot +
  // wordmark geometry as assets/splash-icon.png, so the user sees a
  // continuous image even if the native layer fades before the Stack paints.
  if (!fontsLoaded) {
    return <SplashHold />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" />
            <LinkPreviewContextProvider>
              <AppGate>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="settings" options={{ headerShown: false }} />
                  <Stack.Screen name="onboarding" />
                  <Stack.Screen name="(modals)" options={{ presentation: "modal" }} />
                  <Stack.Screen name="chat/[id]" options={{ headerShown: true }} />
                  <Stack.Screen
                    name="create-group"
                    options={{
                      headerShown: true,
                      header: () => (
                        <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              paddingHorizontal: spacing.section,
                              height: layout.headerHeight,
                            }}
                          >
                            <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 24 }}>
                              <IconChevronLeft size={24} color={colors.ink} />
                            </Pressable>
                            <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.ink }}>Nowa grupa</Text>
                            <View style={{ width: 24 }} />
                          </View>
                        </SafeAreaView>
                      ),
                      contentStyle: { backgroundColor: colors.bg },
                    }}
                  />
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
              </AppGate>
            </LinkPreviewContextProvider>
            <Toaster
              position="top-center"
              duration={4000}
              visibleToasts={3}
              swipeToDismissDirection="up"
              theme="light"
              offset={0}
              icons={{
                success: (
                  <View style={toastBadgeStyles.success}>
                    <IconCheck size={14} color={colors.bg} />
                  </View>
                ),
                error: (
                  <View style={toastBadgeStyles.error}>
                    <IconX size={14} color={colors.bg} />
                  </View>
                ),
                warning: (
                  <View style={toastBadgeStyles.warning}>
                    <Text style={toastBadgeStyles.warningGlyph}>!</Text>
                  </View>
                ),
                info: (
                  <View style={toastBadgeStyles.info}>
                    <Text style={toastBadgeStyles.infoGlyph}>i</Text>
                  </View>
                ),
              }}
              toastOptions={{
                style: {
                  backgroundColor: colors.bg,
                  borderColor: colors.rule,
                  borderWidth: 1,
                  borderRadius: 14,
                  padding: 14,
                  marginHorizontal: spacing.section,
                },
                titleStyle: {
                  fontFamily: fonts.sansSemiBold,
                  fontSize: 15,
                  lineHeight: 20,
                  color: colors.ink,
                },
                descriptionStyle: {
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.muted,
                },
                toastContentStyle: {
                  alignItems: "center",
                  gap: spacing.gutter,
                },
              }}
            />
          </QueryClientProvider>
        </trpc.Provider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
