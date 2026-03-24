import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type ViewToken } from "react-native";
import { ConversationRow } from "../../src/components/chat/ConversationRow";
import { Avatar } from "../../src/components/ui/Avatar";
import { IconChat, IconGroup } from "../../src/components/ui/icons";
import { usePrefetchMessages } from "../../src/hooks/usePrefetchMessages";
import { trpc } from "../../src/lib/trpc";
import { useConversationsStore } from "../../src/stores/conversationsStore";
import { useWavesStore } from "../../src/stores/wavesStore";
import { colors, fonts, spacing, type as typ } from "../../src/theme";

type FilterType = "all" | "dm" | "group";

const FILTER_CHIPS: { key: FilterType; label: string }[] = [
  { key: "all", label: "Wszystko" },
  { key: "dm", label: "Wiadomości" },
  { key: "group", label: "Grupy" },
];

export default function ChatsScreen() {
  const router = useRouter();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const { isLoading, refetch } = trpc.messages.getConversations.useQuery();

  // Read from conversations store (populated by _layout.tsx hydration + WS updates)
  const conversations = useConversationsStore((s) => s.conversations);
  const hydrated = useConversationsStore((s) => s._hydrated);

  // Pending pings (received) — shown above conversations
  const receivedPings = useWavesStore((s) => s.received.filter((w) => w.wave.status === "pending"));

  const filteredConversations = useMemo(() => {
    if (filter === "all") return conversations;
    return conversations.filter((c) => c.type === filter);
  }, [conversations, filter]);

  // Prefetch messages for visible conversations
  const prefetch = usePrefetchMessages();
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const token of viewableItems) {
      if (token.isViewable && token.item?.id) {
        prefetch(token.item.id);
      }
    }
  }).current;

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
          <>
            <View style={styles.filterRow}>
              {FILTER_CHIPS.map((chip) => (
                <Pressable
                  key={chip.key}
                  style={[styles.filterChip, filter === chip.key ? styles.filterChipActive : styles.filterChipInactive]}
                  onPress={() => setFilter(chip.key)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filter === chip.key ? styles.filterChipTextActive : styles.filterChipTextInactive,
                    ]}
                  >
                    {chip.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {receivedPings.length > 0 && (
              <View style={styles.pingsSection}>
                <Text style={styles.pingsSectionTitle}>OCZEKUJĄCE PINGI</Text>
                {receivedPings.map((item) => (
                  <Pressable
                    key={item.wave.id}
                    style={styles.pingRow}
                    onPress={() =>
                      router.push({
                        pathname: "/(modals)/user/[userId]",
                        params: {
                          userId: item.fromProfile.userId,
                          displayName: item.fromProfile.displayName,
                          avatarUrl: item.fromProfile.avatarUrl ?? "",
                        },
                      })
                    }
                  >
                    <Avatar uri={item.fromProfile.avatarUrl} name={item.fromProfile.displayName} size={40} />
                    <View style={styles.pingInfo}>
                      <Text style={styles.pingName}>{item.fromProfile.displayName}</Text>
                      {item.wave.senderStatusSnapshot && (
                        <Text style={styles.pingStatus} numberOfLines={1}>
                          {item.wave.senderStatusSnapshot}
                        </Text>
                      )}
                    </View>
                    <View style={styles.pingBadge}>
                      <Text style={styles.pingBadgeText}>NOWY</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <ConversationRow
            type={item.type}
            displayName={item.type === "group" ? (item.groupName ?? "Grupa") : (item.participant?.displayName ?? "")}
            avatarUrl={item.type === "group" ? item.groupAvatarUrl : (item.participant?.avatarUrl ?? null)}
            lastMessage={item.lastMessage?.content ?? null}
            lastMessageSenderName={item.lastMessage?.senderName ?? null}
            lastMessageTime={item.lastMessage?.createdAt ?? null}
            memberCount={item.memberCount ?? undefined}
            unreadCount={item.unreadCount}
            onPress={() => router.push(`/chat/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          isLoading && !hydrated ? null : filter === "group" ? (
            <View style={styles.empty} testID="chats-empty-groups">
              <IconGroup size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>Brak grup</Text>
              <Text style={styles.emptyText}>Grupy pozwalają rozmawiać z wieloma osobami naraz</Text>
              <Pressable style={styles.emptyButton} onPress={() => router.push("/(modals)/create-group")}>
                <Text style={styles.emptyButtonText}>Załóż grupę</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty} testID="chats-empty">
              <IconChat size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>Brak czatów</Text>
              <Text style={styles.emptyText}>Zacznij rozmowę odpowiadając na ping</Text>
            </View>
          )
        }
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl refreshing={isManualRefreshing} onRefresh={handleRefresh} tintColor={colors.ink} />
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
  filterRow: {
    flexDirection: "row",
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
    backgroundColor: "transparent",
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
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    textAlign: "center",
  },
  emptyButton: {
    marginTop: spacing.column,
    paddingHorizontal: spacing.section,
    paddingVertical: spacing.gutter,
    backgroundColor: colors.ink,
    borderRadius: 8,
  },
  emptyButtonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.bg,
  },
  pingsSection: {
    paddingHorizontal: spacing.section,
    marginBottom: spacing.gutter,
  },
  pingsSectionTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: spacing.gutter,
  },
  pingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  pingInfo: {
    flex: 1,
    marginLeft: spacing.gutter,
  },
  pingName: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.ink,
  },
  pingStatus: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: "#D4851C",
    marginTop: 2,
  },
  pingBadge: {
    backgroundColor: "#FFF0E0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  pingBadgeText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: "#D4851C",
  },
});
