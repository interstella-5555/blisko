import { Pressable, StyleSheet, Text, View } from "react-native";
import { useIsGhost } from "@/hooks/useIsGhost";
import { formatDistance, formatLastActive } from "../../lib/format";
import { getNearbySnippet } from "../../lib/nearbySnippet";
import { colors, fonts, spacing, type as typ } from "../../theme";
import { Avatar } from "../ui/Avatar";
import { IconBulletRose } from "../ui/icons";

export type UserRowStatus = "none" | "waved" | "incoming" | "friend";

interface UserRowProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  status: UserRowStatus;
  onPress: () => void;
  // Nearby-only (optional)
  distance?: number;
  rankScore?: number;
  matchScore?: number;
  currentStatus?: string | null;
  bioEssence?: string | null;
  hasStatusMatch?: boolean;
  lastActiveAt?: Date | string | null;
  // Waves-only (optional)
  timestamp?: string;
}

const formatRelativeTime = (dateString: string): string => {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "teraz";
  if (diffMins < 60) return `${diffMins} min temu`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours} godz. temu`;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return `${diffDays} dni temu`;
  return new Date(dateString).toLocaleDateString("pl-PL");
};

function getMatchColor(percent: number): string {
  if (percent >= 70) return colors.status.success.text;
  if (percent >= 40) return colors.status.warning.text;
  return colors.muted;
}

const statusConfig: Record<Exclude<UserRowStatus, "none">, { label: string; color: string }> = {
  waved: { label: "PINGOWANO", color: colors.muted },
  incoming: { label: "CHCE CIĘ POZNAĆ", color: colors.status.warning.text },
  friend: { label: "ZNAJOMY", color: colors.status.success.text },
};

export function UserRow({
  displayName,
  avatarUrl,
  distance,
  bio,
  rankScore,
  matchScore,
  currentStatus,
  bioEssence,
  hasStatusMatch,
  lastActiveAt,
  status,
  onPress,
  timestamp,
}: UserRowProps) {
  const isGhost = useIsGhost();
  const hasNearbyData = distance !== undefined;
  const { text: snippet, isHighlight } = hasNearbyData
    ? getNearbySnippet(currentStatus, bioEssence, bio)
    : { text: bio || null, isHighlight: false };
  const matchPercent = matchScore ?? Math.round((rankScore ?? 0) * 100);

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Avatar uri={avatarUrl} name={displayName} size={44} blurred={isGhost} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          {matchPercent > 0 && (
            <View style={styles.matchBadge}>
              <IconBulletRose size={10} color={getMatchColor(matchPercent)} />
              <Text style={[styles.matchText, { color: getMatchColor(matchPercent) }]}>{matchPercent}%</Text>
            </View>
          )}
          {distance !== undefined && <Text style={styles.distance}>{formatDistance(distance)}</Text>}
          {distance !== undefined && lastActiveAt && (
            <Text style={styles.lastActive}>{formatLastActive(lastActiveAt)}</Text>
          )}
          {!distance && timestamp && <Text style={styles.distance}>{formatRelativeTime(timestamp)}</Text>}
          {hasStatusMatch && (
            <View style={styles.naTerazBadge}>
              <View style={styles.naTerazDot} />
              <Text style={styles.naTerazText}>Na teraz</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {status !== "none" && (
            <Text style={[styles.statusLabel, { color: statusConfig[status].color }]}>
              {statusConfig[status].label}
            </Text>
          )}
        </View>
        {snippet && (
          <Text style={[styles.snippet, isHighlight && styles.snippetHighlight]} numberOfLines={4}>
            {snippet}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.gutter,
    paddingHorizontal: spacing.column,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  info: {
    flex: 1,
    marginLeft: spacing.gutter,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.tight,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.ink,
    flexShrink: 1,
  },
  matchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  matchText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
  },
  distance: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
  lastActive: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
  statusLabel: {
    ...typ.label,
  },
  snippet: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  snippetHighlight: {
    color: colors.ink,
    fontFamily: fonts.sansMedium,
  },
  naTerazBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FDF5EC",
    borderWidth: 1,
    borderColor: "#E8C9A0",
    borderRadius: 8,
    paddingVertical: 1,
    paddingHorizontal: 7,
  },
  naTerazDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D4851C",
  },
  naTerazText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#D4851C",
  },
});
