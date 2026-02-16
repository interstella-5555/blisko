import { useCallback } from 'react';
import { router } from 'expo-router';
import { useWebSocket, type WSMessage } from '../lib/ws';
import { useAuthStore } from '../stores/authStore';
import { useConversationsStore } from '../stores/conversationsStore';
import { useNotification } from '../providers/NotificationProvider';

export function useInAppNotifications() {
  const userId = useAuthStore((s) => s.user?.id);
  const { showNotification } = useNotification();

  const handler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === 'newWave') {
        const { fromProfile, wave } = msg;
        showNotification({
          id: `wave-${wave.id}`,
          title: fromProfile.displayName,
          subtitle: 'Zaczepił(a) Cię!',
          avatarUrl: fromProfile.avatarUrl,
          avatarName: fromProfile.displayName,
          onPress: () => {
            router.push({
              pathname: '/(modals)/user/[userId]',
              params: { userId: wave.fromUserId },
            });
          },
        });
        return;
      }

      if (msg.type === 'waveResponded' && msg.accepted && msg.conversationId) {
        const { responderProfile } = msg;
        showNotification({
          id: `wave-responded-${msg.waveId}`,
          title: responderProfile.displayName,
          subtitle: 'Przyjął(a) Twoją zaczepkę!',
          avatarUrl: responderProfile.avatarUrl,
          avatarName: responderProfile.displayName,
          onPress: () => {
            router.push(`/(modals)/chat/${msg.conversationId}`);
          },
        });
        return;
      }

      if (msg.type === 'newMessage') {
        // Skip own messages
        if (msg.message.senderId === userId) return;

        // Skip if user is viewing this conversation
        const convStore = useConversationsStore.getState();
        if (convStore.activeConversationId === msg.conversationId) return;

        // Look up participant name from conversations store
        const conv = convStore.conversations.find(
          (c) => c.id === msg.conversationId
        );
        const senderName = conv?.participant?.displayName ?? 'Nowa wiadomość';
        const senderAvatar = conv?.participant?.avatarUrl ?? null;

        const preview =
          msg.message.content.length > 60
            ? msg.message.content.slice(0, 60) + '…'
            : msg.message.content;

        showNotification({
          id: `msg-${msg.message.id}`,
          title: senderName,
          subtitle: preview,
          avatarUrl: senderAvatar,
          avatarName: senderName,
          onPress: () => {
            router.push(`/(modals)/chat/${msg.conversationId}`);
          },
        });
      }
    },
    [userId, showNotification]
  );

  useWebSocket(handler);
}
