import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconChevronLeft, IconX } from "@/components/ui/icons";
import { colors, layout, spacing, type as typ } from "@/theme";

interface OnboardingStepHeaderProps {
  label: string;
  onBack?: () => void;
  onLogout?: () => void;
  rightLabel?: string;
}

export function OnboardingStepHeader({ label, onBack, onLogout, rightLabel }: OnboardingStepHeaderProps) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.row}>
        <View style={styles.left}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={8}>
              <IconChevronLeft size={24} color={colors.ink} />
            </Pressable>
          ) : null}
          <Text style={styles.label}>{label}</Text>
        </View>
        {onLogout ? (
          <Pressable onPress={onLogout} hitSlop={12} style={styles.logoutButton}>
            <IconX size={12} color={colors.muted} />
            <Text style={styles.logoutText}>Wyloguj</Text>
          </Pressable>
        ) : rightLabel ? (
          <Text style={styles.label}>{rightLabel}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.bg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.section,
    height: layout.headerHeight,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.tight,
  },
  label: {
    ...typ.caption,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  logoutText: {
    ...typ.caption,
  },
});
