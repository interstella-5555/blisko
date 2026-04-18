import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "@/theme";

interface OnboardingScreenProps {
  children: ReactNode;
  /** Footer sits at the bottom of the viewport when content is short, and directly below content when content is tall. */
  footer?: ReactNode;
}

export function OnboardingScreen({ children, footer }: OnboardingScreenProps) {
  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.section,
    paddingTop: spacing.tight,
    paddingBottom: spacing.section,
  },
  content: {
    flex: 1,
  },
  footer: {
    marginTop: spacing.section,
    gap: spacing.column,
  },
});
