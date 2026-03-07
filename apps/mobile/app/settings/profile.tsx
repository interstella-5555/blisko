import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Polyline } from "react-native-svg";
import { colors, fonts, spacing } from "../../src/theme";

const iconColor = "#1A1A1A";

function IconEdit({ size = 20 }: { size?: number }) {
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
      <Path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </Svg>
  );
}

function IconSparkles({ size = 20 }: { size?: number }) {
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
      <Path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <Path d="M20 3v4" />
      <Path d="M22 5h-4" />
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

interface RowProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

function Row({ icon, label, onPress }: RowProps) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={styles.rowLabel}>{label}</Text>
      <IconChevronRight />
    </Pressable>
  );
}

export default function ProfileSettingsScreen() {
  return (
    <View style={styles.container}>
      <Row icon={<IconEdit />} label="Edytuj profil" onPress={() => router.push("/settings/edit-profile" as never)} />
      <Row
        icon={<IconSparkles />}
        label="Automatyczne profilowanie"
        onPress={() => router.push("/settings/profiling" as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: spacing.tight,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.column,
    paddingHorizontal: spacing.section,
    gap: spacing.column,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F0ECE3",
    justifyContent: "center",
    alignItems: "center",
  },
  rowLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
  },
});
