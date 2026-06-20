import { useLingui } from "@lingui/react/macro";
import { router, usePathname } from "expo-router";
import React, { useCallback } from "react";
import { NotificationToast } from "@/components/ui/NotificationToast";
import { openChatFromAnywhere } from "@/lib/navigation";
import { showNotification, toast } from "@/lib/toast";
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
  const { t } = useLingui();
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
            subtitle: t`Pinguje Cię!`,
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
            title: responderProfile?.displayName ?? t`Ktoś`,
            subtitle: t`Przyjął(a) Twój ping!`,
            avatarUrl: responderProfile?.avatarUrl ?? null,
            avatarName: responderProfile?.displayName ?? "?",
            onPress: () => {
              if (useConversationsStore.getState().activeConversationId !== conversationId) {
                openChatFromAnywhere(conversationId, pathname);
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
            subtitle: t`Ta osoba jest teraz niedostępna — powodów może być wiele, nie przejmuj się.`,
            avatarUrl: null,
            avatarName: "B",
            onPress: () => {},
          }),
        );
        return;
      }

      if (msg.type === "comeOver") {
        // "Podejdę osobiście" — someone Full-Nomad nearby is walking over to meet
        // (BLI-298, v4 §10.3). This is the magical "go meet in person" moment, so
        // it is shown unconditionally (not gated by message notification prefs).
        const { fromProfile, conversationId } = msg;
        const id = `come-over-${conversationId}`;
        toast.custom(
          notification(id, {
            title: t`${fromProfile.displayName} idzie do Ciebie`,
            subtitle: t`Jest blisko i chce się spotkać. Rozejrzyj się!`,
            avatarUrl: fromProfile.avatarUrl,
            avatarName: fromProfile.displayName,
            onPress: () => {
              if (useConversationsStore.getState().activeConversationId !== conversationId) {
                openChatFromAnywhere(conversationId, pathname);
              }
            },
          }),
          { id, duration: 8000 },
        );
        return;
      }

      if (msg.type === "groupInvited") {
        const id = `group-invited-${msg.conversationId}`;
        showNotification(
          "groupInvites",
          id,
          notification(id, {
            title: msg.groupName ?? t`Grupa`,
            subtitle: t`Nowe zaproszenie do grupy`,
            avatarUrl: null,
            avatarName: msg.groupName ?? "G",
            onPress: () => {
              if (useConversationsStore.getState().activeConversationId !== msg.conversationId) {
                openChatFromAnywhere(msg.conversationId, pathname);
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
        const senderName = conv?.participant?.displayName ?? t`Nowa wiadomość`;
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
                openChatFromAnywhere(msg.conversationId, pathname);
              }
            },
          }),
        );
      }
    },
    [userId, pathname, t],
  );

  useWebSocket(handler);
}
