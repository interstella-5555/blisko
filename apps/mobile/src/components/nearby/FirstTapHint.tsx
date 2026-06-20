import { Trans } from "@lingui/react/macro";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SonarDot } from "@/components/ui/SonarDot";
import { colors, fonts, spacing } from "@/theme";

interface FirstTapHintProps {
  /** Dismiss the overlay (and persist that it's been seen). */
  onDismiss: () => void;
}

/**
 * One-time guided first-tap overlay on the map (v4, BLI-292). Dims the map and
 * tells a brand-new user that the bubbles are people and tapping one is a ping.
 * Tap anywhere to dismiss. Shown once per account (flag in onboardingStore).
 */
export function FirstTapHint({ onDismiss }: FirstTapHintProps) {
  return (
    <Pressable testID="first-tap-hint" style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityRole="button">
      <View style={styles.scrim} />
      <View style={styles.card} pointerEvents="none">
        <View style={styles.sonarRow}>
          <SonarDot size={14} color={colors.accent} />
        </View>
        <Text style={styles.title}>
          <Trans>Widzisz bańki? To ludzie obok.</Trans>
        </Text>
        <Text style={styles.body}>
          <Trans>Dotknij jednej, żeby zobaczyć kim jest — i zapingować.</Trans>
        </Text>
        <Text style={styles.dismiss}>
          <Trans>Dotknij, aby zacząć</Trans>
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26,26,26,0.55)",
  },
  card: {
    position: "absolute",
    left: spacing.section,
    right: spacing.section,
    bottom: "26%",
    alignItems: "center",
    gap: spacing.tight,
    paddingHorizontal: spacing.section,
  },
  sonarRow: {
    marginBottom: spacing.tight,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 28,
    color: "#FFFFFF",
    textAlign: "center",
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
  },
  dismiss: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.accent,
    marginTop: spacing.column,
  },
});
