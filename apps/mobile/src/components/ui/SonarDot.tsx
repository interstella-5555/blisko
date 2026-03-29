import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

interface SonarDotProps {
  size?: number;
  color?: string;
}

export function SonarDot({ size = 8, color = "#8B8680" }: SonarDotProps) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const kick = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ringDuration = 1400;
    const pause = 2200;
    const cycle = ringDuration + pause;
    const stagger = 350;

    function ringLoop(anim: Animated.Value, delay: number) {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: ringDuration, useNativeDriver: true }),
          Animated.delay(cycle - ringDuration - delay),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
    }

    const all = Animated.parallel([
      ringLoop(ring1, 0),
      ringLoop(ring2, stagger),
      Animated.loop(
        Animated.sequence([
          Animated.timing(kick, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.timing(kick, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.delay(cycle - 330),
        ]),
      ),
    ]);
    all.start();
    return () => all.stop();
  }, [ring1, ring2, kick]);

  const maxRing = size * 3.5;

  function ringStyle(anim: Animated.Value) {
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      borderColor: color,
      transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, maxRing / size] }) }],
      opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 0.3, 0] }),
    };
  }

  return (
    <View style={[styles.container, { width: maxRing, height: maxRing }]}>
      <Animated.View style={[styles.ring, ringStyle(ring1)]} />
      <Animated.View style={[styles.ring, ringStyle(ring2)]} />
      <Animated.View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            transform: [{ scale: kick.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
  },
  dot: {
    zIndex: 2,
  },
});
