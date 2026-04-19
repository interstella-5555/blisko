import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function AuthLayout() {
  const session = useAuthStore((state) => state.session);

  // Session restore is handled by <AppGate> in root layout — by the time we
  // reach here `isLoading` is already false, so we can redirect immediately
  // without a local splash guard.
  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="email" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
