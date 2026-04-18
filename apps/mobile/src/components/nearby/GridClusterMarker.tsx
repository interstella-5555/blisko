import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { useIsGhost } from "@/hooks/useIsGhost";
import { ghostBlurRadius } from "@/theme";

interface GridClusterMarkerProps {
  count?: number;
  avatarUrl?: string | null;
  displayName?: string | null;
  highlighted?: boolean;
  /** Override ghost blur (defaults to the current user's ghost state from auth store) */
  isGhost?: boolean;
}

function PulsingWrapper({ active, children }: { active: boolean; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.15,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, scale]);

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

export function GridClusterMarker({
  count,
  avatarUrl,
  displayName,
  highlighted,
  isGhost: isGhostOverride,
}: GridClusterMarkerProps) {
  const isGhostFromStore = useIsGhost();
  const isGhost = isGhostOverride ?? isGhostFromStore;

  // Cluster with multiple points — show count badge
  if (count && count > 1) {
    return (
      <PulsingWrapper active={!!highlighted}>
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      </PulsingWrapper>
    );
  }

  // Single user — show avatar
  if (avatarUrl) {
    return (
      <PulsingWrapper active={!!highlighted}>
        <View style={styles.singleContainer}>
          <Image source={{ uri: avatarUrl }} style={styles.avatar} blurRadius={isGhost ? ghostBlurRadius : 0} />
        </View>
      </PulsingWrapper>
    );
  }

  // Placeholder — no avatar
  return (
    <PulsingWrapper active={!!highlighted}>
      <View style={styles.singleContainer}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{(displayName ?? "?").charAt(0).toUpperCase()}</Text>
        </View>
      </View>
    </PulsingWrapper>
  );
}

const styles = StyleSheet.create({
  singleContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    padding: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  badgeContainer: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  badgeText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
});
