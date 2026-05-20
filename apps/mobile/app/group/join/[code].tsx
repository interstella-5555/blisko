import { Trans, useLingui } from "@lingui/react/macro";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ThinkingIndicator } from "@/components/ui/ThinkingIndicator";
import { trpc } from "@/lib/trpc";
import { sendWsMessage } from "@/lib/ws";
import { useConversationsStore } from "@/stores/conversationsStore";
import { colors, fonts, spacing } from "@/theme";

export default function JoinGroupScreen() {
  const { t } = useLingui();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  const LOADING_MESSAGES = [t`Dołączam do grupy…`];

  const joinGroup = trpc.groups.join.useMutation({
    onSuccess: (data) => {
      sendWsMessage({ type: "subscribe", conversationId: data.id });
      useConversationsStore.getState().addNew({
        id: data.id,
        type: "group",
        participant: null,
        groupName: data.name,
        groupAvatarUrl: data.avatarUrl,
        memberCount: null,
        lastMessage: null,
        unreadCount: 0,
        mutedUntil: null,
        createdAt: String(data.createdAt),
        updatedAt: String(data.updatedAt),
      });
      router.replace(`/chat/${data.id}`);
    },
    onError: (err) => {
      if (err.message === "Invalid invite code") {
        setError(t`Ten link jest nieprawidłowy lub wygasł`);
      } else if (err.message === "Group is full") {
        setError(t`Ta grupa jest pełna`);
      } else {
        // Already a member — the API returns the conversation for this case
        setError(t`Nie udało się dołączyć do grupy`);
      }
    },
  });

  useEffect(() => {
    if (code) {
      joinGroup.mutate({ inviteCode: code });
    }
  }, [code, joinGroup.mutate]);

  return (
    <>
      <Stack.Screen options={{ title: "", headerShown: false }} />
      <View style={styles.container}>
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>
                <Trans>Wróć</Trans>
              </Text>
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
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.section,
  },
  errorContainer: {
    alignItems: "center",
    gap: spacing.column,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
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
