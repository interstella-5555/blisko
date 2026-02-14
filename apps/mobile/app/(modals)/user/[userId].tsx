import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { trpc } from '../../../src/lib/trpc';
import { colors, type as typ, spacing, fonts } from '../../../src/theme';
import { Avatar } from '../../../src/components/ui/Avatar';
import { IconWave, IconCheck, IconChat } from '../../../src/components/ui/icons';

const formatDistance = (meters: number): string => {
  if (meters < 50) return 'tuż obok';
  const rounded = Math.round(meters / 100) * 100;
  if (rounded < 1000) return `~${rounded} m`;
  return `~${(rounded / 1000).toFixed(1)} km`;
};

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{
    userId: string;
    distance: string;
    rankScore: string;
    commonInterests: string;
    displayName: string;
  }>();

  const userId = params.userId;
  const distance = Number(params.distance) || 0;
  const rankScore = Number(params.rankScore) || 0;
  const commonInterests: string[] = params.commonInterests
    ? JSON.parse(params.commonInterests)
    : [];

  const [wavingAt, setWavingAt] = useState(false);
  const [hasWaved, setHasWaved] = useState(false);

  const { data: profile, isLoading } = trpc.profiles.getById.useQuery(
    { userId },
    { enabled: !!userId }
  );

  const { data: analysis } = trpc.profiles.getConnectionAnalysis.useQuery(
    { userId },
    { enabled: !!userId }
  );

  const matchPercent = analysis
    ? Math.round(analysis.aiMatchScore)
    : Math.round(rankScore * 100);

  const { data: sentWaves } = trpc.waves.getSent.useQuery();
  const { data: allConversations } = trpc.messages.getConversations.useQuery();
  const utils = trpc.useUtils();
  const sendWaveMutation = trpc.waves.send.useMutation();

  // Find conversation with this user (if any)
  const conversationId = useMemo(() => {
    if (!allConversations) return null;
    const conv = allConversations.find(
      (c) => c.participant?.userId === userId
    );
    return conv?.conversation.id ?? null;
  }, [allConversations, userId]);

  useEffect(() => {
    if (sentWaves) {
      const waved = sentWaves.some(
        (w) => w.wave.toUserId === userId && w.wave.status === 'pending'
      );
      setHasWaved(waved);
    }
  }, [sentWaves, userId]);

  const handleWave = async () => {
    if (hasWaved || conversationId) return;
    setWavingAt(true);
    try {
      await sendWaveMutation.mutateAsync({ toUserId: userId });
      setHasWaved(true);
      utils.waves.getSent.invalidate();
    } catch (error: any) {
      const errorMsg = error.message || error.toString();
      if (errorMsg.includes('already waved')) {
        setHasWaved(true);
      } else {
        Alert.alert('Błąd', `Nie udało się wysłać zaczepienia: ${errorMsg}`);
      }
    } finally {
      setWavingAt(false);
    }
  };

  const handleOpenChat = () => {
    if (conversationId) {
      router.push(`/(modals)/chat/${conversationId}`);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Nie znaleziono profilu</Text>
      </View>
    );
  }

  // Action state: conversation exists > waved pending > can wave
  const actionState = conversationId
    ? 'chat'
    : hasWaved
      ? 'pending'
      : 'idle';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Header */}
      <View style={styles.header}>
        <Avatar uri={profile.avatarUrl} name={profile.displayName} size={100} />
        <Text style={styles.displayName}>{profile.displayName}</Text>
        <View style={styles.meta}>
          {matchPercent > 0 && (
            <Text style={styles.matchBadge}>{matchPercent}% dopasowania</Text>
          )}
          <Text style={styles.distance}>{formatDistance(distance)}</Text>
        </View>

        {/* Inline action */}
        <View style={styles.actionRow}>
          {actionState === 'idle' && (
            <Pressable
              style={styles.actionPill}
              onPress={handleWave}
              disabled={wavingAt}
            >
              {wavingAt ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <>
                  <IconWave size={13} color={colors.bg} />
                  <Text style={styles.actionPillText}>Zagadaj</Text>
                </>
              )}
            </Pressable>
          )}
          {actionState === 'pending' && (
            <View style={styles.pendingPill}>
              <IconCheck size={12} color={colors.muted} />
              <Text style={styles.pendingPillText}>Zagadano</Text>
            </View>
          )}
          {actionState === 'chat' && (
            <Pressable style={styles.chatPill} onPress={handleOpenChat}>
              <IconChat size={13} color={colors.bg} />
              <Text style={styles.chatPillText}>Napisz wiadomość</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* AI connection analysis */}
      {analysis?.longDescription ? (
        <View style={styles.snippetBlock}>
          <Text style={styles.snippetLabel}>ŁĄCZY WAS</Text>
          <Text style={styles.snippetText}>{analysis.longDescription}</Text>
        </View>
      ) : commonInterests.length > 0 ? (
        <View style={styles.snippetBlock}>
          <Text style={styles.snippetLabel}>ŁĄCZY WAS</Text>
          <View style={styles.pillRow}>
            {commonInterests.map((interest) => (
              <View key={interest} style={styles.pill}>
                <Text style={styles.pillText}>{interest}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Bio */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>O mnie</Text>
        <Text style={styles.sectionContent}>
          {profile.bio || 'Brak opisu'}
        </Text>
      </View>

      {/* Looking for */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kogo szukam</Text>
        <Text style={styles.sectionContent}>
          {profile.lookingFor || 'Brak opisu'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  emptyText: {
    ...typ.body,
    color: colors.muted,
  },
  scrollContent: {
    paddingBottom: spacing.block,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.block,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  displayName: {
    ...typ.heading,
    marginTop: spacing.column,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gutter,
    marginTop: spacing.tight,
  },
  matchBadge: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.accent,
  },
  distance: {
    ...typ.caption,
  },
  actionRow: {
    marginTop: spacing.column,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tick,
    backgroundColor: colors.accent,
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.column,
    borderRadius: 20,
  },
  actionPillText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.bg,
  },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tick,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.column,
    borderRadius: 20,
  },
  pendingPillText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  chatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tick,
    backgroundColor: colors.ink,
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.column,
    borderRadius: 20,
  },
  chatPillText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.bg,
  },
  snippetBlock: {
    padding: spacing.section,
    backgroundColor: colors.mapBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  snippetLabel: {
    ...typ.label,
    marginBottom: spacing.tight,
  },
  snippetText: {
    ...typ.body,
    fontFamily: fonts.sansMedium,
  },
  section: {
    padding: spacing.section,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  sectionTitle: {
    ...typ.label,
    marginBottom: spacing.tight,
  },
  sectionContent: {
    ...typ.body,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight,
  },
  pill: {
    paddingVertical: spacing.hairline,
    paddingHorizontal: spacing.gutter,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.bg,
  },
  pillText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.ink,
  },
});
