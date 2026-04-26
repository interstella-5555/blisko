import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { useConversationsStore } from "@/stores/conversationsStore";
import { colors, fonts, spacing } from "@/theme";

const OPTIONS = [
  { label: "1 godzinę", duration: "1h" as const },
  { label: "8 godzin", duration: "8h" as const },
  { label: "Na zawsze", duration: "forever" as const },
];

export default function MuteConversationSheet() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();

  const muteConversation = trpc.messages.muteConversation.useMutation({
    onSuccess: (data) => {
      if (conversationId) {
        useConversationsStore.getState().setMutedUntil(conversationId, data.mutedUntil.toString());
      }
      router.back();
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wycisz powiadomienia</Text>
      <Text style={styles.subtitle}>Na jak długo?</Text>
      <View style={styles.options}>
        {OPTIONS.map((opt) => (
          <Pressable
            key={opt.duration}
            style={styles.button}
            onPress={() => {
              if (!conversationId || muteConversation.isPending) return;
              muteConversation.mutate({ conversationId, duration: opt.duration });
            }}
          >
            <Text style={styles.buttonText}>{opt.label}</Text>
          </Pressable>
        ))}
        <Pressable style={[styles.button, styles.cancelButton]} onPress={() => router.back()}>
          <Text style={[styles.buttonText, styles.cancelText]}>Anuluj</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.section,
    paddingTop: spacing.column,
    paddingBottom: spacing.block,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.section,
  },
  options: {
    gap: spacing.tight,
  },
  button: {
    paddingVertical: spacing.gutter,
    paddingHorizontal: spacing.section,
    borderRadius: 999,
    backgroundColor: "#EDEAE4",
    alignItems: "center",
  },
  buttonText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: colors.ink,
  },
  cancelButton: {
    backgroundColor: "transparent",
  },
  cancelText: {
    color: colors.muted,
    fontFamily: fonts.sansMedium,
  },
});
