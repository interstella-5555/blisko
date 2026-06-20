import { Trans, useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hapticTap } from "@/lib/haptics";
import { fonts, spacing } from "@/theme";

// "How it works" intro carousel (BLI-293). Three concrete scenes — not an
// abstract pitch — so the mechanic ("broadcast a status, ping the person nearby")
// lands in the first 10 seconds, before the user invests in building a profile.
// Replaces the single hook screen. Dark aesthetic + pulsing bubbles carried over
// from the old hook so the brand feel stays continuous into onboarding.

const SCENE_BG = "#1A1A1A";
const ACCENT = "#D4851C";
const AUTOPLAY_MS = 3000;

const { width: SCREEN_W } = Dimensions.get("window");

const BUBBLES = [
  { x: 0.16, y: 0.14, size: 34, delay: 0 },
  { x: 0.62, y: 0.1, size: 26, delay: 200 },
  { x: 0.82, y: 0.2, size: 30, delay: 400 },
  { x: 0.34, y: 0.26, size: 22, delay: 100 },
  { x: 0.72, y: 0.74, size: 36, delay: 300 },
  { x: 0.18, y: 0.7, size: 24, delay: 500 },
  { x: 0.86, y: 0.6, size: 28, delay: 150 },
  { x: 0.44, y: 0.82, size: 32, delay: 350 },
  { x: 0.12, y: 0.86, size: 20, delay: 250 },
  { x: 0.78, y: 0.9, size: 26, delay: 450 },
];

function PulsingBubble({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const fadeIn = Animated.timing(opacity, {
      toValue: 0.5,
      duration: 600,
      delay,
      useNativeDriver: true,
    });
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.2,
          duration: 1200 + delay,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.8,
          duration: 1200 + delay,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    fadeIn.start(() => pulse.start());
    return () => {
      fadeIn.stop();
      pulse.stop();
    };
  }, [opacity, scale, delay]);

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left: x * SCREEN_W,
          top: `${y * 100}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

function Scene({ emoji, headline }: { emoji: string; headline: React.ReactNode }) {
  return (
    <View style={[styles.scene, { width: SCREEN_W }]}>
      <View style={styles.bubbleLayer} pointerEvents="none">
        {BUBBLES.map((b) => (
          <PulsingBubble key={`${b.x}-${b.y}`} x={b.x} y={b.y} size={b.size} delay={b.delay} />
        ))}
      </View>
      <View style={styles.sceneInner}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.headline}>{headline}</Text>
      </View>
    </View>
  );
}

export default function IntroScreen() {
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  const scenes = [
    {
      emoji: "☕",
      headline: <Trans>Podoba Ci się ktoś w kawiarni? Pinguj zamiast zgadywać.</Trans>,
    },
    {
      emoji: "💼",
      headline: <Trans>Szukasz pracy? Ktoś obok buduje zespół.</Trans>,
    },
    {
      emoji: "🎸",
      headline: <Trans>Szukasz muzyka? Siedzi dwa stoliki dalej.</Trans>,
    },
  ];
  const lastIndex = scenes.length - 1;

  const goToOnboarding = useCallback(() => {
    router.replace("/onboarding" as never);
  }, []);

  const scrollTo = useCallback((i: number) => {
    indexRef.current = i;
    setIndex(i);
    scrollRef.current?.scrollTo({ x: i * SCREEN_W, animated: true });
  }, []);

  // Auto-play: advance every 3s, stop on the last scene (let the user read the
  // final CTA rather than looping back into the pitch).
  useEffect(() => {
    if (index >= lastIndex) return;
    const timer = setTimeout(() => scrollTo(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [index, lastIndex, scrollTo]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (next !== indexRef.current) {
      indexRef.current = next;
      setIndex(next);
    }
  };

  const handleSkip = () => {
    hapticTap();
    goToOnboarding();
  };

  const handleStart = () => {
    hapticTap();
    goToOnboarding();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {scenes.map((s) => (
          <Scene key={s.emoji} emoji={s.emoji} headline={s.headline} />
        ))}
      </ScrollView>

      <Pressable
        testID="intro-skip-button"
        onPress={handleSkip}
        hitSlop={12}
        style={[styles.skip, { top: insets.top + spacing.tight }]}
      >
        <Text style={styles.skipText}>
          <Trans>Pomiń</Trans>
        </Text>
      </Pressable>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.section }]}>
        <View style={styles.dots} testID="intro-dots">
          {scenes.map((s, i) => (
            <View key={s.emoji} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        {index === lastIndex ? (
          <Pressable testID="intro-start-button" style={styles.cta} onPress={handleStart}>
            <Text style={styles.ctaText}>{t`Zaczynam`}</Text>
          </Pressable>
        ) : (
          <Pressable
            testID="intro-next-button"
            style={styles.ctaGhost}
            onPress={() => {
              hapticTap();
              scrollTo(index + 1);
            }}
          >
            <Text style={styles.ctaGhostText}>{t`Dalej`}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCENE_BG,
  },
  scene: {
    flex: 1,
  },
  bubbleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  bubble: {
    position: "absolute",
    backgroundColor: ACCENT,
  },
  sceneInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.section * 2,
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.block,
  },
  headline: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 40,
  },
  skip: {
    position: "absolute",
    right: spacing.section,
  },
  skipText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.5,
  },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    gap: spacing.section,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.tick,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dotActive: {
    width: 22,
    backgroundColor: ACCENT,
  },
  cta: {
    backgroundColor: ACCENT,
    paddingHorizontal: 48,
    paddingVertical: 15,
    borderRadius: 28,
  },
  ctaText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  ctaGhost: {
    paddingHorizontal: 48,
    paddingVertical: 15,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  ctaGhostText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
