import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';
import { useAuthStore } from '../../../src/stores/authStore';
import { MessageBubble, type BubblePosition } from '../../../src/components/chat/MessageBubble';
import { ChatInput } from '../../../src/components/chat/ChatInput';
import { ReactionPicker } from '../../../src/components/chat/ReactionPicker';
import { useWebSocket, useTypingIndicator } from '../../../src/lib/ws';
import { useConversationsStore } from '../../../src/stores/conversationsStore';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Avatar } from '../../../src/components/ui/Avatar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts, spacing } from '../../../src/theme';

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((state) => state.user?.id);
  const utils = trpc.useUtils();
  const flatListRef = useRef<FlatList>(null);

  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    content: string;
    senderName: string;
  } | null>(null);

  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);

  // Get other participant from conversations store (no extra tRPC query needed)
  const storeConversation = useConversationsStore((s) =>
    s.conversations.find((c) => c.id === conversationId)
  );
  const participantName = storeConversation?.participant?.displayName ?? 'Czat';

  // Fetch messages with infinite scroll
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = trpc.messages.getMessages.useInfiniteQuery(
    { conversationId: conversationId!, limit: 50 },
    {
      enabled: !!conversationId,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchInterval: 30_000, // Fallback polling — WS handles real-time
    }
  );

  const allMessages = data?.pages.flatMap((page) => page.messages) ?? [];

  // Compute bubble position for message grouping
  // Note: FlatList is inverted, so index 0 = newest message
  // "prev" visually (above) = index + 1, "next" visually (below) = index - 1
  const getGroupInfo = useCallback(
    (index: number) => {
      const msg = allMessages[index];
      if (!msg) return { position: 'solo' as BubblePosition, isLastInGroup: true, showGroupTime: true };

      const above = allMessages[index + 1]; // visually above (older)
      const below = allMessages[index - 1]; // visually below (newer)

      const sameSenderAbove = above && above.senderId === msg.senderId && !above.deletedAt;
      const sameSenderBelow = below && below.senderId === msg.senderId && !below.deletedAt;

      let position: BubblePosition;
      if (sameSenderAbove && sameSenderBelow) position = 'mid';
      else if (sameSenderAbove && !sameSenderBelow) position = 'last';
      else if (!sameSenderAbove && sameSenderBelow) position = 'first';
      else position = 'solo';

      // Show time only on the last (newest) message in a group
      const isLastInGroup = position === 'solo' || position === 'last';

      return { position, isLastInGroup };
    },
    [allMessages]
  );

  // WebSocket: real-time message & reaction updates via stores
  // (global _layout.tsx handler handles store prepend + conversation updates)
  // This handler syncs tRPC cache for this screen's infinite query
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  const wsHandler = useCallback(
    (msg: any) => {
      if (!conversationId) return;

      if (msg.type === 'newMessage' && msg.conversationId === conversationId) {
        // Skip own messages — optimistic update handles them
        if (msg.message.senderId !== userId) {
          utilsRef.current.messages.getMessages.setInfiniteData(
            { conversationId, limit: 50 },
            (old) => {
              if (!old) return old;
              const newPages = [...old.pages];
              newPages[0] = {
                ...newPages[0],
                messages: [
                  { ...msg.message, replyTo: null, reactions: [] },
                  ...newPages[0].messages,
                ],
              };
              return { ...old, pages: newPages };
            }
          );
        }
      }

      if (msg.type === 'reaction' && msg.conversationId === conversationId) {
        // Reactions are handled by the global WS handler via messagesStore.updateReaction
        // Still invalidate tRPC cache to reconcile
        utilsRef.current.messages.getMessages.invalidate();
      }
    },
    [conversationId, userId]
  );

  useWebSocket(wsHandler);

  // Typing indicators
  const { isTyping: someoneTyping, sendTyping } = useTypingIndicator(conversationId);

  // Mark as read on open + cleanup to sync server state before leaving
  const markAsRead = trpc.messages.markAsRead.useMutation({
    onSuccess: () => {
      utils.messages.getConversations.invalidate();
    },
  });

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

  // Send message with optimistic update
  const sendMessage = trpc.messages.send.useMutation({
    onMutate: async (newMsg) => {
      await utils.messages.getMessages.cancel();

      const input = { conversationId: conversationId!, limit: 50 };
      const previousData = utils.messages.getMessages.getInfiniteData(input);

      utils.messages.getMessages.setInfiniteData(input, (old) => {
        if (!old) return old;
        const optimisticMessage = {
          id: `temp-${Date.now()}`,
          conversationId,
          senderId: userId!,
          content: newMsg.content,
          type: 'text',
          metadata: null,
          replyToId: newMsg.replyToId ?? null,
          createdAt: new Date().toISOString(),
          readAt: null,
          deletedAt: null,
          replyTo: replyingTo,
          reactions: [],
        };
        const newPages = [...old.pages];
        newPages[0] = {
          ...newPages[0],
          messages: [optimisticMessage, ...newPages[0].messages],
        };
        return { ...old, pages: newPages };
      });

      return { previousData, input };
    },
    onError: (_err, _newMsg, context) => {
      if (context?.previousData) {
        utils.messages.getMessages.setInfiniteData(
          context.input,
          context.previousData
        );
      }
    },
    onSettled: () => {
      utils.messages.getMessages.invalidate();
      utils.messages.getConversations.invalidate();
    },
  });

  // Delete message
  const deleteMessage = trpc.messages.deleteMessage.useMutation({
    onSettled: () => {
      utils.messages.getMessages.invalidate();
    },
  });

  // React to message
  const reactToMessage = trpc.messages.react.useMutation({
    onSettled: () => {
      utils.messages.getMessages.invalidate();
    },
  });

  const handleSend = useCallback(
    (text: string, replyToId?: string) => {
      if (!conversationId) return;
      sendMessage.mutate({
        conversationId,
        content: text,
        replyToId,
      });
    },
    [conversationId, sendMessage]
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleLongPress = useCallback(
    (messageId: string, isMine: boolean, content: string, senderName: string) => {
      const options: { text: string; onPress: () => void; style?: 'destructive' | 'cancel' }[] = [
        {
          text: 'Reaguj',
          onPress: () => setReactionPickerMessageId(messageId),
        },
        {
          text: 'Odpowiedz',
          onPress: () => setReplyingTo({ id: messageId, content, senderName }),
        },
      ];

      if (isMine) {
        options.push({
          text: 'Usuń',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Usuń wiadomość', 'Czy na pewno chcesz usunąć tę wiadomość?', [
              { text: 'Anuluj', style: 'cancel' },
              {
                text: 'Usuń',
                style: 'destructive',
                onPress: () => deleteMessage.mutate({ messageId }),
              },
            ]);
          },
        });
      }

      options.push({ text: 'Anuluj', style: 'cancel', onPress: () => {} });

      Alert.alert('', '', options);
    },
    [deleteMessage]
  );

  const handleReactionPress = useCallback(
    (messageId: string, emoji: string) => {
      reactToMessage.mutate({ messageId, emoji });
    },
    [reactToMessage]
  );

  const handleSendImage = useCallback(async () => {
    if (!conversationId) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'photo.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/uploads`, {
        method: 'POST',
        body: formData,
        headers: {
          authorization: `Bearer ${useAuthStore.getState().session?.token || ''}`,
        },
      });

      if (!response.ok) throw new Error('Upload failed');
      const { url } = await response.json();

      sendMessage.mutate({
        conversationId,
        content: '[Zdjęcie]',
        type: 'image',
        metadata: {
          imageUrl: url,
          width: asset.width,
          height: asset.height,
        },
      });
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się wysłać zdjęcia');
    }
  }, [conversationId, sendMessage]);

  const handleSendLocation = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Brak uprawnień', 'Pozwól na dostęp do lokalizacji w ustawieniach.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      sendMessage.mutate({
        conversationId,
        content: 'Moja lokalizacja',
        type: 'location',
        metadata: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
      });
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się pobrać lokalizacji');
    }
  }, [conversationId, sendMessage]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <Stack.Screen
        options={{
          header: () => (
            <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
              <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.headerLeft} hitSlop={8}>
                  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                    <Path d="M15 19l-7-7 7-7" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                  <Avatar
                    uri={storeConversation?.participant?.avatarUrl}
                    name={participantName}
                    size={32}
                  />
                  <Text style={styles.headerName} numberOfLines={1}>{participantName}</Text>
                </Pressable>
              </View>
            </SafeAreaView>
          ),
        }}
      />

      <FlatList
        ref={flatListRef}
        testID="message-list"
        data={allMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const isMine = item.senderId === userId;
          const { position, isLastInGroup } = getGroupInfo(index);
          const avatarUrl = storeConversation?.participant?.avatarUrl ?? undefined;

          // Add spacing between groups from different senders
          // In inverted list: index - 1 = newer (below), so we add top margin
          // when the message above (index + 1, older) is from a different sender
          const above = allMessages[index + 1];
          const senderSwitch = above && above.senderId !== item.senderId;

          return (
            <View style={senderSwitch ? styles.groupGap : undefined}>
              <MessageBubble
                content={item.content}
                type={item.type as 'text' | 'image' | 'location'}
                metadata={item.metadata}
                isMine={isMine}
                createdAt={item.createdAt as unknown as string}
                readAt={item.readAt as unknown as string | null}
                deletedAt={item.deletedAt as unknown as string | null}
                replyTo={item.replyTo}
                reactions={item.reactions}
                position={position}
                showAvatar={!isMine && (position === 'last' || position === 'solo')}
                avatarUrl={avatarUrl}
                senderName={participantName}
                onLongPress={() =>
                  handleLongPress(
                    item.id,
                    isMine,
                    item.content,
                    participantName
                  )
                }
                onReactionPress={(emoji) => handleReactionPress(item.id, emoji)}
              />
              {isLastInGroup && (
                <View style={[styles.groupTime, isMine ? styles.groupTimeMine : styles.groupTimeTheirs]}>
                  <Text style={styles.groupTimeText}>
                    {new Date(item.createdAt as unknown as string).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {isMine && (
                    <Text style={[styles.receipt, item.readAt ? styles.receiptRead : styles.receiptSent]}>
                      {item.readAt ? '✓✓' : '✓'}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        }}
        inverted
        contentContainerStyle={styles.messageList}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator
              size="small"
              color={colors.muted}
              style={styles.loader}
            />
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={colors.ink} />
          ) : null
        }
      />

      {someoneTyping && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>pisze...</Text>
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

      <ReactionPicker
        visible={!!reactionPickerMessageId}
        onSelect={(emoji) => {
          if (reactionPickerMessageId) {
            reactToMessage.mutate({ messageId: reactionPickerMessageId, emoji });
          }
        }}
        onClose={() => setReactionPickerMessageId(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.section,
    height: 58,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerName: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.ink,
    maxWidth: 160,
  },
  groupGap: {
    marginTop: spacing.tight,
  },
  groupTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  groupTimeMine: {
    justifyContent: 'flex-end',
  },
  groupTimeTheirs: {
    justifyContent: 'flex-start',
    marginLeft: 34,
  },
  groupTimeText: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.muted,
  },
  receipt: {
    fontSize: 10,
    fontFamily: fonts.sans,
  },
  receiptSent: {
    color: colors.muted,
  },
  receiptRead: {
    color: colors.accent,
  },
  typingBar: {
    paddingHorizontal: spacing.section,
    paddingVertical: spacing.tick,
  },
  typingText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.muted,
  },
});
