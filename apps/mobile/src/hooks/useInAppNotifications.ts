import { router } from "expo-router";
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

export function useInAppNotifications() {
  const userId = useAuthStore((s) => s.user?.id);

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
        const { responderProfile } = msg;
        const id = `wave-responded-${msg.waveId}`;
        showNotification(
          "waveResponses",
          id,
          notification(id, {
            title: responderProfile?.displayName ?? "Ktoś",
            subtitle: "Przyjął(a) Twój ping!",
            avatarUrl: responderProfile?.avatarUrl ?? null,
            avatarName: responderProfile?.displayName ?? "?",
            onPress: () => router.push(`/chat/${msg.conversationId}`),
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
            onPress: () => router.push(`/chat/${msg.conversationId}`),
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

        const id = `msg-${msg.message.id}`;
        showNotification(
          "newMessages",
          id,
          notification(id, {
            title: senderName,
            subtitle: preview,
            avatarUrl: senderAvatar,
            avatarName: senderName,
            onPress: () => router.push(`/chat/${msg.conversationId}`),
          }),
        );
      }
    },
    [userId],
  );

  useWebSocket(handler);
}
