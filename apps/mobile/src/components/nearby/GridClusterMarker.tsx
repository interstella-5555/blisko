import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";

export interface ClusterUser {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  hasStatusMatch?: boolean;
}

interface GridClusterMarkerProps {
  users: ClusterUser[];
  highlighted?: boolean;
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

export function GridClusterMarker({ users, highlighted }: GridClusterMarkerProps) {
  const count = users.length;
  const hasPulsing = users.some((u) => u.hasStatusMatch);

  // Single user - show avatar
  if (count === 1) {
    const user = users[0];
    return (
      <PulsingWrapper active={hasPulsing}>
        <View style={[styles.singleContainer, highlighted && styles.highlighted]}>
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{user.displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
      </PulsingWrapper>
    );
  }

  // 2-3 users - show stacked avatars
  if (count <= 3) {
    return (
      <PulsingWrapper active={hasPulsing}>
        <View style={[styles.stackContainer, highlighted && styles.highlightedStack]}>
          {users.slice(0, 3).map((user, index) => (
            <View key={user.id} style={[styles.stackItem, { marginLeft: index * 14, zIndex: 3 - index }]}>
              {user.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.smallAvatar} />
              ) : (
                <View style={styles.smallAvatarPlaceholder}>
                  <Text style={styles.smallAvatarText}>{user.displayName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </PulsingWrapper>
    );
  }

  // 4+ users - show count badge
  return (
    <PulsingWrapper active={hasPulsing}>
      <View style={[styles.badgeContainer, highlighted && styles.highlighted]}>
        <Text style={styles.badgeText}>{count}</Text>
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
  stackContainer: {
    flexDirection: "row",
    height: 36,
    paddingRight: 8,
  },
  stackItem: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  smallAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  smallAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  smallAvatarText: {
    fontSize: 12,
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
  highlighted: {
    borderWidth: 3,
    borderColor: "#007AFF",
  },
  highlightedStack: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 20,
    padding: 4,
  },
});
