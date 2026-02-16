import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { trpc } from '../../src/lib/trpc';
import { colors, type as typ, spacing } from '../../src/theme';
import { IconChat } from '../../src/components/ui/icons';
import { ConversationRow } from '../../src/components/chat/ConversationRow';
import { useConversationsStore } from '../../src/stores/conversationsStore';

export default function ChatsScreen() {
  const router = useRouter();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const { isLoading, refetch } = trpc.messages.getConversations.useQuery();

  // Read from conversations store (populated by _layout.tsx hydration + WS updates)
  const conversations = useConversationsStore((s) => s.conversations);
  const hydrated = useConversationsStore((s) => s._hydrated);

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
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationRow
            displayName={item.participant?.displayName ?? ''}
            avatarUrl={item.participant?.avatarUrl ?? null}
            lastMessage={item.lastMessage?.content ?? null}
            lastMessageTime={item.lastMessage?.createdAt ?? null}
            unreadCount={item.unreadCount}
            onPress={() => router.push(`/(modals)/chat/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          isLoading && !hydrated ? null : (
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
