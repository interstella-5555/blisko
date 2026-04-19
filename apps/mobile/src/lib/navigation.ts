import { router } from "expo-router";

// Tapping a chat-related entry point (toast, profile modal button, etc.) should
// always leave the Czaty tab underneath — back from the chat returns to the
// chat list, not to wherever the user happened to be (map, a modal, settings,
// another chat). `dismissAll` is guarded by `canDismiss` because on the tabs
// root it dispatches a POP_TO_TOP that no navigator can handle and logs an
// "unhandled action" warning. The tab switch is skipped when the user is
// already on /chats because a redundant `router.navigate("/(tabs)/chats")` to
// the current tab jumps focus to the last tab (Profil) for reasons we haven't
// fully traced — behaviourally observed, so we just skip it.
export function openChatFromAnywhere(conversationId: string, currentPathname: string) {
  if (router.canDismiss()) router.dismissAll();
  if (currentPathname !== "/chats") router.navigate("/(tabs)/chats");
  router.push(`/chat/${conversationId}`);
}
