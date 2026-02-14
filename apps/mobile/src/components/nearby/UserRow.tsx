import {
  View,
  Text,
  Animated,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useRef, useEffect } from 'react';
import { colors, fonts, spacing } from '../../theme';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { IconWave, IconCheck, IconBulletRose } from '../ui/icons';

interface UserRowProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  distance: number;
  bio: string | null;
  rankScore: number;
  commonInterests: string[];
  shortSnippet: string | null;
  analysisReady: boolean;
  hasWaved: boolean;
  isWaving: boolean;
  onWave: () => void;
  onPress: () => void;
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

function getSnippetText(
  shortSnippet: string | null,
  analysisReady: boolean,
  commonInterests: string[],
  bio: string | null
): { text: string | null; isAnalyzing: boolean } {
  if (shortSnippet) return { text: shortSnippet, isAnalyzing: false };
  if (!analysisReady && bio) {
    const truncated = bio.length > 80 ? bio.slice(0, 77) + '...' : bio;
    return { text: truncated, isAnalyzing: true };
  }
  if (commonInterests.length > 0)
    return {
      text: `Łączy was: ${commonInterests.slice(0, 3).join(', ')}`,
      isAnalyzing: false,
    };
  return { text: bio || null, isAnalyzing: false };
}

function getMatchColor(percent: number): string {
  if (percent >= 70) return colors.status.success.text;
  if (percent >= 40) return colors.status.warning.text;
  return colors.muted;
}

export function UserRow({
  displayName,
  avatarUrl,
  distance,
  bio,
  rankScore,
  commonInterests,
  shortSnippet,
  analysisReady,
  hasWaved,
  isWaving,
  onWave,
  onPress,
}: UserRowProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const prevHasWaved = useRef(hasWaved);

  useEffect(() => {
    if (hasWaved && !prevHasWaved.current) {
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.4,
          useNativeDriver: true,
          speed: 50,
          bounciness: 12,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 30,
          bounciness: 8,
        }),
      ]).start();
    }
    prevHasWaved.current = hasWaved;
  }, [hasWaved]);

  const { text: snippet, isAnalyzing } = getSnippetText(
    shortSnippet,
    analysisReady,
    commonInterests,
    bio
  );
  const matchPercent = Math.round(rankScore * 100);
  const isHighlight = !!shortSnippet || commonInterests.length > 0;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Avatar uri={avatarUrl} name={displayName} size={48} />
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
          <Text style={styles.distance}>{formatDistance(distance)}</Text>
        </View>
        {snippet && (
          <Text
            style={[styles.snippet, isHighlight && styles.snippetHighlight]}
            numberOfLines={2}
          >
            {snippet}
          </Text>
        )}
        {isAnalyzing && (
          <Text style={styles.analyzingText}>Analizujemy dopasowanie...</Text>
        )}
      </View>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Button
          variant="wave"
          onPress={onWave}
          disabled={hasWaved || isWaving}
        >
          {isWaving ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : hasWaved ? (
            <IconCheck size={16} color={colors.ink} />
          ) : (
            <IconWave size={16} color={colors.ink} />
          )}
        </Button>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.compact,
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
