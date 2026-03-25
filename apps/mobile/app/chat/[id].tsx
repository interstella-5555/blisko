import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChatInput } from "@/components/chat/ChatInput";
import { type BubblePosition, MessageBubble } from "@/components/chat/MessageBubble";
import { type ContextMenuData, MessageContextMenu } from "@/components/chat/MessageContextMenu";
import { Avatar } from "@/components/ui/Avatar";
import { IconChevronLeft } from "@/components/ui/icons";
import { trpc } from "@/lib/trpc";
import { useTypingIndicator } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import { useConversationsStore } from "@/stores/conversationsStore";
import { type EnrichedMessage, useMessagesStore } from "@/stores/messagesStore";
import { useProfilesStore } from "@/stores/profilesStore";
import { colors, fonts, spacing } from "@/theme";

// Deterministic color from userId hash for group sender labels
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
  const flatListRef = useRef<FlatList>(null);

  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    content: string;
    senderName: string;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const messageRefs = useRef(new Map<string, View>());

  // Get conversation from store — detect group mode
  const storeConversation = useConversationsStore((s) => s.conversations.find((c) => c.id === conversationId));
  const isGroup = storeConversation?.type === "group";
  const participantName = isGroup
    ? (storeConversation?.groupName ?? "Grupa")
    : (storeConversation?.participant?.displayName ?? "Czat");

  // Read messages from store (instant if cached from prefetch or previous visit)
  const cached = useMessagesStore((s) => s.chats.get(conversationId!));
  const storeMessages = cached?.items ?? [];

  // tRPC for initial hydration + pagination (no polling — WS keeps store current)
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.messages.getMessages.useInfiniteQuery(
      { conversationId: conversationId!, topicId, limit: 50 },
      {
        enabled: !!conversationId,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );

  // Pipe tRPC data into messagesStore (initial hydration + loadMore pages)
  const pagesLoadedRef = useRef(0);
  useEffect(() => {
    if (!data || !conversationId) return;
    const pages = data.pages;
    if (pages.length === pagesLoadedRef.current) return;

    const lastPage = pages[pages.length - 1];
    const hasMore = !!lastPage?.nextCursor;
    const store = useMessagesStore.getState();

    type RawMessage = (typeof pages)[number]["messages"][number];
    const toEnriched = (msg: RawMessage): EnrichedMessage => ({
      id: msg.id,
      conversationId: msg.conversationId ?? conversationId,
      senderId: msg.senderId,
      content: msg.content,
      type: msg.type ?? "text",
      metadata: (msg.metadata as Record<string, unknown> | null) ?? null,
      replyToId: msg.replyToId ?? null,
      topicId: (msg as Record<string, unknown>).topicId as string | null | undefined,
      createdAt: String(msg.createdAt),
      readAt: msg.readAt ? String(msg.readAt) : null,
      deletedAt: msg.deletedAt ? String(msg.deletedAt) : null,
      replyTo: ((msg as Record<string, unknown>).replyTo as EnrichedMessage["replyTo"]) ?? null,
      reactions: ((msg as Record<string, unknown>).reactions as EnrichedMessage["reactions"]) ?? [],
      senderName: ((msg as Record<string, unknown>).senderName as string | null) ?? null,
      senderAvatarUrl: ((msg as Record<string, unknown>).senderAvatarUrl as string | null) ?? null,
    });

    if (pagesLoadedRef.current === 0) {
      // Initial hydration — set all pages
      const allMsgs = pages.flatMap((p) => p.messages).map(toEnriched);
      store.set(conversationId, allMsgs, hasMore, lastPage?.nextCursor);
    } else {
      // LoadMore — append only the new page
      const newMsgs = lastPage.messages.map(toEnriched);
      store.appendOlder(conversationId, newMsgs, hasMore, lastPage?.nextCursor);
    }

    pagesLoadedRef.current = pages.length;
  }, [data, conversationId]);

  // Render from store; fall back to tRPC data during first hydration frame
  const trpcMessages = data?.pages.flatMap((page) => page.messages) ?? [];
  const allMessages = storeMessages.length > 0 ? storeMessages : trpcMessages;

  // Compute bubble position for message grouping
  // Note: FlatList is inverted, so index 0 = newest message
  // "prev" visually (above) = index + 1, "next" visually (below) = index - 1
  const getGroupInfo = useCallback(
    (index: number) => {
      const msg = allMessages[index];
      if (!msg) return { position: "solo" as BubblePosition, isLastInGroup: true, showGroupTime: true };

      const above = allMessages[index + 1]; // visually above (older)
      const below = allMessages[index - 1]; // visually below (newer)

      const sameSenderAbove = above && above.senderId === msg.senderId && !above.deletedAt;
      const sameSenderBelow = below && below.senderId === msg.senderId && !below.deletedAt;

      let position: BubblePosition;
      if (sameSenderAbove && sameSenderBelow) position = "mid";
      else if (sameSenderAbove && !sameSenderBelow) position = "last";
      else if (!sameSenderAbove && sameSenderBelow) position = "first";
      else position = "solo";

      // Show time only on the last (newest) message in a group
      const isLastInGroup = position === "solo" || position === "last";

      return { position, isLastInGroup };
    },
    [allMessages],
  );

  // Typing indicators
  // (WS message & reaction updates are handled globally by _layout.tsx → messagesStore)
  const { isTyping: someoneTyping, typingUserIds, sendTyping } = useTypingIndicator(conversationId);

  // Mark as read on open + cleanup to sync server state before leaving
  const markAsRead = trpc.messages.markAsRead.useMutation();

  const markAsReadRef = useRef(markAsRead);
  markAsReadRef.current = markAsRead;

  const setActiveConversation = useConversationsStore((s) => s.setActiveConversation);

  useEffect(() => {
    if (conversationId) {
      markAsReadRef.current.mutate({ conversationId });
      setActiveConversation(conversationId);
    }
    return () => {
      if (conversationId) {
        markAsReadRef.current.mutate({ conversationId });
      }
      setActiveConversation(null);
    };
  }, [conversationId, setActiveConversation]);

  // Send message with optimistic update via messagesStore
  const replyingToRef = useRef(replyingTo);
  replyingToRef.current = replyingTo;

  const sendMessage = trpc.messages.send.useMutation({
    onMutate: async (newMsg) => {
      const tempId = `temp-${Date.now()}`;
      const optimistic: EnrichedMessage = {
        id: tempId,
        conversationId: conversationId!,
        senderId: userId!,
        content: newMsg.content,
        type: ((newMsg as Record<string, unknown>).type as string) ?? "text",
        metadata: ((newMsg as Record<string, unknown>).metadata as Record<string, unknown> | null) ?? null,
        replyToId: newMsg.replyToId ?? null,
        createdAt: new Date().toISOString(),
        readAt: null,
        deletedAt: null,
        replyTo: replyingToRef.current,
        reactions: [],
      };
      useMessagesStore.getState().addOptimistic(conversationId!, optimistic);
      useConversationsStore.getState().updateLastMessage(conversationId!, {
        id: tempId,
        content: newMsg.content,
        senderId: userId!,
        createdAt: optimistic.createdAt,
        type: optimistic.type,
      });
      return { tempId };
    },
    onSuccess: (_data, _vars, context) => {
      // WS event will prepend the real message; remove the temp
      if (context?.tempId) {
        useMessagesStore.getState().removeOptimistic(conversationId!, context.tempId);
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.tempId) {
        useMessagesStore.getState().removeOptimistic(conversationId!, context.tempId);
      }
    },
  });

  // Delete message (optimistic via store — no WS event for deletes)
  const deleteMessage = trpc.messages.deleteMessage.useMutation({
    onMutate: async ({ messageId }) => {
      const store = useMessagesStore.getState();
      const chat = store.chats.get(conversationId!);
      const original = chat?.items.find((m) => m.id === messageId);
      // Optimistic: mark as deleted
      if (original) {
        store.replaceOptimistic(conversationId!, messageId, {
          ...original,
          deletedAt: new Date().toISOString(),
          content: "",
        });
      }
      return { original };
    },
    onError: (_err, { messageId }, context) => {
      // Restore original message on failure
      if (context?.original) {
        useMessagesStore.getState().replaceOptimistic(conversationId!, messageId, context.original);
      }
    },
  });

  // React to message (WS event updates store via _layout.tsx handler)
  const reactToMessage = trpc.messages.react.useMutation();

  const handleSend = useCallback(
    (text: string, replyToId?: string) => {
      if (!conversationId) return;
      sendMessage.mutate({
        conversationId,
        content: text,
        replyToId,
        topicId,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    [conversationId, topicId, sendMessage],
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleLongPress = useCallback(
    (messageId: string, isMine: boolean, bubbleProps: ContextMenuData["bubbleProps"]) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const viewRef = messageRefs.current.get(messageId);
      if (!viewRef) return;

      const keyboardVisible = Keyboard.isVisible?.() ?? false;
      if (keyboardVisible) Keyboard.dismiss();

      const delay = keyboardVisible ? (Platform.OS === "ios" ? 350 : 100) : 0;

      setTimeout(() => {
        viewRef.measureInWindow((x, y, width, height) => {
          if (width === 0 && height === 0) return;
          setContextMenu({
            messageId,
            isMine,
            layout: { x, y, width, height },
            bubbleProps,
          });
        });
      }, delay);
    },
    [],
  );

  const handleReactionPress = useCallback(
    (messageId: string, emoji: string) => {
      reactToMessage.mutate({ messageId, emoji });
    },
    [reactToMessage],
  );

  const handleSendImage = useCallback(async () => {
    if (!conversationId) return;
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

      sendMessage.mutate({
        conversationId,
        content: "[Zdjęcie]",
        type: "image",
        metadata: {
          imageUrl: url,
          width: asset.width,
          height: asset.height,
        },
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (_error) {
      Alert.alert("Błąd", "Nie udało się wysłać zdjęcia");
    }
  }, [conversationId, sendMessage]);

  const handleSendLocation = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Brak uprawnień", "Pozwól na dostęp do lokalizacji w ustawieniach.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      sendMessage.mutate({
        conversationId,
        content: "Moja lokalizacja",
        type: "location",
        metadata: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (_error) {
      Alert.alert("Błąd", "Nie udało się pobrać lokalizacji");
    }
  }, [conversationId, sendMessage]);

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <Stack.Screen
        options={{
          header: () => (
            <SafeAreaView edges={["top"]} style={styles.headerSafeArea}>
              <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.headerBack} hitSlop={8}>
                  <IconChevronLeft size={24} color={colors.ink} />
                </Pressable>
                <Pressable
                  style={styles.headerLeft}
                  onPress={isGroup ? () => router.push(`/(modals)/group/${conversationId}`) : undefined}
                >
                  <Avatar uri={headerAvatarUrl} name={participantName} size={32} />
                  <View>
                    <Text style={styles.headerName} numberOfLines={1}>
                      {participantName}
                    </Text>
                    {isGroup && storeConversation?.memberCount != null && (
                      <Text style={styles.headerSubtitle}>{storeConversation.memberCount} członków</Text>
                    )}
                  </View>
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
          {storeConversation.metadata.isMutualPing === true && (
            <Text style={styles.mutualPingText}>
              Pingowaliście się wzajemnie w tym samym momencie. To rzadkie. To zostaje.
            </Text>
          )}
        </View>
      )}

      <FlatList
        ref={flatListRef}
        testID="message-list"
        data={allMessages}
        keyExtractor={(item) => item.id}
        scrollEnabled={!contextMenu}
        renderItem={({ item, index }) => {
          const isMine = item.senderId === userId;
          const { position, isLastInGroup } = getGroupInfo(index);

          // For groups: use sender-specific avatar; for DMs: use other participant's avatar
          const avatarUrl = isGroup
            ? (item.senderAvatarUrl ?? undefined)
            : (storeConversation?.participant?.avatarUrl ?? undefined);

          const senderName = isGroup ? (item.senderName ?? "Użytkownik") : participantName;

          // In groups, show sender name label above first message in a group from this sender
          const showSenderLabel = isGroup && !isMine && (position === "first" || position === "solo");

          // Add spacing between groups from different senders
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
        ListFooterComponent={
          isFetchingNextPage ? <ActivityIndicator size="small" color={colors.muted} style={styles.loader} /> : null
        }
        ListEmptyComponent={!cached && isLoading ? <ActivityIndicator size="large" color={colors.ink} /> : null}
      />

      {someoneTyping && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>
            {isGroup && typingDisplayNames.length > 0 ? `${typingDisplayNames.join(", ")} pisze...` : "pisze..."}
          </Text>
        </View>
      )}

      <ChatInput
        onSend={handleSend}
        onSendImage={handleSendImage}
        onSendLocation={handleSendLocation}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onTyping={() => sendTyping(true)}
      />

      {contextMenu && (
        <MessageContextMenu
          data={contextMenu}
          onReact={(emoji) => {
            reactToMessage.mutate({ messageId: contextMenu.messageId, emoji });
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
                onPress: () => deleteMessage.mutate({ messageId: contextMenu.messageId }),
              },
            ]);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </KeyboardAvoidingView>
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
  mutualPingText: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: 13,
    color: "#D4851C",
    marginTop: 4,
    textAlign: "center",
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
    height: 58,
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
});
