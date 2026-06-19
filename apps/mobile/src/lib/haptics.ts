import * as Haptics from "expo-haptics";

/**
 * Light tactile tick for primary tap targets (pills, icon buttons, tab presses).
 * Fire-and-forget — errors on unsupported platforms are swallowed.
 */
export function hapticTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
