import { useAuthStore } from "./authStore";
import { useConversationsStore } from "./conversationsStore";
import { useLocationStore } from "./locationStore";
import { useMessagesStore } from "./messagesStore";
import { useOnboardingStore } from "./onboardingStore";
import { usePreferencesStore } from "./preferencesStore";
import { useProfilesStore } from "./profilesStore";
import { useWavesStore } from "./wavesStore";

// Every store in `src/stores/` must be in exactly one of the two arrays below.
// See rule `mobile/new-store-categorize` in `.claude/rules/mobile.md`.

export const USER_SCOPED_STORES = [
  useAuthStore,
  useConversationsStore,
  useMessagesStore,
  useProfilesStore,
  useWavesStore,
  useOnboardingStore,
] as const;

export const DEVICE_SCOPED_STORES = [
  useLocationStore, // current GPS reading — device state, no user data
  usePreferencesStore, // nearbyRadius + notificationPrefs — UX, preserved across logout by product decision
] as const;

/**
 * Wipe all user-scoped store state. Called from two places:
 * 1. `signOutAndReset` — explicit logout (settings, account deletion, onboarding abort).
 * 2. `(auth)/login` mount — belt-and-braces cleanup for sessions lost without going
 *    through logout (token expired, network error, server invalidation). If the user
 *    landed on the login screen, any lingering user-scoped state belongs to the
 *    previous account and must not leak into the next one.
 */
export function resetUserScopedStores() {
  for (const store of USER_SCOPED_STORES) {
    store.getState().reset();
  }
}
