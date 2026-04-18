import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { colors } from "@/theme";

export default function OnboardingLayout() {
  const user = useAuthStore((state) => state.user);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const setProfile = useAuthStore((state) => state.setProfile);
  const setHasCheckedProfile = useAuthStore((state) => state.setHasCheckedProfile);

  const { data: profile, isLoading } = trpc.profiles.me.useQuery(undefined, {
    enabled: !!user,
  });

  useEffect(() => {
    // If profile exists, user already completed onboarding - redirect to tabs
    if (profile) {
      setProfile(profile);
      setHasCheckedProfile(true);
      router.replace("/(tabs)");
    }
  }, [profile, setProfile, setHasCheckedProfile]);

  // Show loading while auth session restores or profile query runs
  if (isAuthLoading || isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If profile exists, don't render onboarding (redirect will happen)
  if (profile) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        animation: "slide_from_right",
        contentStyle: { backgroundColor: colors.bg },
      }}
      initialRouteName="hook"
    >
      <Stack.Screen name="hook" options={{ animation: "fade", headerShown: false }} />
      <Stack.Screen name="index" />
      <Stack.Screen name="visibility" />
      <Stack.Screen name="questions" />
      <Stack.Screen name="profiling-result" options={{ headerShown: false }} />
    </Stack>
  );
}
