import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { trpc } from "../../src/lib/trpc";
import { useAuthStore } from "../../src/stores/authStore";

export default function OnboardingLayout() {
  const user = useAuthStore((state) => state.user);
  const setProfile = useAuthStore((state) => state.setProfile);
  const setHasCheckedProfile = useAuthStore((state) => state.setHasCheckedProfile);

  const { data: profile, isLoading } = trpc.profiles.me.useQuery(undefined, {
    enabled: !!user,
  });

  useEffect(() => {
    // Only redirect if profile is complete — ghost/Ninja profiles have isComplete: false
    if (profile?.isComplete) {
      setProfile(profile);
      setHasCheckedProfile(true);
      router.replace("/(tabs)");
    }
  }, [profile, setProfile, setHasCheckedProfile]);

  // Show loading while checking profile
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If profile is complete, don't render onboarding (redirect will happen)
  if (profile?.isComplete) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
      initialRouteName="hook"
    >
      <Stack.Screen name="hook" options={{ animation: "fade" }} />
      <Stack.Screen name="index" />
      <Stack.Screen name="visibility" />
      <Stack.Screen name="superpower" />
      <Stack.Screen name="status" />
      <Stack.Screen name="questions" />
      <Stack.Screen name="profiling-result" />
    </Stack>
  );
}
