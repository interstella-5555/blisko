import { Redirect, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";
import { Avatar } from "../../src/components/ui/Avatar";
import { useAuthStore } from "../../src/stores/authStore";
import { colors, fonts, spacing, type as typ } from "../../src/theme";
import { signOutAndReset } from "../_layout";

// -- Icons for settings groups --

const iconColor = "#1A1A1A";

function IconProfile({ size = 20 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx={12} cy={8} r={4} />
      <Path d="M20 21a8 8 0 1 0-16 0" />
    </Svg>
  );
}

function IconAccount({ size = 20 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  );
}

function IconPrivacy({ size = 20 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}

function IconNotifications({ size = 20 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

function IconHelp({ size = 20 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx={12} cy={12} r={10} />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <Line x1={12} y1={17} x2={12.01} y2={17} />
    </Svg>
  );
}

function IconChevronRight({ size = 16 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.muted}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Polyline points="9,18 15,12 9,6" />
    </Svg>
  );
}

// -- Group row data --

interface GroupRow {
  icon: React.ReactNode;
  label: string;
  description: string;
  route: string;
}

const groups: GroupRow[] = [
  {
    icon: <IconProfile />,
    label: "Profil",
    description: "Edytuj profil, automatyczne profilowanie",
    route: "/settings/profile",
  },
  {
    icon: <IconAccount />,
    label: "Konto",
    description: "Połączone konta, email",
    route: "/settings/account",
  },
  {
    icon: <IconPrivacy />,
    label: "Prywatność",
    description: "Widoczność, zablokowani użytkownicy",
    route: "/settings/privacy",
  },
  {
    icon: <IconNotifications />,
    label: "Powiadomienia",
    description: "Pingi, wiadomości",
    route: "/settings/notifications",
  },
  {
    icon: <IconHelp />,
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
            <IconChevronRight />
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
