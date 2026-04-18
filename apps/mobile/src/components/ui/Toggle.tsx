import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Polyline } from "react-native-svg";
import { colors, fonts } from "@/theme";

type IconName = "check" | "x" | "minus" | "plus";

interface ToggleProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  icons?: { off?: IconName; on?: IconName };
  labels?: { off: string; on: string };
  testID?: string;
}

const TRACK_HEIGHT = 30;
const THUMB_SIZE = 26;
const THUMB_INSET = 2;
const DEFAULT_TRACK_WIDTH = 52;
const LABEL_HORIZONTAL_PADDING = 16; // 8px each side inside thumb
const MIN_LABEL_THUMB_WIDTH = 40; // prevents flash-of-tiny on first render before onLayout
const DURATION = 240;
const EASING = Easing.out(Easing.cubic);

export function Toggle({ value, onValueChange, disabled, icons, labels, testID }: ToggleProps) {
  const progress = useSharedValue(value ? 1 : 0);
  const [labelMaxWidth, setLabelMaxWidth] = useState(0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: DURATION, easing: EASING });
  }, [value, progress]);

  const thumbWidth = labels ? Math.max(MIN_LABEL_THUMB_WIDTH, labelMaxWidth + LABEL_HORIZONTAL_PADDING) : THUMB_SIZE;
  const trackWidth = labels ? thumbWidth * 2 + THUMB_INSET * 2 : DEFAULT_TRACK_WIDTH;
  const thumbSlide = trackWidth - thumbWidth - THUMB_INSET * 2;

  const captureLabelWidth = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > labelMaxWidth) setLabelMaxWidth(w);
  };

  const offIcon = icons?.off;
  const onIcon = icons?.on ?? (icons || labels ? undefined : "check");

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.rule, colors.accent]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, thumbSlide]) }],
  }));

  const onContentStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.4, 1]) }],
  }));
  const offContentStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.4]) }],
  }));

  const bgLabelOffStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    color: interpolateColor(progress.value, [0, 1], [colors.muted, "rgba(255,255,255,0.75)"]),
  }));
  const bgLabelOnStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(!value);
  };

  return (
    <Pressable onPress={handlePress} disabled={disabled} testID={testID} hitSlop={8}>
      <Animated.View style={[styles.track, { width: trackWidth, opacity: disabled ? 0.4 : 1 }, trackStyle]}>
        {labels ? (
          <>
            <View
              style={[styles.bgLabelContainer, { left: 0, width: thumbWidth + THUMB_INSET * 2 }]}
              pointerEvents="none"
            >
              <Animated.Text style={[styles.bgLabelText, bgLabelOffStyle]}>{labels.off}</Animated.Text>
            </View>
            <View
              style={[styles.bgLabelContainer, { right: 0, width: thumbWidth + THUMB_INSET * 2 }]}
              pointerEvents="none"
            >
              <Animated.Text style={[styles.bgLabelText, styles.bgLabelOnMuted, bgLabelOnStyle]}>
                {labels.on}
              </Animated.Text>
            </View>
          </>
        ) : null}
        <Animated.View style={[styles.thumb, { width: thumbWidth }, thumbStyle]} pointerEvents="none">
          {labels ? (
            <>
              <Animated.Text
                style={[styles.thumbText, styles.thumbTextOff, offContentStyle]}
                onLayout={captureLabelWidth}
              >
                {labels.off}
              </Animated.Text>
              <Animated.Text
                style={[styles.thumbText, styles.thumbTextOn, onContentStyle]}
                onLayout={captureLabelWidth}
              >
                {labels.on}
              </Animated.Text>
            </>
          ) : (
            <>
              {offIcon ? (
                <Animated.View style={[styles.iconWrap, offContentStyle]}>
                  <Icon name={offIcon} color={colors.muted} />
                </Animated.View>
              ) : null}
              {onIcon ? (
                <Animated.View style={[styles.iconWrap, onContentStyle]}>
                  <Icon name={onIcon} color={colors.accent} />
                </Animated.View>
              ) : null}
            </>
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function Icon({ name, color }: { name: IconName; color: string }) {
  const stroke = {
    stroke: color,
    strokeWidth: 2.5,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "check":
      return (
        <Svg width={12} height={12} viewBox="0 0 14 14">
          <Polyline points="2.5,7.5 5.5,10.5 11.5,3.5" {...stroke} />
        </Svg>
      );
    case "x":
      return (
        <Svg width={12} height={12} viewBox="0 0 14 14">
          <Polyline points="3,3 11,11" {...stroke} />
          <Polyline points="11,3 3,11" {...stroke} />
        </Svg>
      );
    case "minus":
      return (
        <Svg width={12} height={12} viewBox="0 0 14 14">
          <Polyline points="3.5,7 10.5,7" {...stroke} />
        </Svg>
      );
    case "plus":
      return (
        <Svg width={12} height={12} viewBox="0 0 14 14">
          <Polyline points="3.5,7 10.5,7" {...stroke} />
          <Polyline points="7,3.5 7,10.5" {...stroke} />
        </Svg>
      );
  }
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    position: "relative",
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    top: THUMB_INSET,
    left: THUMB_INSET,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  iconWrap: {
    position: "absolute",
  },
  thumbText: {
    position: "absolute",
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  thumbTextOff: {
    color: colors.ink,
  },
  thumbTextOn: {
    color: colors.accent,
  },
  bgLabelContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "48%",
    alignItems: "center",
    justifyContent: "center",
  },
  bgLabelLeft: { left: 0 },
  bgLabelRight: { right: 0 },
  bgLabelText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  bgLabelOnMuted: {
    color: colors.muted,
  },
});
