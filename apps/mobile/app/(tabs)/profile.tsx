import { Redirect } from "expo-router";

// The "Profil" tab was repurposed into a Settings launcher (see (tabs)/_layout.tsx tabPress).
// The standalone own-profile view was removed — profile editing now lives in Settings → Profil.
// This redirect is only a safety net for direct/deep-link navigation to the old (tabs)/profile route.
export default function ProfileTabRedirect() {
  return <Redirect href="/settings" />;
}
