import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ConversationRow } from "@/components/chat/ConversationRow";
import { Avatar } from "@/components/ui/Avatar";
import { IconChat } from "@/components/ui/icons";
import { SonarDot } from "@/components/ui/SonarDot";
import { useIsGhost } from "@/hooks/useIsGhost";
import { trpc, vanillaClient } from "@/lib/trpc";
import { useConversationsStore } from "@/stores/conversationsStore";
import { rawToEnriched, useMessagesStore } from "@/stores/messagesStore";
import { useWavesStore } from "@/stores/wavesStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

type FilterType = "all" | "unread" | "pings";

const FILTER_PILLS: { key: FilterType; label: string }[] = [
  { key: "all", label: "Rozmowy" },
  { key: "pings", label: "Pingi" },
  { key: "unread", label: "Nieprzeczytane" },
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
  const isGhost = useIsGhost();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const { isLoading, refetch } = trpc.messages.getConversations.useQuery();
  const utils = trpc.useUtils();

  const conversations = useConversationsStore((s) => s.conversations);
  const hydrated = useConversationsStore((s) => s._hydrated);

  const received = useWavesStore((s) => s.received);
  const viewedWaveIds = useWavesStore((s) => s.viewedWaveIds);
  const allReceivedPings = useMemo(
    () => [...received].sort((a, b) => new Date(b.wave.createdAt).getTime() - new Date(a.wave.createdAt).getTime()),
    [received],
  );
  const pendingPings = useMemo(() => allReceivedPings.filter((w) => w.wave.status === "pending"), [allReceivedPings]);
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

  const unreadConversations = useMemo(() => conversations.filter((c) => c.unreadCount > 0), [conversations]);

  type UnreadItem =
    | { kind: "ping"; createdAt: string; data: (typeof pendingPings)[number] }
    | { kind: "convo"; createdAt: string; data: (typeof conversations)[number] };

  const unreadItems = useMemo<UnreadItem[]>(() => {
    const pings: UnreadItem[] = pendingPings
      .filter((p) => !viewedWaveIds.has(p.wave.id))
      .map((p) => ({ kind: "ping", createdAt: p.wave.createdAt, data: p }));
    const convos: UnreadItem[] = unreadConversations.map((c) => ({
      kind: "convo",
      createdAt: c.lastMessage?.createdAt ?? new Date(0).toISOString(),
      data: c,
    }));
    return [...pings, ...convos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [pendingPings, viewedWaveIds, unreadConversations]);

  const totalUnreadItemCount = unreadItems.length;

  // Eager preload top 15 conversations with 1 message each (runs once after hydration)
  const hasPreloaded = useRef(false);
  useEffect(() => {
    if (!hydrated || hasPreloaded.current) return;
    hasPreloaded.current = true;
    const store = useMessagesStore.getState();
    const { conversations } = useConversationsStore.getState();

    conversations
      .slice(0, 15)
      .filter((c) => !store.hasChat(c.id))
      .forEach((conv) => {
        vanillaClient.messages.getMessages
          .query({ conversationId: conv.id, limit: 1 })
          .then((res) => {
            if (!store.hasChat(conv.id) && res.messages.length > 0) {
              const msg = res.messages[0];
              store.hydrate(conv.id, [rawToEnriched(msg, conv.id)], true, msg.seq);
            }
          })
          .catch(() => {});
      });
  }, [hydrated]);

  const handleRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([refetch(), utils.waves.getReceived.refetch(), utils.waves.getSent.refetch()]);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch, utils.waves.getReceived, utils.waves.getSent]);

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
  const showUnread = filter === "unread";

  return (
    <View style={styles.container} testID="chats-screen">
      {/* Filter pills */}
      <View style={styles.pillRow}>
        {FILTER_PILLS.map((pill) => {
          const isActive = filter === pill.key;
          const isUnread = pill.key === "unread";
          return (
            <Pressable
              key={pill.key}
              style={[styles.pill, isActive && styles.pillActive, isUnread && styles.unreadPill]}
              onPress={() => setFilter(pill.key)}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{pill.label}</Text>
              {isUnread && totalUnreadItemCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{totalUnreadItemCount}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {showPings ? (
        /* Pings tab — full history (pending + accepted + declined) sorted newest first */
        allReceivedPings.length > 0 ? (
          <FlatList
            key="pings-list"
            testID="pings-list"
            data={allReceivedPings}
            keyExtractor={(item) => item.wave.id}
            renderItem={({ item }) =>
              renderPingRow(
                item,
                item.wave.status === "pending" && !viewedWaveIds.has(item.wave.id),
                isGhost,
                handlePingPress,
              )
            }
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
      ) : showUnread ? (
        /* Mixed unread inbox: pings (unviewed) + unread conversations, sorted chronologically */
        <FlatList
          key="unread-list"
          testID="unread-list"
          data={unreadItems}
          keyExtractor={(item) => (item.kind === "ping" ? `p-${item.data.wave.id}` : `c-${item.data.id}`)}
          renderItem={({ item }) =>
            item.kind === "ping" ? (
              renderPingRow(item.data, true, isGhost, handlePingPress)
            ) : (
              <ConversationRow
                type={item.data.type}
                displayName={
                  item.data.type === "group"
                    ? (item.data.groupName ?? "Grupa")
                    : (item.data.participant?.displayName ?? "")
                }
                avatarUrl={
                  item.data.type === "group" ? item.data.groupAvatarUrl : (item.data.participant?.avatarUrl ?? null)
                }
                lastMessage={item.data.lastMessage?.content ?? null}
                lastMessageSenderName={item.data.lastMessage?.senderName ?? null}
                lastMessageTime={item.data.lastMessage?.createdAt ?? null}
                memberCount={item.data.memberCount ?? undefined}
                unreadCount={item.data.unreadCount}
                muted={item.data.mutedUntil != null && new Date(item.data.mutedUntil) > new Date()}
                onPress={() => router.push(`/chat/${item.data.id}`)}
                onLongPress={() => handleDeleteChat(item.data.id)}
              />
            )
          }
          ListEmptyComponent={
            isLoading && !hydrated ? null : (
              <View style={styles.empty} testID="chats-empty-unread">
                <IconChat size={48} color={colors.muted} />
                <Text style={styles.emptyTitle}>Wszystko ogarnięte</Text>
                <Text style={styles.emptyText}>Żadnych pingów ani nieprzeczytanych wiadomości</Text>
              </View>
            )
          }
          refreshControl={
            <RefreshControl refreshing={isManualRefreshing} onRefresh={handleRefresh} tintColor={colors.ink} />
          }
        />
      ) : (
        /* All conversations */
        <FlatList
          key="chats-list"
          testID="chats-list"
          data={conversations}
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
              muted={item.mutedUntil != null && new Date(item.mutedUntil) > new Date()}
              onPress={() => router.push(`/chat/${item.id}`)}
              onLongPress={() => handleDeleteChat(item.id)}
            />
          )}
          ListEmptyComponent={
            isLoading && !hydrated ? null : (
              <View style={styles.empty} testID="chats-empty">
                <IconChat size={48} color={colors.muted} />
                <Text style={styles.emptyTitle}>Brak czatów</Text>
                <Text style={styles.emptyText}>Zacznij rozmowę odpowiadając na ping</Text>
              </View>
            )
          }
          refreshControl={
            <RefreshControl refreshing={isManualRefreshing} onRefresh={handleRefresh} tintColor={colors.ink} />
          }
        />
      )}
    </View>
  );
}

const STATUS_LABEL: Record<string, string> = {
  accepted: "Zaakceptowane",
  declined: "Odrzucone",
  expired: "Wygasł",
};

function renderPingRow(
  item: {
    wave: { id: string; status: string; createdAt: string; senderStatusSnapshot?: string | null };
    fromProfile: { displayName: string; avatarUrl: string | null; bio?: string | null };
  },
  isUnviewed: boolean,
  isGhost: boolean,
  onPress: (item: never) => void,
) {
  const isPending = item.wave.status === "pending";
  const statusLabel = !isPending ? STATUS_LABEL[item.wave.status] : null;
  return (
    <Pressable style={styles.pingRow} onPress={() => onPress(item as never)}>
      <Avatar uri={item.fromProfile.avatarUrl} name={item.fromProfile.displayName} size={48} blurred={isGhost} />
      <View style={styles.pingBody}>
        <View style={styles.pingTopLine}>
          <Text style={styles.pingName}>{item.fromProfile.displayName}</Text>
          <View style={{ flex: 1 }} />
          {statusLabel && <Text style={styles.pingStatusLabel}>{statusLabel}</Text>}
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
            <Text style={styles.pingStatusText} numberOfLines={2}>
              {item.wave.senderStatusSnapshot}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
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
  // Nieprzeczytane pill — text + inline badge with item count (pings + unread convos)
  unreadPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unreadBadge: {
    backgroundColor: colors.accent,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  unreadBadgeText: {
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
  pingStatusLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
    marginRight: 8,
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
});
