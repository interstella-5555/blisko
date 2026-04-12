import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

function ShimmerRow() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 750, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.circle, { opacity }]} />
      <View style={styles.lines}>
        <Animated.View style={[styles.line, styles.lineShort, { opacity }]} />
        <Animated.View style={[styles.line, styles.lineLong, { opacity }]} />
      </View>
    </View>
  );
}

const SHIMMER_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

export function ListShimmer({ count = 4 }: { count?: number }) {
  const keys = SHIMMER_KEYS.slice(0, count);
  return (
    <View>
      {keys.map((k) => (
        <ShimmerRow key={k} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e8e8e8",
  },
  lines: {
    flex: 1,
    gap: 6,
  },
  line: {
    height: 12,
    borderRadius: 4,
    backgroundColor: "#e8e8e8",
  },
  lineShort: {
    width: "60%",
  },
  lineLong: {
    width: "85%",
  },
});
