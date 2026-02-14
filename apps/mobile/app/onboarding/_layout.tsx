import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { trpc } from '../../src/lib/trpc';
import { useAuthStore } from '../../src/stores/authStore';

export default function OnboardingLayout() {
  const user = useAuthStore((state) => state.user);
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
      router.replace('/(tabs)');
    }
  }, [profile, setProfile, setHasCheckedProfile]);

  // Show loading while checking profile
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If profile exists, don't render onboarding (redirect will happen)
  if (profile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="profile-method" />
      <Stack.Screen name="bio" />
      <Stack.Screen name="looking-for" />
      <Stack.Screen name="profiling" />
      <Stack.Screen name="profiling-result" />
    </Stack>
  );
}
