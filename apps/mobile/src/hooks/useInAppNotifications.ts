import { router, usePathname } from "expo-router";
import React, { useCallback } from "react";
import { NotificationToast } from "@/components/ui/NotificationToast";
import { showNotification } from "@/lib/toast";
import { useWebSocket, type WSMessage } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import { useConversationsStore } from "@/stores/conversationsStore";

function notification(
  toastId: string,
  props: { title: string; subtitle?: string; avatarUrl?: string | null; avatarName: string; onPress: () => void },
) {
  return React.createElement(NotificationToast, { toastId, ...props });
}

// Tapping a chat-related toast should always leave Czaty tab underneath — so
// back from the chat returns to the chat list, not to wherever the user
// happened to be (map, a modal, settings, another chat). `dismissAll` is
// guarded by `canDismiss` because on the tabs root it dispatches a POP_TO_TOP
// that no navigator can handle and logs an "unhandled action" warning. The
// tab switch is skipped when the user is already on /chats because a
// redundant `router.navigate("/(tabs)/chats")` to the current tab jumps focus
// to the last tab (Profil) for reasons we haven't fully traced — behaviourally
// observed, so we just skip it.
function openChatFromNotification(conversationId: string, currentPathname: string) {
  if (router.canDismiss()) router.dismissAll();
  if (currentPathname !== "/chats") router.navigate("/(tabs)/chats");
  router.push(`/chat/${conversationId}`);
}

export function useInAppNotifications() {
  const userId = useAuthStore((s) => s.user?.id);
  const pathname = usePathname();

  const handler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "newWave") {
        const { fromProfile, wave } = msg;
        const id = `wave-${wave.id}`;
        showNotification(
          "newWaves",
          id,
          notification(id, {
            title: fromProfile.displayName,
            subtitle: "Pinguje Cię!",
            avatarUrl: fromProfile.avatarUrl,
            avatarName: fromProfile.displayName,
            onPress: () => router.push({ pathname: "/(modals)/user/[userId]", params: { userId: wave.fromUserId } }),
          }),
        );
        return;
      }

      if (msg.type === "waveResponded" && msg.accepted && msg.conversationId) {
        const { responderProfile, conversationId } = msg;
        const id = `wave-responded-${msg.waveId}`;
        showNotification(
          "waveResponses",
          id,
          notification(id, {
            title: responderProfile?.displayName ?? "Ktoś",
            subtitle: "Przyjął(a) Twój ping!",
            avatarUrl: responderProfile?.avatarUrl ?? null,
            avatarName: responderProfile?.displayName ?? "?",
            onPress: () => {
              if (useConversationsStore.getState().activeConversationId !== conversationId) {
                openChatFromNotification(conversationId, pathname);
              }
            },
          }),
        );
        return;
      }

      if (msg.type === "waveResponded" && !msg.accepted) {
        const id = `wave-declined-${msg.waveId}`;
        showNotification(
          "waveResponses",
          id,
          notification(id, {
            title: "Blisko",
            subtitle: "Ta osoba jest teraz niedostępna — powodów może być wiele, nie przejmuj się.",
            avatarUrl: null,
            avatarName: "B",
            onPress: () => {},
          }),
        );
        return;
      }

      if (msg.type === "groupInvited") {
        const id = `group-invited-${msg.conversationId}`;
        showNotification(
          "groupInvites",
          id,
          notification(id, {
            title: msg.groupName ?? "Grupa",
            subtitle: "Nowe zaproszenie do grupy",
            avatarUrl: null,
            avatarName: msg.groupName ?? "G",
            onPress: () => {
              if (useConversationsStore.getState().activeConversationId !== msg.conversationId) {
                openChatFromNotification(msg.conversationId, pathname);
              }
            },
          }),
        );
        return;
      }

      if (msg.type === "newMessage") {
        if (msg.message.senderId === userId) return;

        const convStore = useConversationsStore.getState();
        if (convStore.activeConversationId === msg.conversationId) return;

        const conv = convStore.conversations.find((c) => c.id === msg.conversationId);
        const senderName = conv?.participant?.displayName ?? "Nowa wiadomość";
        const senderAvatar = conv?.participant?.avatarUrl ?? null;
        const preview = msg.message.content.length > 60 ? `${msg.message.content.slice(0, 60)}…` : msg.message.content;

        const id = `msg-conv-${msg.conversationId}`;
        showNotification(
          "newMessages",
          id,
          notification(id, {
            title: senderName,
            subtitle: preview,
            avatarUrl: senderAvatar,
            avatarName: senderName,
            onPress: () => {
              if (useConversationsStore.getState().activeConversationId !== msg.conversationId) {
                openChatFromNotification(msg.conversationId, pathname);
              }
            },
          }),
        );
      }
    },
    [userId, pathname],
  );

  useWebSocket(handler);
}
