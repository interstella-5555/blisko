import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { useIsGhost } from "@/hooks/useIsGhost";
import { trpc } from "@/lib/trpc";
import { colors, fonts, spacing, type as typ } from "@/theme";

export default function BlockedUsersScreen() {
  const isGhost = useIsGhost();
  const utils = trpc.useUtils();
  const { data: blockedUsers, isLoading } = trpc.waves.getBlocked.useQuery();
  const unblockMutation = trpc.waves.unblock.useMutation({
    onSuccess: () => {
      utils.waves.getBlocked.invalidate();
    },
  });

  const handleUnblock = (userId: string, displayName: string) => {
    Alert.alert("Odblokuj", `Odblokować ${displayName}?`, [
      { text: "Anuluj", style: "cancel" },
      {
        text: "Odblokuj",
        onPress: () => unblockMutation.mutate({ userId }),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Ładowanie...</Text>
      </View>
    );
  }

  if (!blockedUsers?.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Brak zablokowanych uzytkownikow</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {blockedUsers.map((user) => (
        <View key={user.userId} style={styles.row}>
          <Avatar uri={user.avatarUrl} name={user.displayName} size={40} blurred={isGhost} />
          <Text style={styles.name} numberOfLines={1}>
            {user.displayName}
          </Text>
          <Pressable
            style={styles.unblockButton}
            onPress={() => handleUnblock(user.userId, user.displayName)}
            disabled={unblockMutation.isPending}
          >
            <Text style={styles.unblockText}>Odblokuj</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  emptyText: {
    ...typ.body,
    color: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    paddingVertical: spacing.gutter,
    paddingHorizontal: spacing.section,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  name: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  unblockButton: {
    paddingVertical: spacing.tick,
    paddingHorizontal: spacing.gutter,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  unblockText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.muted,
  },
});
