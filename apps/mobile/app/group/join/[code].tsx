import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';
import { sendWsMessage } from '../../../src/lib/ws';
import { useConversationsStore } from '../../../src/stores/conversationsStore';
import { ThinkingIndicator } from '../../../src/components/ui/ThinkingIndicator';
import { colors, fonts, spacing } from '../../../src/theme';

const LOADING_MESSAGES = ['Dołączam do grupy…'];

export default function JoinGroupScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  const joinGroup = trpc.groups.join.useMutation({
    onSuccess: (data) => {
      sendWsMessage({ type: 'subscribe', conversationId: data.id });
      useConversationsStore.getState().addNew({
        id: data.id,
        type: 'group',
        participant: null,
        groupName: data.name,
        groupAvatarUrl: data.avatarUrl,
        memberCount: null,
        lastMessage: null,
        unreadCount: 0,
        createdAt: String(data.createdAt),
        updatedAt: String(data.updatedAt),
      });
      router.replace(`/(modals)/chat/${data.id}`);
    },
    onError: (err) => {
      if (err.message === 'Invalid invite code') {
        setError('Ten link jest nieprawidłowy lub wygasł');
      } else if (err.message === 'Group is full') {
        setError('Ta grupa jest pełna');
      } else {
        // Already a member — the API returns the conversation for this case
        setError('Nie udało się dołączyć do grupy');
      }
    },
  });

  useEffect(() => {
    if (code) {
      joinGroup.mutate({ inviteCode: code });
    }
  }, [code]);

  return (
    <>
      <Stack.Screen options={{ title: '', headerShown: false }} />
      <View style={styles.container}>
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Wróć</Text>
            </Pressable>
          </View>
        ) : (
          <ThinkingIndicator messages={LOADING_MESSAGES} />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.section,
  },
  errorContainer: {
    alignItems: 'center',
    gap: spacing.column,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  backBtn: {
    paddingHorizontal: spacing.section,
    paddingVertical: spacing.compact,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  backBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.ink,
  },
});
