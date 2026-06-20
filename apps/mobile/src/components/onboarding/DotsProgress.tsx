import { StyleSheet, View } from "react-native";
import { colors, spacing } from "@/theme";

interface DotsProgressProps {
  /** Total number of steps. */
  count: number;
  /** Zero-based index of the active step. */
  active: number;
}

/**
 * Numberless onboarding progress (v4, BLI-292). Replaces "Krok N" / "Pytanie N/7"
 * counters — the active dot widens into a pill, the rest stay small. Keeps the
 * "this is short, just a few taps" feeling the 3-step flow is built around.
 */
export function DotsProgress({ count, active }: DotsProgressProps) {
  return (
    <View style={styles.row} testID="onboarding-dots">
      {Array.from({ length: count }, (_, i) => i).map((i) => (
        <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.tick,
    marginBottom: spacing.block,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.rule,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.accent,
  },
});
