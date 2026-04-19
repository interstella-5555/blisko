import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/theme";
import { SonarDot } from "./SonarDot";

// Geometry must match `assets/splash-icon.png`: centred column of dot + gap +
// wordmark, vertically centred on the screen. The PNG has dot-only (no rings),
// so when this component mounts and <SonarDot> starts pulsing the rings
// emanate from zero — no scale-jump at the native-splash → RN handover.
//
// The negative vertical margin around <SonarDot> is there because the
// component reserves `size * 3.5` of layout space for fully-expanded rings
// (84pt for size=24). Without the negative margin the stack would be ~60pt
// taller than the PNG's stack and everything below would sit lower than in
// the PNG, producing a visible jump on the wordmark at handover.
const DOT_SIZE = 24;
const SONAR_CONTAINER = DOT_SIZE * 3.5;
const SONAR_PAD_Y = (SONAR_CONTAINER - DOT_SIZE) / 2;

export function SplashHold() {
  return (
    <View style={styles.container}>
      <View style={styles.stack}>
        <View style={styles.sonarWrap}>
          <SonarDot size={DOT_SIZE} color={colors.accent} />
        </View>
        <Text style={styles.wordmark}>Blisko</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  stack: {
    alignItems: "center",
  },
  sonarWrap: {
    marginVertical: -SONAR_PAD_Y,
  },
  wordmark: {
    marginTop: 44,
    fontFamily: fonts.serif,
    fontSize: 40,
    // No explicit lineHeight — Instrument Serif needs ~1.2x for ascenders +
    // descenders to render without clipping. Leaving it unset lets RN
    // compute based on the font's own metrics.
    color: colors.ink,
    textAlign: "center",
  },
});
