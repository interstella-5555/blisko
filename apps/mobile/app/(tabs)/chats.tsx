import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { trpc } from '../../src/lib/trpc';
import { useWebSocket } from '../../src/lib/ws';
import { colors, type as typ, spacing } from '../../src/theme';
import { IconChat } from '../../src/components/ui/icons';
import { ConversationRow } from '../../src/components/chat/ConversationRow';

export default function ChatsScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const utilsRef = useRef(utils);
  utilsRef.current = utils;
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const { data, isLoading, refetch } = trpc.messages.getConversations.useQuery();

  // WebSocket: update conversation list on new messages
  const wsHandler = useCallback(
    (msg: any) => {
      if (msg.type === 'newMessage') {
        utilsRef.current.messages.getConversations.refetch();
      }
    },
    []
  );
  useWebSocket(wsHandler);

  const handleRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch]);

  return (
    <View style={styles.container} testID="chats-screen">
      <FlatList
        testID="chats-list"
        data={data ?? []}
        keyExtractor={(item) => item.conversation.id}
        renderItem={({ item }) => (
          <ConversationRow
            displayName={item.participant?.displayName ?? ''}
            avatarUrl={item.participant?.avatarUrl ?? null}
            lastMessage={item.lastMessage?.content ?? null}
            lastMessageTime={item.lastMessage?.createdAt?.toString() ?? null}
            unreadCount={item.unreadCount}
            onPress={() => router.push(`/(modals)/chat/${item.conversation.id}`)}
          />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty} testID="chats-empty">
              <IconChat size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>Brak czatów</Text>
              <Text style={styles.emptyText}>
                Zacznij rozmowę odpowiadając na zaczepienie
              </Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.ink}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
    paddingHorizontal: spacing.section,
  },
  emptyTitle: {
    ...typ.heading,
    marginTop: spacing.column,
    marginBottom: spacing.tight,
  },
  emptyText: {
    ...typ.body,
    color: colors.muted,
    textAlign: 'center',
  },
});
