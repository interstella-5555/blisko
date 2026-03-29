import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type ViewToken } from "react-native";
import { ConversationRow } from "../../src/components/chat/ConversationRow";
import { Avatar } from "../../src/components/ui/Avatar";
import { IconChat, IconGroup } from "../../src/components/ui/icons";
import { SonarDot } from "../../src/components/ui/SonarDot";
import { usePrefetchMessages } from "../../src/hooks/usePrefetchMessages";
import { trpc } from "../../src/lib/trpc";
import { useConversationsStore } from "../../src/stores/conversationsStore";
import { useWavesStore } from "../../src/stores/wavesStore";
import { colors, fonts, spacing, type as typ } from "../../src/theme";

type FilterType = "all" | "unread" | "group" | "pings";

const FILTER_PILLS: { key: Exclude<FilterType, "pings">; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "unread", label: "Nieprzeczytane" },
  { key: "group", label: "Grupy" },
];

function formatTimeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "teraz";
  if (diffMins < 60) return `${diffMins} min temu`;
  if (diffHours < 24) return `${diffHours} godz. temu`;
  if (diffDays < 7) return `${diffDays} dni temu`;
  return new Date(dateString).toLocaleDateString("pl-PL");
}

export default function ChatsScreen() {
  const router = useRouter();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const { isLoading, refetch } = trpc.messages.getConversations.useQuery();

  const conversations = useConversationsStore((s) => s.conversations);
  const hydrated = useConversationsStore((s) => s._hydrated);

  const received = useWavesStore((s) => s.received);
  const viewedWaveIds = useWavesStore((s) => s.viewedWaveIds);
  const pendingPings = useMemo(
    () =>
      received
        .filter((w) => w.wave.status === "pending")
        .sort((a, b) => new Date(a.wave.createdAt).getTime() - new Date(b.wave.createdAt).getTime()),
    [received],
  );
  const unviewedPingCount = useMemo(
    () => pendingPings.filter((p) => !viewedWaveIds.has(p.wave.id)).length,
    [pendingPings, viewedWaveIds],
  );

  const deleteConversation = trpc.messages.deleteConversation.useMutation({
    onSuccess: (_, variables) => {
      useConversationsStore.getState().remove(variables.conversationId);
    },
  });

  const handleDeleteChat = (conversationId: string) => {
    Alert.alert("Jak było?", "Oceń rozmowę przed usunięciem", [
      ...[1, 2, 3, 4, 5].map((n) => ({
        text: "★".repeat(n),
        onPress: () => deleteConversation.mutate({ conversationId, rating: n }),
      })),
      {
        text: "Pomiń i usuń",
        style: "destructive" as const,
        onPress: () => deleteConversation.mutate({ conversationId }),
      },
      { text: "Anuluj", style: "cancel" as const },
    ]);
  };

  const filteredConversations = useMemo(() => {
    if (filter === "unread") return conversations.filter((c) => c.unreadCount > 0);
    if (filter === "group") return conversations.filter((c) => c.type === "group");
    return conversations;
  }, [conversations, filter]);

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

  const handlePingPress = (ping: (typeof pendingPings)[0]) => {
    useWavesStore.getState().markViewed(ping.wave.id);
    router.push({
      pathname: "/(modals)/user/[userId]",
      params: {
        userId: ping.fromProfile.userId,
        displayName: ping.fromProfile.displayName,
        avatarUrl: ping.fromProfile.avatarUrl ?? "",
      },
    });
  };

  const showPings = filter === "pings";

  return (
    <View style={styles.container} testID="chats-screen">
      {/* Filter pills */}
      <View style={styles.pillRow}>
        {FILTER_PILLS.map((pill) => (
          <Pressable
            key={pill.key}
            style={[styles.pill, filter === pill.key && styles.pillActive]}
            onPress={() => setFilter(pill.key)}
          >
            <Text style={[styles.pillText, filter === pill.key && styles.pillTextActive]}>{pill.label}</Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable
          style={[styles.sonarPill, filter === "pings" && styles.pillActive]}
          onPress={() => setFilter(filter === "pings" ? "all" : "pings")}
        >
          <SonarDot size={7} color={filter === "pings" ? colors.bg : colors.muted} />
          {unviewedPingCount > 0 && (
            <View style={[styles.sonarBadge, filter === "pings" && styles.sonarBadgeActive]}>
              <Text style={styles.sonarBadgeText}>{unviewedPingCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {showPings ? (
        /* Pings list */
        pendingPings.length > 0 ? (
          <FlatList
            testID="pings-list"
            data={pendingPings}
            keyExtractor={(item) => item.wave.id}
            renderItem={({ item }) => {
              const isUnviewed = !viewedWaveIds.has(item.wave.id);
              return (
                <Pressable style={styles.pingRow} onPress={() => handlePingPress(item)}>
                  <Avatar uri={item.fromProfile.avatarUrl} name={item.fromProfile.displayName} size={48} />
                  <View style={styles.pingBody}>
                    <View style={styles.pingTopLine}>
                      <Text style={styles.pingName}>{item.fromProfile.displayName}</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={styles.pingTime}>{formatTimeAgo(item.wave.createdAt)}</Text>
                      {isUnviewed && <View style={styles.unviewedDot} />}
                    </View>
                    {item.fromProfile.bio && (
                      <Text style={styles.pingBio} numberOfLines={1}>
                        {item.fromProfile.bio}
                      </Text>
                    )}
                    {item.wave.senderStatusSnapshot && (
                      <View style={styles.pingStatusBar}>
                        <Text style={styles.pingStatusLabel}>SZUKA TERAZ</Text>
                        <Text style={styles.pingStatusText} numberOfLines={2}>
                          {item.wave.senderStatusSnapshot}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            }}
            refreshControl={
              <RefreshControl refreshing={isManualRefreshing} onRefresh={handleRefresh} tintColor={colors.ink} />
            }
          />
        ) : (
          <View style={styles.emptyPings}>
            <SonarDot size={14} color={colors.muted} />
            <Text style={styles.emptyTitle}>Brak pingów</Text>
            <Text style={styles.emptyText}>Kiedy ktoś Cię pingnie, pojawi się tutaj</Text>
          </View>
        )
      ) : (
        /* Conversations list */
        <FlatList
          testID="chats-list"
          data={filteredConversations}
          keyExtractor={(item) => item.id}
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
              onLongPress={() => handleDeleteChat(item.id)}
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
            ) : filter === "unread" ? (
              <View style={styles.empty} testID="chats-empty-unread">
                <IconChat size={48} color={colors.muted} />
                <Text style={styles.emptyTitle}>Wszystko przeczytane</Text>
                <Text style={styles.emptyText}>Żadnych nieprzeczytanych wiadomości</Text>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Pills
  pillRow: {
    flexDirection: "row",
    gap: spacing.tight,
    paddingHorizontal: spacing.section,
    marginBottom: spacing.gutter,
    marginTop: spacing.gutter,
    alignItems: "center",
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#EDEAE4",
  },
  pillActive: {
    backgroundColor: colors.ink,
  },
  pillText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.ink,
  },
  pillTextActive: {
    color: colors.bg,
  },
  // Sonar pill
  sonarPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#EDEAE4",
    position: "relative",
  },
  sonarBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: colors.accent,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: "#EDEAE4",
    zIndex: 3,
  },
  sonarBadgeActive: {
    borderColor: colors.ink,
  },
  sonarBadgeText: {
    fontFamily: fonts.sansSemiBold,
    color: "#FFFFFF",
    fontSize: 11,
  },
  // Ping rows
  pingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: spacing.section,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  pingBody: {
    flex: 1,
    marginLeft: spacing.gutter,
  },
  pingTopLine: {
    flexDirection: "row",
    alignItems: "center",
  },
  pingName: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.ink,
  },
  pingTime: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.muted,
  },
  unviewedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginLeft: 6,
  },
  pingBio: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  pingStatusBar: {
    marginTop: 8,
    backgroundColor: "#FFF8F0",
    borderLeftWidth: 2.5,
    borderLeftColor: "#D4851C",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  pingStatusLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: "#D4851C",
    marginBottom: 1,
  },
  pingStatusText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
  // Empty states
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 100,
    paddingHorizontal: spacing.section,
  },
  emptyPings: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.section,
    gap: spacing.tight,
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
});
