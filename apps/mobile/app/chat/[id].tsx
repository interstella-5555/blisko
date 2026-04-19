import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardStickyView, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChatInput } from "@/components/chat/ChatInput";
import { type BubblePosition, MessageBubble } from "@/components/chat/MessageBubble";
import { type ContextMenuData, MessageContextMenu } from "@/components/chat/MessageContextMenu";
import { Avatar } from "@/components/ui/Avatar";
import { IconBell, IconBellOff, IconChevronLeft } from "@/components/ui/icons";
import { useIsGhost } from "@/hooks/useIsGhost";
import { trpc } from "@/lib/trpc";
import { useTypingIndicator } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import { useConversationsStore } from "@/stores/conversationsStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { useProfilesStore } from "@/stores/profilesStore";
import { colors, fonts, layout, spacing } from "@/theme";

// Deterministic color from userId hash for group sender labels
// Module-level empty array — stable reference for the fallback when a
// conversation's cache is missing. Inline `?? []` creates a new array on every
// selector call, breaking Zustand's getSnapshot identity check.
const EMPTY_MESSAGES: never[] = [];

const SENDER_COLORS = ["#C0392B", "#2980B9", "#27AE60", "#8E44AD", "#D35400", "#16A085", "#2C3E50", "#E67E22"];
function getSenderColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

export default function ChatScreen() {
  const { id: conversationId, topicId } = useLocalSearchParams<{
    id: string;
    topicId?: string;
  }>();
  const userId = useAuthStore((state) => state.user?.id);
  const isGhost = useIsGhost();
  const flatListRef = useRef<FlatList>(null);

  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    content: string;
    senderName: string;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [chatInputHeight, setChatInputHeight] = useState(72);
  const handleChatInputLayout = (e: LayoutChangeEvent) => {
    setChatInputHeight(e.nativeEvent.layout.height);
  };
  const messageRefs = useRef(new Map<string, View>());

  // Animated spacer rendered as inverted-list header (= visual bottom) to keep
  // newest messages above the keyboard while KeyboardStickyView lifts the input.
  // `useReanimatedKeyboardAnimation().height.value` is NEGATIVE when the keyboard
  // is open (library convention for "lift content by this delta"), so negate it.
  const keyboard = useReanimatedKeyboardAnimation();
  const keyboardSpacerStyle = useAnimatedStyle(() => ({ height: -keyboard.height.value }));

  // Store selectors
  const storeConversation = useConversationsStore((s) => s.conversations.find((c) => c.id === conversationId));
  const isGroup = storeConversation?.type === "group";
  const participantName = isGroup
    ? (storeConversation?.groupName ?? "Grupa")
    : (storeConversation?.participant?.displayName ?? "Czat");

  const isMuted = storeConversation?.mutedUntil != null && new Date(storeConversation.mutedUntil) > new Date();

  // Mute stays as tRPC hook — it's a conversation concern, not messages
  const muteConversation = trpc.messages.muteConversation.useMutation({
    onSuccess: (data) => {
      useConversationsStore.getState().setMutedUntil(conversationId!, data.mutedUntil.toString());
    },
  });
  const unmuteConversation = trpc.messages.unmuteConversation.useMutation({
    onSuccess: () => {
      useConversationsStore.getState().setMutedUntil(conversationId!, null);
    },
  });

  const handleMuteToggle = () => {
    if (isMuted) {
      unmuteConversation.mutate({ conversationId: conversationId! });
    } else {
      Alert.alert("Wycisz powiadomienia", "Na jak długo?", [
        {
          text: "1 godzinę",
          onPress: () => muteConversation.mutate({ conversationId: conversationId!, duration: "1h" }),
        },
        {
          text: "8 godzin",
          onPress: () => muteConversation.mutate({ conversationId: conversationId!, duration: "8h" }),
        },
        {
          text: "Na zawsze",
          onPress: () => muteConversation.mutate({ conversationId: conversationId!, duration: "forever" }),
        },
        { text: "Anuluj", style: "cancel" },
      ]);
    }
  };

  // Messages from store — single source of truth.
  // Subscribe once to the whole cache object (stable reference until the cache
  // mutates). Deriving `?? []` inside the selector returns a new empty array
  // each call when cache is missing, which trips React's getSnapshot cache
  // check (infinite loop) — so derive primitives after the selector.
  const cache = useMessagesStore((s) => s.chats.get(conversationId!));
  const allMessages = cache?.items ?? EMPTY_MESSAGES;
  const hasOlder = cache?.hasOlder ?? true;
  const cacheStatus = cache?.status;

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Fetch on mount if no data or partial
  useEffect(() => {
    if (!conversationId) return;
    const store = useMessagesStore.getState();
    const cache = store.getChat(conversationId);
    if (!cache || cache.status === "partial") {
      setIsLoading(true);
      setFetchError(false);
      store
        .fetchMessages(conversationId, { limit: 50 })
        .catch(() => setFetchError(true))
        .finally(() => setIsLoading(false));
    }
    store.markAsRead(conversationId);
    useConversationsStore.getState().setActiveConversation(conversationId);
    return () => {
      if (conversationId) {
        useMessagesStore.getState().markAsRead(conversationId);
      }
      useConversationsStore.getState().setActiveConversation(null);
    };
  }, [conversationId]);

  // Bubble position for message grouping
  const getGroupInfo = (index: number) => {
    const msg = allMessages[index];
    if (!msg) return { position: "solo" as BubblePosition, isLastInGroup: true };

    const above = allMessages[index + 1];
    const below = allMessages[index - 1];

    const sameSenderAbove = above && above.senderId === msg.senderId && !above.deletedAt;
    const sameSenderBelow = below && below.senderId === msg.senderId && !below.deletedAt;

    let position: BubblePosition;
    if (sameSenderAbove && sameSenderBelow) position = "mid";
    else if (sameSenderAbove && !sameSenderBelow) position = "last";
    else if (!sameSenderAbove && sameSenderBelow) position = "first";
    else position = "solo";

    const isLastInGroup = position === "solo" || position === "last";
    return { position, isLastInGroup };
  };

  // Typing indicators
  const { isTyping: someoneTyping, typingUserIds, sendTyping } = useTypingIndicator(conversationId);

  // Simple handlers — lifecycle-safe via store
  const handleSend = (text: string, replyToId?: string) => {
    if (!conversationId || !userId) return;
    useMessagesStore.getState().send(conversationId, text, {
      userId,
      replyToId,
      replyTo: replyingTo,
      topicId,
    });
  };

  const handleLoadMore = () => {
    if (!hasOlder || isLoadingMore || !conversationId) return;
    const cache = useMessagesStore.getState().getChat(conversationId);
    if (!cache?.oldestSeq) return;
    setIsLoadingMore(true);
    useMessagesStore
      .getState()
      .fetchMessages(conversationId, { limit: 50, cursor: cache.oldestSeq })
      .finally(() => setIsLoadingMore(false));
  };

  const handleLongPress = (messageId: string, isMine: boolean, bubbleProps: ContextMenuData["bubbleProps"]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const viewRef = messageRefs.current.get(messageId);
    if (!viewRef) return;

    const keyboardVisible = Keyboard.isVisible?.() ?? false;
    if (keyboardVisible) Keyboard.dismiss();

    const delay = keyboardVisible ? (Platform.OS === "ios" ? 350 : 100) : 0;

    setTimeout(() => {
      viewRef.measureInWindow((x, y, width, height) => {
        if (width === 0 && height === 0) return;
        setContextMenu({ messageId, isMine, layout: { x, y, width, height }, bubbleProps });
      });
    }, delay);
  };

  const handleReactionPress = (messageId: string, emoji: string) => {
    useMessagesStore.getState().react(messageId, emoji);
  };

  const handleSendImage = async () => {
    if (!conversationId || !userId) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.fileName || "photo.jpg",
        type: asset.mimeType || "image/jpeg",
      } as unknown as Blob);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
      const response = await fetch(`${apiUrl}/uploads`, {
        method: "POST",
        body: formData,
        headers: {
          authorization: `Bearer ${useAuthStore.getState().session?.token || ""}`,
        },
      });

      if (!response.ok) throw new Error("Upload failed");
      const { url } = await response.json();

      useMessagesStore.getState().send(conversationId, "[Zdjęcie]", {
        userId,
        type: "image",
        metadata: { imageUrl: url, width: asset.width, height: asset.height },
      });
    } catch {
      Alert.alert("Błąd", "Nie udało się wysłać zdjęcia");
    }
  };

  const handleSendLocation = async () => {
    if (!conversationId || !userId) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Brak uprawnień", "Pozwól na dostęp do lokalizacji w ustawieniach.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      useMessagesStore.getState().send(conversationId, "Moja lokalizacja", {
        userId,
        type: "location",
        metadata: { latitude: location.coords.latitude, longitude: location.coords.longitude },
      });
    } catch {
      Alert.alert("Błąd", "Nie udało się pobrać lokalizacji");
    }
  };

  // Resolve typing user names for groups
  const typingDisplayNames = useMemo(() => {
    if (!isGroup) return [];
    return typingUserIds.map((uid) => {
      const profile = useProfilesStore.getState().get(uid);
      return profile?.displayName ?? "Ktoś";
    });
  }, [isGroup, typingUserIds]);

  const headerAvatarUrl = isGroup ? storeConversation?.groupAvatarUrl : storeConversation?.participant?.avatarUrl;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          header: () => (
            <SafeAreaView edges={["top"]} style={styles.headerSafeArea}>
              <View style={styles.header}>
                <Pressable testID="chat-back-btn" onPress={() => router.back()} style={styles.headerBack} hitSlop={8}>
                  <IconChevronLeft size={24} color={colors.ink} />
                </Pressable>
                <Pressable
                  style={styles.headerLeft}
                  onPress={
                    isGroup
                      ? () => router.push(`/(modals)/group/${conversationId}`)
                      : storeConversation?.participant?.userId
                        ? () =>
                            router.push({
                              pathname: "/(modals)/user/[userId]",
                              params: {
                                userId: storeConversation.participant!.userId,
                                displayName: storeConversation.participant!.displayName,
                                avatarUrl: storeConversation.participant!.avatarUrl ?? "",
                              },
                            })
                        : undefined
                  }
                >
                  <Avatar uri={headerAvatarUrl} name={participantName} size={32} blurred={isGhost} />
                  <View>
                    <Text style={styles.headerName} numberOfLines={1}>
                      {participantName}
                    </Text>
                    {isGroup && storeConversation?.memberCount != null && (
                      <Text style={styles.headerSubtitle}>{storeConversation.memberCount} członków</Text>
                    )}
                  </View>
                </Pressable>
                <Pressable onPress={handleMuteToggle} hitSlop={8} style={{ width: 24 }}>
                  {isMuted ? (
                    <IconBellOff size={20} color={colors.muted} />
                  ) : (
                    <IconBell size={20} color={colors.muted} />
                  )}
                </Pressable>
              </View>
            </SafeAreaView>
          ),
        }}
      />

      {typeof storeConversation?.metadata?.connectedAt === "string" && (
        <View style={styles.firstContactCard}>
          <Text style={styles.firstContactText}>
            {new Date(storeConversation.metadata.connectedAt).toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "long",
            })}
            {storeConversation.metadata.connectedDistance != null &&
              ` · ~${storeConversation.metadata.connectedDistance}m od siebie`}
          </Text>
          {(typeof storeConversation.metadata.senderStatus === "string" ||
            typeof storeConversation.metadata.recipientStatus === "string") && (
            <View style={styles.snapshotStatuses}>
              {typeof storeConversation.metadata.recipientStatus === "string" && (
                <View style={styles.snapshotRow}>
                  <Text style={styles.snapshotLabel}>{participantName}</Text>
                  <View style={styles.snapshotPillTheirs}>
                    <Text style={styles.snapshotPillTheirsText}>
                      {storeConversation.metadata.recipientStatus as string}
                    </Text>
                  </View>
                </View>
              )}
              {typeof storeConversation.metadata.senderStatus === "string" && (
                <View style={styles.snapshotRowMine}>
                  <Text style={styles.snapshotLabel}>Ty</Text>
                  <View style={styles.snapshotPillMine}>
                    <Text style={styles.snapshotPillMineText}>{storeConversation.metadata.senderStatus as string}</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      <FlatList
        ref={flatListRef}
        testID="message-list"
        data={allMessages}
        keyExtractor={(item) => item.id}
        scrollEnabled={!contextMenu}
        keyboardDismissMode="interactive"
        renderItem={({ item, index }) => {
          const isMine = item.senderId === userId;
          const { position, isLastInGroup } = getGroupInfo(index);

          const avatarUrl = isGroup
            ? (item.senderAvatarUrl ?? undefined)
            : (storeConversation?.participant?.avatarUrl ?? undefined);

          const senderName = isGroup ? (item.senderName ?? "Użytkownik") : participantName;
          const showSenderLabel = isGroup && !isMine && (position === "first" || position === "solo");
          const above = allMessages[index + 1];
          const senderSwitch = above && above.senderId !== item.senderId;

          const formattedTime = isLastInGroup
            ? new Date(item.createdAt as unknown as string).toLocaleTimeString("pl-PL", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : undefined;
          const receipt =
            isLastInGroup && isMine && !isGroup ? (item.readAt ? ("read" as const) : ("sent" as const)) : undefined;

          return (
            <View style={senderSwitch ? styles.groupGap : undefined}>
              {showSenderLabel && (
                <Text style={[styles.senderLabel, { color: getSenderColor(item.senderId) }]}>{senderName}</Text>
              )}
              <MessageBubble
                ref={(ref: View | null) => {
                  if (ref) messageRefs.current.set(item.id, ref);
                  else messageRefs.current.delete(item.id);
                }}
                content={item.content}
                type={item.type as "text" | "image" | "location"}
                metadata={item.metadata}
                isMine={isMine}
                createdAt={item.createdAt as unknown as string}
                readAt={item.readAt as unknown as string | null}
                deletedAt={item.deletedAt as unknown as string | null}
                replyTo={item.replyTo}
                reactions={item.reactions}
                position={position}
                showAvatar={!isMine && (position === "last" || position === "solo")}
                showAvatarColumn={isGroup}
                avatarUrl={avatarUrl}
                senderName={senderName}
                timestamp={formattedTime}
                receipt={receipt}
                hidden={contextMenu?.messageId === item.id}
                onLongPress={
                  item.deletedAt
                    ? undefined
                    : () =>
                        handleLongPress(item.id, isMine, {
                          content: item.content,
                          type: item.type as "text" | "image" | "location",
                          metadata: item.metadata,
                          isMine,
                          createdAt: item.createdAt as unknown as string,
                          readAt: item.readAt as unknown as string | null,
                          deletedAt: item.deletedAt as unknown as string | null,
                          replyTo: item.replyTo,
                          reactions: item.reactions,
                          position,
                          showAvatar: !isMine && (position === "last" || position === "solo"),
                          showAvatarColumn: isGroup,
                          avatarUrl,
                          senderName,
                          timestamp: formattedTime,
                          receipt,
                        })
                }
                onReactionPress={(emoji) => handleReactionPress(item.id, emoji)}
              />
            </View>
          );
        }}
        inverted
        contentContainerStyle={styles.messageList}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={<Animated.View style={keyboardSpacerStyle} />}
        ListFooterComponent={
          isLoadingMore ? <ActivityIndicator size="small" color={colors.muted} style={styles.loader} /> : null
        }
        ListEmptyComponent={
          fetchError ? (
            <Pressable
              onPress={() => {
                setFetchError(false);
                setIsLoading(true);
                useMessagesStore
                  .getState()
                  .fetchMessages(conversationId!, { limit: 50 })
                  .catch(() => setFetchError(true))
                  .finally(() => setIsLoading(false));
              }}
              style={styles.errorContainer}
            >
              <Text style={styles.errorText}>Nie udało się załadować. Dotknij, aby spróbować ponownie.</Text>
            </Pressable>
          ) : isLoading || (!cacheStatus && allMessages.length === 0) ? (
            <ActivityIndicator size="large" color={colors.ink} />
          ) : null
        }
      />

      <KeyboardStickyView>
        {someoneTyping && (
          <View style={styles.typingBar}>
            <Text style={styles.typingText}>
              {isGroup && typingDisplayNames.length > 0 ? `${typingDisplayNames.join(", ")} pisze...` : "pisze..."}
            </Text>
          </View>
        )}

        <View onLayout={handleChatInputLayout}>
          <ChatInput
            onSend={handleSend}
            onSendImage={handleSendImage}
            onSendLocation={handleSendLocation}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onTyping={() => sendTyping(true)}
          />
        </View>
      </KeyboardStickyView>

      {contextMenu && (
        <MessageContextMenu
          data={contextMenu}
          chatInputHeight={chatInputHeight}
          onReact={(emoji) => {
            useMessagesStore.getState().react(contextMenu.messageId, emoji);
          }}
          onReply={() => {
            const msg = allMessages.find((m) => m.id === contextMenu.messageId);
            if (msg) {
              const name = isGroup ? (msg.senderName ?? "Użytkownik") : participantName;
              setReplyingTo({ id: msg.id, content: msg.content, senderName: name });
            }
          }}
          onCopy={async () => {
            const msg = allMessages.find((m) => m.id === contextMenu.messageId);
            if (msg) {
              const { setStringAsync } = await import("expo-clipboard");
              setStringAsync(msg.type === "image" ? "[Zdjęcie]" : msg.content);
            }
          }}
          onDelete={() => {
            Alert.alert("Usuń wiadomość", "Czy na pewno chcesz usunąć tę wiadomość?", [
              { text: "Anuluj", style: "cancel" },
              {
                text: "Usuń",
                style: "destructive",
                onPress: () => useMessagesStore.getState().deleteMessage(conversationId!, contextMenu.messageId),
              },
            ]);
          }}
          onClose={() => setContextMenu(null)}
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
  firstContactCard: {
    paddingVertical: spacing.tight,
    paddingHorizontal: spacing.section,
    backgroundColor: "#FAFAF8",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
    alignItems: "center",
  },
  firstContactText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
  snapshotStatuses: {
    marginTop: spacing.tight,
    gap: spacing.hairline,
    paddingHorizontal: spacing.tight,
    alignSelf: "stretch",
  },
  snapshotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.tick,
  },
  snapshotRowMine: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.tick,
  },
  snapshotLabel: {
    fontFamily: fonts.sans,
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: "#D4851C",
  },
  snapshotPillTheirs: {
    backgroundColor: colors.mapBg,
    borderRadius: 12,
    paddingVertical: spacing.hairline,
    paddingHorizontal: spacing.compact,
    maxWidth: "70%",
    opacity: 0.6,
  },
  snapshotPillTheirsText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    color: colors.ink,
  },
  snapshotPillMine: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: spacing.hairline,
    paddingHorizontal: spacing.compact,
    maxWidth: "70%",
    opacity: 0.35,
  },
  snapshotPillMineText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    color: colors.bg,
  },
  messageList: {
    paddingHorizontal: spacing.section,
    paddingVertical: spacing.gutter,
  },
  loader: {
    paddingVertical: spacing.column,
  },
  headerSafeArea: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.section,
    height: layout.headerHeight,
  },
  headerBack: {
    marginRight: 4,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  headerName: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.ink,
    maxWidth: 200,
  },
  headerSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
  senderLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    marginLeft: 34,
    marginBottom: 2,
    marginTop: 2,
  },
  groupGap: {
    marginTop: spacing.tight,
  },
  typingBar: {
    paddingHorizontal: spacing.section,
    paddingVertical: spacing.tick,
  },
  typingText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontStyle: "italic",
    color: colors.muted,
  },
  errorContainer: {
    padding: spacing.section,
    alignItems: "center",
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
});
