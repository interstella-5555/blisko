import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { SplashHold } from "@/components/ui/SplashHold";
import { useAuthStore } from "@/stores/authStore";
import { colors } from "@/theme";

export default function OnboardingLayout() {
  const profile = useAuthStore((state) => state.profile);
  const setHasCheckedProfile = useAuthStore((state) => state.setHasCheckedProfile);

  // AppGate in root layout has already resolved the profile (or its absence)
  // into the store before we render. If one exists the user must have come
  // back to onboarding after completing it — redirect to tabs.
  useEffect(() => {
    if (profile) {
      setHasCheckedProfile(true);
      router.replace("/(tabs)");
    }
  }, [profile, setHasCheckedProfile]);

  if (profile) {
    return <SplashHold />;
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
      <Stack.Screen name="questions-intro" />
      <Stack.Screen name="questions" />
      <Stack.Screen name="profiling-result" />
    </Stack>
  );
}
