import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, spacing } from "../../src/theme";

const BUBBLES = [
  { x: 60, y: 180, size: 36, delay: 0 },
  { x: 200, y: 120, size: 28, delay: 200 },
  { x: 310, y: 220, size: 32, delay: 400 },
  { x: 140, y: 340, size: 24, delay: 100 },
  { x: 260, y: 400, size: 38, delay: 300 },
  { x: 80, y: 480, size: 26, delay: 500 },
  { x: 330, y: 350, size: 30, delay: 150 },
  { x: 180, y: 520, size: 34, delay: 350 },
  { x: 50, y: 600, size: 22, delay: 250 },
  { x: 290, y: 560, size: 28, delay: 450 },
];

function PulsingBubble({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const fadeIn = Animated.timing(opacity, {
      toValue: 0.6,
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
          left: x,
          top: y,
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

export default function HookScreen() {
  const ctaOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(ctaOpacity, {
      toValue: 1,
      duration: 500,
      delay: 500,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      router.replace("/onboarding" as never);
    }, 5000);

    return () => clearTimeout(timer);
  }, [ctaOpacity]);

  return (
    <View style={styles.container}>
      {BUBBLES.map((b) => (
        <PulsingBubble key={`${b.x}-${b.y}`} x={b.x} y={b.y} size={b.size} delay={b.delay} />
      ))}

      <View style={styles.overlay}>
        <Text style={styles.headline}>Świat jest pełen ludzi, których potrzebujesz.</Text>
        <Animated.View style={{ opacity: ctaOpacity }}>
          <Pressable style={styles.cta} onPress={() => router.replace("/onboarding" as never)}>
            <Text style={styles.ctaText}>Zacznij</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A1A",
  },
  bubble: {
    position: "absolute",
    backgroundColor: "#D4851C",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.section * 2,
  },
  headline: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 38,
    marginBottom: spacing.block,
  },
  cta: {
    backgroundColor: "#D4851C",
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 28,
  },
  ctaText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
