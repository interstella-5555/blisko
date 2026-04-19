import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/theme";

interface OnboardingScreenProps {
  children: ReactNode;
  /** Footer sits at the bottom of the viewport when content is short, and directly below content when content is tall. */
  footer?: ReactNode;
}

export function OnboardingScreen({ children, footer }: OnboardingScreenProps) {
  // paddingBottom collapses as keyboard opens so the footer sits flush above it.
  const insets = useSafeAreaInsets();
  const keyboard = useReanimatedKeyboardAnimation();
  const containerStyle = useAnimatedStyle(() => ({
    paddingBottom: (1 - keyboard.progress.value) * insets.bottom,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
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
