import { useEffect } from "react";
import { Text, View } from "react-native";
import { SplashHold } from "@/components/ui/SplashHold";
import { getLastFailedRequestId, trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { colors, type as typ } from "@/theme";

// Gate between the root providers and the Stack. Holds the branded splash up
// as one <SplashHold> instance spanning auth session restore → profile fetch
// → first real screen render. Keeping the gate at the root (instead of per-
// group-layout early-returns in (tabs), (auth), onboarding) means one React
// instance and one continuous SonarDot animation loop across the whole cold-
// launch handover — unmount/remount during a phase flip would restart the
// ring animation (BLI-243).
//
// Location fix is NOT gated here: the permission prompt + GPS fetch live in
// (tabs)/index.tsx, so holding the splash on "granted + no cached fix" would
// deadlock (nothing inside the gate drives the fetch). Returning users get
// the cached fix from the persisted `locationStore` and render the map
// instantly; first-time users see (tabs)/index's own <SplashHold /> briefly
// while they grant permission and the first fix arrives — acceptable given
// the alternative was a hang.
//
// Must live inside <trpc.Provider> + <QueryClientProvider> because it uses
// `trpc.profiles.me.useQuery`. Mount order in app/_layout.tsx:
//   RootLayout → providers → <AppGate> → <Stack>
export function AppGate({ children }: { children: React.ReactNode }) {
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const hasCheckedProfile = useAuthStore((s) => s.hasCheckedProfile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHasCheckedProfile = useAuthStore((s) => s.setHasCheckedProfile);

  const {
    data: profileData,
    isError,
    refetch,
  } = trpc.profiles.me.useQuery(undefined, {
    enabled: !!user && !hasCheckedProfile,
    retry: 2,
  });

  useEffect(() => {
    // Mirror query result into the store once. Don't overwrite a profile that
    // was just created during onboarding and has landed in the store ahead of
    // the refetch (same guard as the previous (tabs)-layout effect).
    if (profileData !== undefined && !hasCheckedProfile) {
      setProfile(profileData);
      setHasCheckedProfile(true);
    }
  }, [profileData, hasCheckedProfile, setProfile, setHasCheckedProfile]);

  // Profile fetch failed on cold launch — retry screen instead of blindly
  // redirecting to onboarding. Preserves the "couldn't reach server" path
  // that lived in (tabs) before the gate moved up to the root.
  if (isError && !hasCheckedProfile) {
    const requestId = getLastFailedRequestId();
    return (
      <View
        style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: colors.bg }}
      >
        <Text style={{ ...typ.body, color: colors.muted, marginBottom: 16, textAlign: "center" }}>
          Nie udało się połączyć z serwerem
        </Text>
        <Text style={{ ...typ.body, color: colors.accent }} onPress={() => refetch()}>
          Spróbuj ponownie
        </Text>
        {requestId && (
          <Text selectable style={{ ...typ.caption, color: colors.muted, marginTop: 12 }}>
            ID: {requestId.slice(0, 8)}
          </Text>
        )}
      </View>
    );
  }

  // Auth restore in flight, or authenticated but profile not yet resolved.
  // Keep the branded splash visible — single instance, no animation restart.
  if (isAuthLoading || (user && !hasCheckedProfile)) {
    return <SplashHold />;
  }

  return <>{children}</>;
}
