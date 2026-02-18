import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, type ViewToken } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { trpc } from '../../src/lib/trpc';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { IconChat } from '../../src/components/ui/icons';
import { ConversationRow } from '../../src/components/chat/ConversationRow';
import { useConversationsStore, type ConversationEntry } from '../../src/stores/conversationsStore';
import { usePrefetchMessages } from '../../src/hooks/usePrefetchMessages';

type FilterType = 'all' | 'dm' | 'group';

const FILTER_CHIPS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'Wszystko' },
  { key: 'dm', label: 'Wiadomości' },
  { key: 'group', label: 'Grupy' },
];

export default function ChatsScreen() {
  const router = useRouter();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const { isLoading, refetch } = trpc.messages.getConversations.useQuery();

  // Read from conversations store (populated by _layout.tsx hydration + WS updates)
  const conversations = useConversationsStore((s) => s.conversations);
  const hydrated = useConversationsStore((s) => s._hydrated);

  const filteredConversations = useMemo(() => {
    if (filter === 'all') return conversations;
    return conversations.filter((c) => c.type === filter);
  }, [conversations, filter]);

  // Prefetch messages for visible conversations
  const prefetch = usePrefetchMessages();
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const token of viewableItems) {
        if (token.isViewable && token.item?.id) {
          prefetch(token.item.id);
        }
      }
    },
  ).current;

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
        data={filteredConversations}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.filterRow}>
            {FILTER_CHIPS.map((chip) => (
              <Pressable
                key={chip.key}
                style={[
                  styles.filterChip,
                  filter === chip.key
                    ? styles.filterChipActive
                    : styles.filterChipInactive,
                ]}
                onPress={() => setFilter(chip.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === chip.key
                      ? styles.filterChipTextActive
                      : styles.filterChipTextInactive,
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <ConversationRow
            type={item.type}
            displayName={
              item.type === 'group'
                ? item.groupName ?? 'Grupa'
                : item.participant?.displayName ?? ''
            }
            avatarUrl={
              item.type === 'group'
                ? item.groupAvatarUrl
                : item.participant?.avatarUrl ?? null
            }
            lastMessage={item.lastMessage?.content ?? null}
            lastMessageSenderName={item.lastMessage?.senderName ?? null}
            lastMessageTime={item.lastMessage?.createdAt ?? null}
            memberCount={item.memberCount ?? undefined}
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
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.ink}
          />
        }
      />
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/(modals)/create-group')}
        testID="create-group-fab"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.tight,
    paddingHorizontal: spacing.section,
    marginBottom: spacing.gutter,
    marginTop: spacing.gutter,
  },
  filterChip: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.tick,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  filterChipInactive: {
    backgroundColor: 'transparent',
    borderColor: colors.rule,
  },
  filterChipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  filterChipTextActive: {
    color: colors.bg,
  },
  filterChipTextInactive: {
    color: colors.ink,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.section,
    right: spacing.section,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  fabText: {
    fontFamily: fonts.sans,
    fontSize: 24,
    color: colors.bg,
    marginTop: -2,
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
