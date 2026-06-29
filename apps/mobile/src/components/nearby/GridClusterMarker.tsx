import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { IconPerson } from "@/components/ui/icons";
import { useIsGhost } from "@/hooks/useIsGhost";
import { resolveAvatarUri } from "@/lib/avatar";
import { colors, ghostBlurRadius } from "@/theme";

const AVATAR_SIZE_PT = 40;

interface GridClusterMarkerProps {
  count?: number;
  avatarUrl?: string | null;
  displayName?: string | null;
  highlighted?: boolean;
  /** Do-not-disturb — render a muted cue on the bubble (BLI-294). */
  dnd?: boolean;
  /** Profile created within the last 24h — render a "NEW" badge on the bubble (BLI-294). */
  isNew?: boolean;
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

/** DND dot + "NEW" badge overlaid on a single-user bubble (BLI-294). */
function BubbleCues({ dnd, isNew }: { dnd?: boolean; isNew?: boolean }) {
  return (
    <>
      {dnd ? (
        <View style={styles.dndDot}>
          <View style={styles.dndBar} />
        </View>
      ) : null}
      {isNew ? (
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>NEW</Text>
        </View>
      ) : null}
    </>
  );
}

export function GridClusterMarker({
  count,
  avatarUrl,
  displayName,
  highlighted,
  dnd,
  isNew,
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

  // Single user — show avatar (routed through imgproxy helper, BLI-254).
  const resolvedUri = resolveAvatarUri(avatarUrl, AVATAR_SIZE_PT);
  if (resolvedUri) {
    return (
      <PulsingWrapper active={!!highlighted}>
        <View style={styles.singleContainer}>
          <Image source={{ uri: resolvedUri }} style={styles.avatar} blurRadius={isGhost ? ghostBlurRadius : 0} />
          <BubbleCues dnd={dnd} isNew={isNew} />
        </View>
      </PulsingWrapper>
    );
  }

  // Placeholder — no avatar
  return (
    <PulsingWrapper active={!!highlighted}>
      <View style={styles.singleContainer}>
        <View style={styles.avatarPlaceholder} accessibilityLabel={displayName ?? undefined}>
          <IconPerson size={22} color={colors.ink} />
        </View>
        <BubbleCues dnd={dnd} isNew={isNew} />
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
    // No-photo person: white disc (matches the count bubble + avatar ring) with a person glyph.
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  badgeContainer: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    // Match the avatar markers' white ring instead of a loud blue (singleContainer bg).
    backgroundColor: "#fff",
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
    color: colors.ink,
  },
  // DND cue — muted grey dot with a small white bar (a quiet "do not disturb" sign).
  dndDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#8A8175",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  dndBar: {
    width: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#fff",
  },
  // "NEW" badge — small accent pill above the bubble.
  newBadge: {
    position: "absolute",
    top: -7,
    left: -4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 7,
    backgroundColor: "#D4763A",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  newBadgeText: {
    fontSize: 8,
    fontWeight: "bold",
    letterSpacing: 0.4,
    color: "#fff",
  },
});
