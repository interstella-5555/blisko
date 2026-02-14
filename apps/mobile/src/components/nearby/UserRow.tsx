import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, fonts, type as typ, spacing } from '../../theme';
import { Avatar } from '../ui/Avatar';
import { IconBulletRose } from '../ui/icons';

export type UserRowStatus = 'none' | 'waved' | 'incoming' | 'friend';

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
  commonInterests?: string[];
  shortSnippet?: string | null;
  analysisReady?: boolean;
  // Waves-only (optional)
  timestamp?: string;
}

const formatDistance = (meters: number): string => {
  if (meters < 50) {
    return 'tuż obok';
  }
  const rounded = Math.round(meters / 100) * 100;
  if (rounded < 1000) {
    return `~${rounded} m`;
  }
  return `~${(rounded / 1000).toFixed(1)} km`;
};

const formatRelativeTime = (dateString: string): string => {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'teraz';
  if (diffMins < 60) return `${diffMins} min temu`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours} godz. temu`;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return `${diffDays} dni temu`;
  return new Date(dateString).toLocaleDateString('pl-PL');
};

function getSnippetText(
  shortSnippet: string | null,
  analysisReady: boolean,
  commonInterests: string[],
  bio: string | null
): { text: string | null; isAnalyzing: boolean } {
  if (shortSnippet) return { text: shortSnippet, isAnalyzing: false };
  if (!analysisReady && bio) {
    return { text: bio, isAnalyzing: true };
  }
  if (commonInterests.length > 0)
    return {
      text: `Wspólne: ${commonInterests.slice(0, 3).join(', ')}`,
      isAnalyzing: false,
    };
  return { text: bio || null, isAnalyzing: false };
}

function getMatchColor(percent: number): string {
  if (percent >= 70) return colors.status.success.text;
  if (percent >= 40) return colors.status.warning.text;
  return colors.muted;
}

const statusConfig: Record<
  Exclude<UserRowStatus, 'none'>,
  { label: string; color: string }
> = {
  waved: { label: 'ZACZEPIONO', color: colors.muted },
  incoming: { label: 'CHCE CIĘ POZNAĆ', color: colors.status.warning.text },
  friend: { label: 'ZNAJOMY', color: colors.status.success.text },
};

export function UserRow({
  displayName,
  avatarUrl,
  distance,
  bio,
  rankScore,
  commonInterests,
  shortSnippet,
  analysisReady,
  status,
  onPress,
  timestamp,
}: UserRowProps) {
  const hasNearbyData = distance !== undefined;
  const { text: snippet, isAnalyzing } = hasNearbyData
    ? getSnippetText(shortSnippet ?? null, analysisReady ?? false, commonInterests ?? [], bio)
    : { text: bio || null, isAnalyzing: false };
  const matchPercent = Math.round((rankScore ?? 0) * 100);
  const isHighlight = !!shortSnippet || (commonInterests ?? []).length > 0;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Avatar uri={avatarUrl} name={displayName} size={44} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          {matchPercent > 0 && (
            <View style={styles.matchBadge}>
              <IconBulletRose size={10} color={getMatchColor(matchPercent)} />
              <Text style={[styles.matchText, { color: getMatchColor(matchPercent) }]}>
                {matchPercent}%
              </Text>
            </View>
          )}
          {distance !== undefined && (
            <Text style={styles.distance}>{formatDistance(distance)}</Text>
          )}
          {!distance && timestamp && (
            <Text style={styles.distance}>{formatRelativeTime(timestamp)}</Text>
          )}
          <View style={{ flex: 1 }} />
          {status !== 'none' && (
            <Text style={[styles.statusLabel, { color: statusConfig[status].color }]}>
              {statusConfig[status].label}
            </Text>
          )}
        </View>
        {snippet && (
          <Text
            style={[styles.snippet, isHighlight && styles.snippetHighlight]}
            numberOfLines={4}
          >
            {snippet}
          </Text>
        )}
        {isAnalyzing && (
          <Text style={styles.analyzingText}>Analizujemy dopasowanie...</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.ink,
    flexShrink: 1,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
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
  analyzingText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
