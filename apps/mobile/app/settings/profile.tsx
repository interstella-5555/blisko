import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { IconChevronRight, IconEdit, IconSparkles } from "../../src/components/ui/icons";
import { colors, fonts, spacing } from "../../src/theme";

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
      <IconChevronRight size={16} color={colors.muted} />
    </Pressable>
  );
}

export default function ProfileSettingsScreen() {
  return (
    <View style={styles.container}>
      <Row
        icon={<IconEdit size={20} />}
        label="Edytuj profil"
        onPress={() => router.push("/settings/edit-profile" as never)}
      />
      <Row
        icon={<IconSparkles size={20} />}
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
