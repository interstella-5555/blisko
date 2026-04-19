import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthStore } from "@/stores/authStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const activeStatus = !!profile?.currentStatus;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Avatar uri={profile?.avatarUrl} name={profile?.displayName || user?.email?.charAt(0) || "?"} size={100} />
        <Text testID="profile-display-name" style={styles.displayName}>
          {profile?.displayName || "Brak nazwy"}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>

        {activeStatus ? (
          <View style={styles.statusContainer}>
            <Pressable
              style={styles.statusPill}
              onPress={() =>
                router.push({
                  pathname: "/set-status" as never,
                  params: {
                    prefill: profile!.currentStatus!,
                    prefillVisibility: profile!.statusVisibility ?? undefined,
                    prefillCategories: profile!.statusCategories?.join(",") ?? undefined,
                  },
                })
              }
            >
              <Text style={styles.statusText} numberOfLines={2}>
                {profile!.currentStatus}
              </Text>
            </Pressable>
            <Text style={styles.statusExpiry}>aktywny dopóki go nie zmienisz</Text>
          </View>
        ) : (
          <Pressable style={styles.setStatusButton} onPress={() => router.push("/set-status" as never)}>
            <Text style={styles.setStatusText}>+ Ustaw status na teraz</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>O mnie</Text>
        <Text testID="profile-bio" style={styles.sectionContent}>
          {profile?.bio || "Brak opisu"}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kogo szukam</Text>
        <Text testID="profile-looking-for" style={styles.sectionContent}>
          {profile?.lookingFor || "Brak opisu"}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    alignItems: "center",
    paddingVertical: spacing.block,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  displayName: {
    ...typ.heading,
    marginTop: spacing.column,
  },
  email: {
    ...typ.caption,
    marginTop: spacing.hairline,
  },
  setStatusButton: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.rule,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 14,
  },
  setStatusText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  statusContainer: {
    marginTop: 14,
    alignItems: "center",
  },
  statusPill: {
    backgroundColor: "#FDF5EC",
    borderWidth: 1.5,
    borderColor: "#E8C9A0",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 20,
    maxWidth: 260,
    alignItems: "center",
  },
  statusText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
    textAlign: "center",
  },
  statusExpiry: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    color: "#D4851C",
    marginTop: 4,
  },
  section: {
    padding: spacing.section,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  sectionTitle: {
    ...typ.label,
    marginBottom: spacing.tight,
  },
  sectionContent: {
    ...typ.body,
  },
});
