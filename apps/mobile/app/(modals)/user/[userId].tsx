import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { trpc } from '../../../src/lib/trpc';
import { sendWsMessage, useWebSocket } from '../../../src/lib/ws';
import { useProfilesStore } from '../../../src/stores/profilesStore';
import { useWavesStore } from '../../../src/stores/wavesStore';
import { useConversationsStore } from '../../../src/stores/conversationsStore';
import { colors, type as typ, spacing, fonts } from '../../../src/theme';
import { Avatar } from '../../../src/components/ui/Avatar';
import { IconWave, IconCheck, IconChat } from '../../../src/components/ui/icons';
import { formatDistance } from '../../../src/lib/format';

function SkeletonLines({ count }: { count: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const widths = ['100%', '90%', '75%', '85%'];
  return (
    <View style={{ gap: spacing.tight }}>
      {Array.from({ length: count }, (_, i) => (
        <Animated.View
          key={i}
          style={{
            height: 14,
            width: widths[i % widths.length] as `${number}%`,
            backgroundColor: colors.rule,
            borderRadius: 4,
            opacity,
          }}
        />
      ))}
    </View>
  );
}

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{
    userId: string;
    distance: string;
    rankScore: string;
    matchScore: string;
    commonInterests: string;
    displayName: string;
    avatarUrl: string;
  }>();

  const userId = params.userId;
  const distance = Number(params.distance) || 0;
  const rankScore = Number(params.rankScore) || 0;
  const matchScore = Number(params.matchScore) || 0;
  const commonInterests: string[] = params.commonInterests
    ? JSON.parse(params.commonInterests)
    : [];
  const avatarUrl = params.avatarUrl || null;

  const [pendingWaveId, setPendingWaveId] = useState<string | null>(null);
  const busyRef = useRef(false);

  // Read cached profile from store (populated by nearby list / waves)
  const cached = useProfilesStore((s) => s.profiles.get(userId));

  // Skip getById if we already have full profile data in store
  const { data: profile, isLoading } = trpc.profiles.getById.useQuery(
    { userId },
    { enabled: !!userId && cached?._partial !== false }
  );

  // When full profile arrives, merge into store
  useEffect(() => {
    if (profile) {
      useProfilesStore.getState().merge(userId, {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        bio: profile.bio ?? undefined,
        lookingFor: profile.lookingFor ?? undefined,
        _partial: false,
      });
    }
  }, [profile, userId]);

  const { data: analysis, isFetched: analysisFetched } = trpc.profiles.getConnectionAnalysis.useQuery(
    { userId },
    { enabled: !!userId }
  );

  const utils = trpc.useUtils();

  // WS: invalidate analysis when backend signals it's ready
  const wsHandler = useCallback((msg: any) => {
    if (msg.type === 'analysisReady' && msg.aboutUserId === userId) {
      utils.profiles.getConnectionAnalysis.invalidate({ userId });
    }
  }, [userId]);
  useWebSocket(wsHandler);

  // Self-healing: if analysis confirmed missing after 10s, poke backend
  const ensureAnalysisMutation = trpc.profiles.ensureAnalysis.useMutation();
  useEffect(() => {
    if (!analysisFetched || analysis) return;
    const timer = setTimeout(() => {
      ensureAnalysisMutation.mutate({ userId });
    }, 10_000);
    return () => clearTimeout(timer);
  }, [analysisFetched, analysis, userId]);

  // Read wave/conversation state from stores
  const sentWaves = useWavesStore((s) => s.sent);
  const receivedWaves = useWavesStore((s) => s.received);
  const conversationId = useConversationsStore((s) => {
    const conv = s.conversations.find((c) => c.participant?.userId === userId);
    return conv?.id ?? null;
  });

  const sendWaveMutation = trpc.waves.send.useMutation();
  const cancelWaveMutation = trpc.waves.cancel.useMutation();
  const respondMutation = trpc.waves.respond.useMutation();

  const [optimisticAction, setOptimisticAction] = useState<'accepted' | 'declined' | null>(null);

  const incomingWave = useMemo(() => {
    return receivedWaves.find(w => w.wave.fromUserId === userId && w.wave.status === 'pending');
  }, [receivedWaves, userId]);

  // Sync pendingWaveId from store when no mutation is in-flight
  useEffect(() => {
    if (busyRef.current) return;
    const pending = sentWaves.find(
      (w) => w.wave.toUserId === userId && w.wave.status === 'pending'
    );
    setPendingWaveId(pending?.wave.id ?? null);
  }, [sentWaves, userId]);

  const handleWave = async () => {
    if (busyRef.current || pendingWaveId || conversationId) return;
    busyRef.current = true;
    setPendingWaveId('optimistic');
    // Optimistic store update
    useWavesStore.getState().addSent(
      { id: 'optimistic', fromUserId: '', toUserId: userId, status: 'pending', createdAt: new Date().toISOString() },
      cached ? { displayName: cached.displayName, avatarUrl: cached.avatarUrl } : undefined,
    );
    try {
      const wave = await sendWaveMutation.mutateAsync({ toUserId: userId });
      // Replace optimistic with real
      useWavesStore.getState().removeSent('optimistic');
      useWavesStore.getState().addSent(
        { id: wave.id, fromUserId: wave.fromUserId, toUserId: wave.toUserId, status: wave.status, createdAt: wave.createdAt.toString() },
        cached ? { displayName: cached.displayName, avatarUrl: cached.avatarUrl } : undefined,
      );
      setPendingWaveId(wave.id);
      await utils.waves.getSent.invalidate();
    } catch (error: any) {
      useWavesStore.getState().removeSent('optimistic');
      const errorMsg = error.message || error.toString();
      if (errorMsg.includes('already waved')) {
        // Already waved — keep pending state, let next sync pick up the real ID
      } else {
        setPendingWaveId(null);
        Alert.alert('Błąd', `Nie udało się wysłać zaczepienia: ${errorMsg}`);
      }
    } finally {
      busyRef.current = false;
    }
  };

  const handleCancelWave = async () => {
    if (busyRef.current || !pendingWaveId || pendingWaveId === 'optimistic') return;
    busyRef.current = true;
    const prevId = pendingWaveId;
    setPendingWaveId(null);
    useWavesStore.getState().removeSent(prevId);
    try {
      await cancelWaveMutation.mutateAsync({ waveId: prevId });
      await utils.waves.getSent.invalidate();
    } catch {
      // Re-add on failure (will be reconciled on next sync)
      setPendingWaveId(prevId);
      await utils.waves.getSent.invalidate();
    } finally {
      busyRef.current = false;
    }
  };

  const handleOpenChat = () => {
    if (conversationId) {
      router.push(`/(modals)/chat/${conversationId}`);
    }
  };

  const handleAccept = async () => {
    if (busyRef.current || !incomingWave) return;
    busyRef.current = true;
    setOptimisticAction('accepted');
    useWavesStore.getState().updateStatus(incomingWave.wave.id, true);
    try {
      const result = await respondMutation.mutateAsync({ waveId: incomingWave.wave.id, accept: true });
      if (result.conversationId) {
        sendWsMessage({ type: 'subscribe', conversationId: result.conversationId });
        // Add new conversation to store
        useConversationsStore.getState().addNew({
          id: result.conversationId,
          type: 'dm',
          participant: {
            userId,
            displayName: cached?.displayName || params.displayName,
            avatarUrl: cached?.avatarUrl ?? avatarUrl,
          },
          groupName: null,
          groupAvatarUrl: null,
          memberCount: null,
          lastMessage: null,
          unreadCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      await Promise.all([
        utils.waves.getReceived.invalidate(),
        utils.waves.getSent.invalidate(),
        utils.messages.getConversations.invalidate(),
      ]);
    } catch {
      setOptimisticAction(null);
      // Restore to pending, not declined
      useWavesStore.getState().updateStatus(incomingWave.wave.id, false, 'pending');
    } finally {
      busyRef.current = false;
    }
  };

  const handleDecline = () => {
    if (busyRef.current || !incomingWave) return;
    Alert.alert(
      'Odrzuć zaczepienie',
      'Czy na pewno chcesz odrzucić to zaczepienie?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Odrzuć',
          style: 'destructive',
          onPress: async () => {
            busyRef.current = true;
            setOptimisticAction('declined');
            useWavesStore.getState().updateStatus(incomingWave.wave.id, false);
            try {
              await respondMutation.mutateAsync({ waveId: incomingWave.wave.id, accept: false });
              await utils.waves.getReceived.invalidate();
            } catch {
              setOptimisticAction(null);
            } finally {
              busyRef.current = false;
            }
          },
        },
      ]
    );
  };

  // Resolve display values: cached store > route params > query
  const displayName = cached?.displayName || params.displayName;
  const resolvedAvatarUrl = cached?.avatarUrl ?? avatarUrl;
  const resolvedBio = cached?.bio ?? profile?.bio;
  const resolvedLookingFor = cached?.lookingFor ?? profile?.lookingFor;
  const resolvedDistance = cached?.distance ?? distance;
  const resolvedMatchScore = cached?.matchScore ?? matchScore;
  const matchPercent = analysis
    ? Math.round(analysis.aiMatchScore)
    : resolvedMatchScore;

  if (!isLoading && !profile && !cached) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Nie znaleziono profilu</Text>
      </View>
    );
  }

  // Action state: conversation/accepted > waved pending > incoming wave > idle
  const actionState = conversationId || optimisticAction === 'accepted'
    ? 'chat'
    : pendingWaveId
      ? 'pending'
      : optimisticAction === 'declined'
        ? 'idle'
        : incomingWave
          ? 'incoming'
          : 'idle';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Header — always visible from cached/list params */}
      <View style={styles.header}>
        <Avatar uri={profile?.avatarUrl ?? resolvedAvatarUrl} name={displayName} size={100} />
        <Text style={styles.displayName}>{displayName}</Text>
        <View style={styles.meta}>
          {matchPercent > 0 && (
            <Text style={styles.matchBadge}>{matchPercent}% dopasowania</Text>
          )}
          <Text style={styles.distance}>{formatDistance(resolvedDistance)}</Text>
        </View>

        {/* Inline action */}
        <View style={styles.actionRow}>
          {actionState === 'idle' && (
            <Pressable style={styles.actionPill} onPress={handleWave}>
              <IconWave size={13} color={colors.bg} />
              <Text style={styles.actionPillText}>Zaczep</Text>
            </Pressable>
          )}
          {actionState === 'pending' && (
            <Pressable style={styles.pendingPill} onPress={handleCancelWave}>
              <IconCheck size={12} color={colors.muted} />
              <Text style={styles.pendingPillText}>Zaczepiono</Text>
            </Pressable>
          )}
          {actionState === 'incoming' && (
            <View style={styles.incomingActions}>
              <Pressable style={styles.declinePill} onPress={handleDecline}>
                <Text style={styles.declinePillText}>Odrzuć</Text>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={handleAccept}>
                <Text style={styles.actionPillText}>Akceptuj</Text>
              </Pressable>
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
          <Text style={styles.snippetLabel}>WSPÓLNE</Text>
          <Text style={styles.snippetText}>{analysis.longDescription}</Text>
        </View>
      ) : commonInterests.length > 0 ? (
        <View style={styles.snippetBlock}>
          <Text style={styles.snippetLabel}>WSPÓLNE</Text>
          <View style={styles.pillRow}>
            {commonInterests.map((interest) => (
              <View key={interest} style={styles.pill}>
                <Text style={styles.pillText}>{interest}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : !analysis ? (
        <View style={styles.snippetBlock}>
          <Text style={styles.snippetLabel}>WSPÓLNE</Text>
          <SkeletonLines count={3} />
        </View>
      ) : null}

      {/* Bio */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>O mnie</Text>
        {!cached && isLoading ? (
          <SkeletonLines count={3} />
        ) : (
          <Text style={styles.sectionContent}>
            {resolvedBio || 'Brak opisu'}
          </Text>
        )}
      </View>

      {/* Looking for */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kogo szukam</Text>
        {!cached && isLoading ? (
          <SkeletonLines count={2} />
        ) : (
          <Text style={styles.sectionContent}>
            {resolvedLookingFor || 'Brak opisu'}
          </Text>
        )}
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
  incomingActions: {
    flexDirection: 'row',
    gap: spacing.gutter,
  },
  declinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tick,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.column,
    borderRadius: 20,
  },
  declinePillText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
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
