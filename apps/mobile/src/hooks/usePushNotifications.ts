import * as Notifications from "expo-notifications";
import { router, usePathname, useRootNavigationState } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { openChatFromAnywhere } from "../lib/navigation";
import { trpc } from "../lib/trpc";
import { useAuthStore } from "../stores/authStore";

// Foreground suppression — our in-app NotificationToast (WS-driven) handles
// delivery UI, otherwise system banner + toast double up. Background/killed:
// iOS shows its own banner, this handler isn't consulted.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

export function usePushNotifications() {
  const userId = useAuthStore((s) => s.user?.id);
  const pathname = usePathname();
  const response = Notifications.useLastNotificationResponse();
  const rootNavState = useRootNavigationState();
  const handledIdRef = useRef<string | null>(null);
  const { mutateAsync: registerPushToken } = trpc.pushTokens.register.useMutation();
  const { mutateAsync: unregisterPushToken } = trpc.pushTokens.unregister.useMutation();

  // --- Token sync ---------------------------------------------------------
  // Keep the server's push_tokens row aligned with device permission. Runs on
  // mount and every foreground resume, so a permission toggle done in system
  // Settings converges the next time the user returns to the app.
  // `authStore.pushToken` is our local mirror of "what we believe the server
  // has for THIS device" — cleared on logout by signOutAndReset (BLI-205).
  useEffect(() => {
    if (!userId) return; // not logged in → nothing to register

    const sync = async () => {
      // First launch is `undetermined` → system prompt fires exactly once.
      const existing = await Notifications.getPermissionsAsync();
      const status =
        existing.status === "undetermined" ? (await Notifications.requestPermissionsAsync()).status : existing.status;

      // Throws on simulator / missing projectId. Silent bail — next foreground
      // resume retries, so a transient network blip self-heals.
      let deviceToken: string;
      try {
        deviceToken = (await Notifications.getExpoPushTokenAsync()).data;
      } catch {
        return;
      }

      const { pushToken: syncedToken, setPushToken } = useAuthStore.getState();

      // Reconcile (permission × synced-vs-device) into at most one mutation.
      try {
        if (status === "granted") {
          if (syncedToken !== deviceToken) {
            // granted + stale/null → upsert current token on server
            await registerPushToken({ token: deviceToken, platform: Platform.OS as "ios" | "android" });
            setPushToken(deviceToken);
          }
          // else: granted + already in sync → no-op
        } else if (syncedToken !== null) {
          // permission revoked but server still has a token → drop it so we
          // don't send into the void
          await unregisterPushToken({ token: syncedToken });
          setPushToken(null);
        }
        // else: not-granted + already null → no-op
      } catch {
        // Transient mutation failure. Local mirror only advances on success,
        // so local + server stay consistent and the next resume retries.
      }
    };

    sync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => sub.remove();
  }, [userId, registerPushToken, unregisterPushToken]);

  // --- Tap handler --------------------------------------------------------
  // Deep-link on notification tap, covering both cold-launch and warm taps.
  //
  // `useLastNotificationResponse` is a single source of truth: first render
  // returns the tap that woke the app from a killed state, subsequent renders
  // carry new taps. Beats `addNotificationResponseReceivedListener`, which can
  // miss the cold-launch tap entirely (listener registers too late).
  //
  // The guards below exist because pushing a route onto an unready navigator
  // during cold launch crashed TestFlight 31 (BLI-242): a native TurboModule
  // raised an NSException mid-chat-screen-mount against a half-built stack, and
  // RN's error-conversion path crashed from the dispatch-queue thread while
  // the JS thread was also mid-JSI setPropertyValue on the same Hermes runtime.
  useEffect(() => {
    // Root navigator not mounted yet (state.key is undefined until the root
    // <Stack> registers). This is the exact window BLI-242 crashed in.
    if (!rootNavState?.key) return;

    // Not authenticated. Belt-and-braces — this hook is only mounted from the
    // tab layout, so in practice userId is always set when we reach here.
    if (!userId) return;

    // No tap on record (undefined = never tapped, null = tap was cleared).
    if (!response) return;

    // Dedupe. The effect re-runs on pathname changes (user navigates after
    // we've already handled a tap) but `response` keeps pointing at the same
    // object until a fresh tap arrives — without this we'd re-navigate every
    // time the user moves between screens.
    const id = response.notification.request.identifier;
    if (handledIdRef.current === id) return;
    handledIdRef.current = id;

    // Server-attached payload; `type` is the routing discriminator. See
    // docs/architecture/push-notifications.md for the full type table.
    const data = response.notification.request.content.data as Record<string, string> | undefined;
    if (!data?.type) return;

    if (data.type === "wave" && typeof data.userId === "string") {
      // New ping → open sender's profile modal. `canDismiss` guards
      // `dismissAll` because on the tabs root it dispatches a POP_TO_TOP that
      // no navigator can handle and logs an unhandled-action warning.
      if (router.canDismiss()) router.dismissAll();
      router.push({
        pathname: "/(modals)/user/[userId]",
        params: { userId: data.userId },
      });
    } else if ((data.type === "chat" || data.type === "group") && typeof data.conversationId === "string") {
      // Message / accepted ping / group invite → open the conversation via
      // the shared helper (BLI-234): dismiss modals, put Czaty tab underneath,
      // so back from the chat lands on Czaty regardless of where the tap came
      // from. Same behaviour as tapping an in-app toast.
      openChatFromAnywhere(data.conversationId, pathname);
    }
    // `ambient_match` has no branch — the tap leaves the user where they were.
    // Add one here if we decide to deep-link it (e.g. to the map).
  }, [response, rootNavState?.key, userId, pathname]);
}
