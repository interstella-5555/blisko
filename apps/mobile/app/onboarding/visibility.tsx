import { router, Stack } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { GridClusterMarker } from "@/components/nearby/GridClusterMarker";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";
import { Button } from "@/components/ui/Button";
import { SonarDot } from "@/components/ui/SonarDot";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { colors, spacing, type as typ } from "@/theme";
import { signOutAndReset } from "../_layout";

type OptionKey = "fill" | "ghost";

const ACCORDION_DURATION = 260;
const ACCORDION_EASING = Easing.out(Easing.cubic);

export default function VisibilityScreen() {
  const { displayName, complete } = useOnboardingStore();
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHasCheckedProfile = useAuthStore((s) => s.setHasCheckedProfile);
  const [expanded, setExpanded] = useState<OptionKey | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const createGhost = trpc.profiling.createGhostProfile.useMutation();
  const profileQuery = trpc.profiles.me.useQuery(undefined, { enabled: false });

  const toggle = (key: OptionKey) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  const handleGhost = async () => {
    setIsCreating(true);
    setError("");
    try {
      const profile = await createGhost.mutateAsync({ displayName });
      setProfile(profile);
      setHasCheckedProfile(true);
      complete();
      setTimeout(() => {
        router.replace("/(tabs)");
      }, 100);
    } catch (err: unknown) {
      const trpcErr = err as { data?: { code?: string } };
      if (trpcErr?.data?.code === "CONFLICT") {
        const { data: existing } = await profileQuery.refetch();
        if (existing) {
          setProfile(existing);
          setHasCheckedProfile(true);
          complete();
          router.replace("/(tabs)");
          return;
        }
      }
      console.error("Failed to create ghost profile:", err);
      setError("Nie udało się utworzyć profilu. Spróbuj ponownie.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleFillProfile = () => {
    router.push("/onboarding/questions-intro");
  };

  const { height: screenHeight } = useWindowDimensions();
  const graphicHeight = Math.round(screenHeight * 0.2);

  const onNext = expanded === "ghost" ? handleGhost : expanded === "fill" ? handleFillProfile : () => {};
  const ctaTestID =
    expanded === "ghost" ? "ghost-profile-button" : expanded === "fill" ? "fill-profile-button" : "visibility-next";
  const ctaTitle = expanded === "ghost" ? "Wchodzę do aplikacji" : "Dalej";

  return (
    <OnboardingScreen
      footer={
        <>
          <Text style={styles.footnote}>Profil możesz uzupełnić lub zmienić później w ustawieniach.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            testID={ctaTestID}
            title={ctaTitle}
            variant="accent"
            onPress={onNext}
            disabled={expanded === null}
            loading={isCreating}
          />
        </>
      }
    >
      <Stack.Screen
        options={{
          header: () => <OnboardingStepHeader label="Krok 2" onBack={() => router.back()} onLogout={signOutAndReset} />,
        }}
      />
      <Text style={styles.title}>Chcesz być widoczny?</Text>

      <ScatteredAvatars height={graphicHeight} shuffleKey={expanded ?? "none"} isGhost={expanded === "ghost"} />

      <View style={styles.options}>
        <OptionCard
          testID="ghost-option"
          title="Na razie przeglądam"
          badge="NIEWIDOCZNY"
          description="Widzisz, kto jest blisko, czym się zajmuje albo interesuje, ale bez szczegółów. Nie zaczepisz, nie napiszesz, nie dołączysz do żadnej grupy, chyba że ktoś Cię zaprosi. Dobre na start, jeśli chcesz najpierw zobaczyć, kto jest w twojej okolicy."
          expanded={expanded === "ghost"}
          onPress={() => toggle("ghost")}
        />

        <OptionCard
          testID="fill-option"
          title="Opowiem o sobie"
          badge="WIDOCZNY"
          description="Najpierw opowiesz o sobie — kilka pytań, nic więcej. Będziesz mieć pełny dostęp do ludzi i grup w Twojej okolicy. Dostaniesz powiadomienie, gdy obok pojawi się ktoś, kogo szukasz albo kto do Ciebie pasuje. Inni też zobaczą Cię na mapie i będą mogli Cię zaczepić."
          expanded={expanded === "fill"}
          onPress={() => toggle("fill")}
        />
      </View>
    </OnboardingScreen>
  );
}

// Hand-picked randomuser.me portraits (6 men + 6 women = 12, matches PIN_COUNT exactly).
// `med` size = 128x128, enough for 44px avatars at 3x retina.
const AVATAR_URLS = [
  "https://randomuser.me/api/portraits/med/men/9.jpg",
  "https://randomuser.me/api/portraits/med/men/37.jpg",
  "https://randomuser.me/api/portraits/med/men/29.jpg",
  "https://randomuser.me/api/portraits/med/men/61.jpg",
  "https://randomuser.me/api/portraits/med/men/51.jpg",
  "https://randomuser.me/api/portraits/med/men/24.jpg",
  "https://randomuser.me/api/portraits/med/women/32.jpg",
  "https://randomuser.me/api/portraits/med/women/76.jpg",
  "https://randomuser.me/api/portraits/med/women/50.jpg",
  "https://randomuser.me/api/portraits/med/women/71.jpg",
  "https://randomuser.me/api/portraits/med/women/79.jpg",
  "https://randomuser.me/api/portraits/med/women/24.jpg",
];
const AVATAR_SIZE = 44;
const EXCLUSION_RADIUS = (AVATAR_SIZE / 2) * 1.25;
const GRID_COLS = 4;
const GRID_ROWS = 3;
const PIN_COUNT = GRID_COLS * GRID_ROWS; // 12
const SHUFFLE_DURATION = 500;
const SHUFFLE_EASING = Easing.inOut(Easing.cubic);

interface Connection {
  from: number;
  to: number;
  strokeWidth: number;
  dasharray: string;
}

const DOTTED_DASH = "1,3";

const AnimatedLine = Animated.createAnimatedComponent(Line);

function ScatteredAvatars({ height, shuffleKey, isGhost }: { height: number; shuffleKey: string; isGhost: boolean }) {
  const [width, setWidth] = useState(0);

  // One (x, y) pair of shared values per pin, fixed count → 12 pairs.
  const xs = Array.from({ length: PIN_COUNT }, () => useSharedValue(0));
  const ys = Array.from({ length: PIN_COUNT }, () => useSharedValue(0));
  const firstRunRef = useRef(true);

  const { positions, connections, sonarConnections } = useMemo(() => {
    if (!width || !height)
      return {
        positions: [] as { x: number; y: number; avatarUrl: string }[],
        connections: [] as Connection[],
        sonarConnections: [] as number[],
      };
    const cellW = width / GRID_COLS;
    const cellH = height / GRID_ROWS;
    const centerX = width / 2;
    const centerY = height / 2;
    // Sonar sits in the middle — push any pin that would overlap it outside the exclusion circle
    const minCenterDist = EXCLUSION_RADIUS + AVATAR_SIZE / 2;
    const pts: { x: number; y: number }[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const jitterX = (Math.random() - 0.5) * cellW * 0.5;
        const jitterY = (Math.random() - 0.5) * cellH * 0.5;
        let cx = c * cellW + cellW / 2 + jitterX;
        let cy = r * cellH + cellH / 2 + jitterY;
        const dx = cx - centerX;
        const dy = cy - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minCenterDist) {
          const angle = dist === 0 ? Math.random() * Math.PI * 2 : Math.atan2(dy, dx);
          cx = centerX + Math.cos(angle) * minCenterDist;
          cy = centerY + Math.sin(angle) * minCenterDist;
        }
        const x = Math.max(0, Math.min(width - AVATAR_SIZE, cx - AVATAR_SIZE / 2));
        const y = Math.max(0, Math.min(height - AVATAR_SIZE, cy - AVATAR_SIZE / 2));
        pts.push({ x, y });
      }
    }
    // Shuffle cell assignments so each pin (by index) lands in a different cell on every shuffle
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    const positions = pts.map((p, i) => ({ ...p, avatarUrl: AVATAR_URLS[i % AVATAR_URLS.length] }));

    // Random connections: each pin gets 1–3 edges to other pins (deduplicated globally)
    const edgeSet = new Set<string>();
    const connections: Connection[] = [];
    for (let i = 0; i < PIN_COUNT; i++) {
      const edgeCount = 1 + Math.floor(Math.random() * 2); // 1 or 2
      // Only consider the 3 nearest pins by coordinates
      const nearest = positions
        .map((p, k) => ({ k, dist: Math.hypot(p.x - positions[i].x, p.y - positions[i].y) }))
        .filter((n) => n.k !== i)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3)
        .map((n) => n.k);
      // Shuffle the top-3 so we randomly pick which ones become edges
      for (let k = nearest.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        [nearest[k], nearest[r]] = [nearest[r], nearest[k]];
      }
      let added = 0;
      for (const j of nearest) {
        if (added >= edgeCount) break;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        connections.push({ from: i, to: j, strokeWidth: 1, dasharray: DOTTED_DASH });
        added++;
      }
    }

    // Sonar → 4 pins, only in "fill profile" mode (not for ghost).
    // 3 picks from top-5 nearest (guaranteed 1 left + 1 right if possible),
    // 4th pick from the 2 furthest pins on whichever side is underrepresented.
    // Independent of the avatar–avatar edge budget above.
    let sonarConnections: number[] = [];
    if (shuffleKey === "fill") {
      const topFive = positions
        .map((p, k) => ({ k, dist: Math.hypot(p.x - centerX + AVATAR_SIZE / 2, p.y - centerY + AVATAR_SIZE / 2) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5)
        .map((n) => n.k);
      const shuffled = [...topFive];
      for (let k = shuffled.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        [shuffled[k], shuffled[r]] = [shuffled[r], shuffled[k]];
      }
      // Split by side of sonar. If both sides exist, guarantee one from each.
      const left = shuffled.filter((k) => positions[k].x + AVATAR_SIZE / 2 < centerX);
      const right = shuffled.filter((k) => positions[k].x + AVATAR_SIZE / 2 >= centerX);
      const picked: number[] = [];
      if (left.length > 0 && right.length > 0) {
        picked.push(left[0], right[0]);
        const rest = shuffled.filter((k) => !picked.includes(k));
        if (rest.length > 0) picked.push(rest[0]);
      } else {
        picked.push(...shuffled.slice(0, 3));
      }
      // 4th: balance the sides. Pick from the 2 furthest pins on the underrepresented side.
      const pickedLeft = picked.filter((k) => positions[k].x + AVATAR_SIZE / 2 < centerX).length;
      const pickedRight = picked.length - pickedLeft;
      const wantLeft = pickedLeft < pickedRight;
      const farCandidates = positions
        .map((p, k) => ({
          k,
          dist: Math.hypot(p.x + AVATAR_SIZE / 2 - centerX, p.y + AVATAR_SIZE / 2 - centerY),
          onSide: wantLeft ? p.x + AVATAR_SIZE / 2 < centerX : p.x + AVATAR_SIZE / 2 >= centerX,
        }))
        .filter((p) => p.onSide && !picked.includes(p.k))
        .sort((a, b) => b.dist - a.dist)
        .slice(0, 2);
      if (farCandidates.length > 0) {
        picked.push(farCandidates[Math.floor(Math.random() * farCandidates.length)].k);
      }
      sonarConnections = picked;
    }

    return { positions, connections, sonarConnections };
  }, [width, height, shuffleKey]);

  // Drive each pin's shared values toward the new target — snap on first population, animate thereafter.
  useEffect(() => {
    if (!positions.length) return;
    const snap = firstRunRef.current;
    positions.forEach((p, i) => {
      if (snap) {
        xs[i].value = p.x;
        ys[i].value = p.y;
      } else {
        xs[i].value = withTiming(p.x, { duration: SHUFFLE_DURATION, easing: SHUFFLE_EASING });
        ys[i].value = withTiming(p.y, { duration: SHUFFLE_DURATION, easing: SHUFFLE_EASING });
      }
    });
    firstRunRef.current = false;
  }, [positions, xs, ys]);

  return (
    <View style={[styles.graphic, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          {connections.map((c) => (
            <ConnectionLine
              key={`${c.from}-${c.to}-${c.dasharray}`}
              x1Source={xs[c.from]}
              y1Source={ys[c.from]}
              x2Source={xs[c.to]}
              y2Source={ys[c.to]}
              strokeWidth={c.strokeWidth}
              dasharray={c.dasharray}
            />
          ))}
          {sonarConnections.map((pinIdx) => (
            <SonarConnectionLine
              key={`sonar-${pinIdx}`}
              cx={width / 2}
              cy={height / 2}
              xSource={xs[pinIdx]}
              ySource={ys[pinIdx]}
            />
          ))}
        </Svg>
      ) : null}
      {positions.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: pin index IS the stable identity — xs[i]/ys[i] shared values are bound to index, array length is fixed (PIN_COUNT), pins don't reorder on shuffle (only coords animate)
        <AnimatedPin key={`pin-${i}`} x={xs[i]} y={ys[i]} avatarUrl={p.avatarUrl} isGhost={isGhost} />
      ))}
      <View style={styles.sonarCenter} pointerEvents="none">
        <SonarDot size={10} color={colors.accent} />
      </View>
    </View>
  );
}

function AnimatedPin({
  x,
  y,
  avatarUrl,
  isGhost,
}: {
  x: SharedValue<number>;
  y: SharedValue<number>;
  avatarUrl: string;
  isGhost: boolean;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <Animated.View style={[styles.pin, animatedStyle]}>
      <GridClusterMarker avatarUrl={avatarUrl} isGhost={isGhost} />
    </Animated.View>
  );
}

function SonarConnectionLine({
  cx,
  cy,
  xSource,
  ySource,
}: {
  cx: number;
  cy: number;
  xSource: SharedValue<number>;
  ySource: SharedValue<number>;
}) {
  const animatedProps = useAnimatedProps(() => ({
    x1: cx,
    y1: cy,
    x2: xSource.value + AVATAR_SIZE / 2,
    y2: ySource.value + AVATAR_SIZE / 2,
  }));
  return <AnimatedLine animatedProps={animatedProps} stroke={colors.accent} strokeWidth={1} />;
}

function ConnectionLine({
  x1Source,
  y1Source,
  x2Source,
  y2Source,
  strokeWidth,
  dasharray,
}: {
  x1Source: SharedValue<number>;
  y1Source: SharedValue<number>;
  x2Source: SharedValue<number>;
  y2Source: SharedValue<number>;
  strokeWidth: number;
  dasharray: string;
}) {
  const animatedProps = useAnimatedProps(() => ({
    x1: x1Source.value + AVATAR_SIZE / 2,
    y1: y1Source.value + AVATAR_SIZE / 2,
    x2: x2Source.value + AVATAR_SIZE / 2,
    y2: y2Source.value + AVATAR_SIZE / 2,
  }));
  return (
    <AnimatedLine
      animatedProps={animatedProps}
      stroke={colors.accent}
      strokeWidth={strokeWidth}
      strokeDasharray={dasharray}
    />
  );
}

interface OptionCardProps {
  testID: string;
  title: string;
  badge: string;
  description: string;
  expanded: boolean;
  onPress: () => void;
}

function OptionCard({ testID, title, badge, description, expanded, onPress }: OptionCardProps) {
  const measuredHeight = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: ACCORDION_DURATION,
      easing: ACCORDION_EASING,
    });
  }, [expanded, progress]);

  const collapsibleStyle = useAnimatedStyle(() => ({
    height: measuredHeight.value * progress.value,
    opacity: progress.value,
  }));

  const onMeasure = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== measuredHeight.value) measuredHeight.value = h;
  };

  const body = (
    <>
      <View style={styles.divider} />
      <Text style={styles.description}>{description}</Text>
    </>
  );

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.card, expanded ? styles.cardExpanded : styles.cardCollapsed]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, !expanded && styles.dim]}>{title}</Text>
        </View>
        <Text style={[styles.badge, !expanded && styles.badgeDim]}>{badge}</Text>
      </View>

      {/* Invisible measurer — reports true content height without affecting layout */}
      <View style={styles.measurer} pointerEvents="none" onLayout={onMeasure}>
        {body}
      </View>

      <Animated.View style={[styles.collapsible, collapsibleStyle]}>{body}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  graphic: {
    marginBottom: spacing.section,
    overflow: "hidden",
    position: "relative",
  },
  pin: {
    position: "absolute",
  },
  sonarCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typ.display,
    marginBottom: spacing.block,
  },
  options: {
    gap: spacing.gutter,
  },
  card: {
    borderWidth: 1,
    padding: spacing.column,
    overflow: "hidden",
  },
  cardExpanded: {
    borderColor: colors.ink,
    backgroundColor: colors.bg,
  },
  cardCollapsed: {
    borderColor: colors.rule,
    backgroundColor: "transparent",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.column,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...typ.heading,
  },
  subtitle: {
    ...typ.body,
    color: colors.muted,
  },
  badge: {
    ...typ.label,
    color: colors.accent,
    marginTop: 6,
  },
  badgeDim: {
    color: colors.muted,
  },
  dim: {
    color: colors.muted,
  },
  measurer: {
    position: "absolute",
    opacity: 0,
    left: spacing.column,
    right: spacing.column,
  },
  collapsible: {
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule,
    marginVertical: spacing.column,
  },
  description: {
    ...typ.body,
    lineHeight: 22,
  },
  footnote: {
    ...typ.caption,
    color: colors.muted,
    textAlign: "center",
  },
  error: {
    ...typ.body,
    color: colors.status.error.text,
    textAlign: "center",
  },
});
