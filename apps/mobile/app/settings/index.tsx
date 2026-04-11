import { Redirect, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../src/components/ui/Avatar";
import {
  IconAccount,
  IconBell,
  IconChevronRight,
  IconHelp,
  IconPerson,
  IconPrivacy,
} from "../../src/components/ui/icons";
import { useAuthStore } from "../../src/stores/authStore";
import { colors, fonts, spacing, type as typ } from "../../src/theme";
import { signOutAndReset } from "../_layout";

// -- Group row data --

interface GroupRow {
  icon: React.ReactNode;
  label: string;
  description: string;
  route: string;
}

const groups: GroupRow[] = [
  {
    icon: <IconPerson size={20} />,
    label: "Profil",
    description: "Edytuj profil, automatyczne profilowanie",
    route: "/settings/profile",
  },
  {
    icon: <IconAccount size={20} />,
    label: "Konto",
    description: "Połączone konta, email",
    route: "/settings/account",
  },
  {
    icon: <IconPrivacy size={20} />,
    label: "Prywatność",
    description: "Widoczność, zablokowani użytkownicy",
    route: "/settings/privacy",
  },
  {
    icon: <IconBell size={20} />,
    label: "Powiadomienia",
    description: "Pingi, wiadomości",
    route: "/settings/notifications",
  },
  {
    icon: <IconHelp size={20} />,
    label: "Pomoc",
    description: "FAQ, zgłoś problem, regulamin",
    route: "/settings/help",
  },
];

export default function SettingsHubScreen() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);

  const handleLogout = () => signOutAndReset();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <ScrollView style={styles.container}>
      {/* User mini-card */}
      <Pressable style={styles.userCard}>
        <Avatar uri={profile?.avatarUrl} name={profile?.displayName || user?.email?.charAt(0) || "?"} size={48} />
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {profile?.displayName || "Brak nazwy"}
          </Text>
          <Text style={styles.userEmail} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </Pressable>

      {/* Group rows */}
      <View style={styles.groupList}>
        {groups.map((group) => (
          <Pressable key={group.route} style={styles.groupRow} onPress={() => router.push(group.route as never)}>
            <View style={styles.groupIcon}>{group.icon}</View>
            <View style={styles.groupText}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              <Text style={styles.groupDescription}>{group.description}</Text>
            </View>
            <IconChevronRight size={16} color={colors.muted} />
          </Pressable>
        ))}
      </View>

      {/* Logout */}
      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>WYLOGUJ SIĘ</Text>
      </Pressable>

      {/* Version */}
      <Text style={styles.version}>Blisko v1.0.2</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.section,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    gap: spacing.column,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.ink,
  },
  userEmail: {
    ...typ.caption,
    marginTop: 2,
  },
  groupList: {
    paddingTop: spacing.tight,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.column,
    paddingHorizontal: spacing.section,
    gap: spacing.column,
  },
  groupIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F0ECE3",
    justifyContent: "center",
    alignItems: "center",
  },
  groupText: {
    flex: 1,
  },
  groupLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  groupDescription: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  logoutButton: {
    alignItems: "center",
    paddingVertical: spacing.block,
    marginTop: spacing.section,
  },
  logoutText: {
    ...typ.button,
    color: colors.accent,
  },
  version: {
    ...typ.caption,
    textAlign: "center",
    opacity: 0.6,
    paddingBottom: spacing.block,
  },
});
