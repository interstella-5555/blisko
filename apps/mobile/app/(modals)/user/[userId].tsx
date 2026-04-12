import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ProfileGateSheet } from "../../../src/components/ProfileGateSheet";
import { Avatar } from "../../../src/components/ui/Avatar";
import { IconChat, IconCheck, IconWave } from "../../../src/components/ui/icons";
import { useProfileGate } from "../../../src/hooks/useProfileGate";
import { formatDistance } from "../../../src/lib/format";
import { trpc } from "../../../src/lib/trpc";
import { sendWsMessage, useWebSocket, type WSMessage } from "../../../src/lib/ws";
import { useAuthStore } from "../../../src/stores/authStore";
import { useConversationsStore } from "../../../src/stores/conversationsStore";
import { useProfilesStore } from "../../../src/stores/profilesStore";
import { useWavesStore } from "../../../src/stores/wavesStore";
import { colors, fonts, spacing, type as typ } from "../../../src/theme";

function BlockAction({ userId, displayName }: { userId: string; displayName: string }) {
  const blockMutation = trpc.waves.block.useMutation();
  const utils = trpc.useUtils();

  const handleBlock = () => {
    Alert.alert("Zablokuj", `Czy na pewno chcesz zablokowac ${displayName}?`, [
      { text: "Anuluj", style: "cancel" },
      {
        text: "Zablokuj",
        style: "destructive",
        onPress: async () => {
          try {
            await blockMutation.mutateAsync({ userId });
            // Remove any pending waves involving this user
            const wavesStore = useWavesStore.getState();
            const pendingSent = wavesStore.sent.find((w) => w.wave.toUserId === userId && w.wave.status === "pending");
            if (pendingSent) wavesStore.removeSent(pendingSent.wave.id);
            const pendingReceived = wavesStore.received.find(
              (w) => w.wave.fromUserId === userId && w.wave.status === "pending",
            );
            if (pendingReceived) wavesStore.updateStatus(pendingReceived.wave.id, false);

            await Promise.all([utils.waves.getSent.invalidate(), utils.waves.getReceived.invalidate()]);
            router.back();
          } catch {
            Alert.alert("Blad", "Nie udalo sie zablokowac uzytkownika.");
          }
        },
      },
    ]);
  };

  return (
    <Pressable style={styles.blockAction} onPress={handleBlock} disabled={blockMutation.isPending}>
      <Text style={styles.blockActionText}>{blockMutation.isPending ? "Blokowanie..." : "Zablokuj uzytkownika"}</Text>
    </Pressable>
  );
}

function SkeletonLines({ count }: { count: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const widths = ["100%", "90%", "75%", "85%"];
  const items = Array.from({ length: count }, (_, i) => `skeleton-${i}`);
  return (
    <View style={{ gap: spacing.tight }}>
      {items.map((key, i) => (
        <Animated.View
          key={key}
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
  const currentUserId = useAuthStore((s) => s.user?.id);
  const distance = Number(params.distance) || 0;
  const _rankScore = Number(params.rankScore) || 0;
  const matchScore = Number(params.matchScore) || 0;
  const commonInterests: string[] = params.commonInterests ? JSON.parse(params.commonInterests) : [];
  const avatarUrl = params.avatarUrl || null;

  const gate = useProfileGate();
  const [pendingWaveId, setPendingWaveId] = useState<string | null>(null);
  const busyRef = useRef(false);

  // Read cached profile from store (populated by nearby list / waves)
  const cached = useProfilesStore((s) => s.profiles.get(userId));

  // Skip getById if we already have full profile data in store
  const { data: profile, isLoading } = trpc.profiles.getById.useQuery(
    { userId },
    { enabled: !!userId && cached?._partial !== false },
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

  // Opening the modal is the hot path that promotes T2 → T3 (via promotePairAnalysis
  // inside the procedure). Re-reads after WS analysisReady pick up the fresh snippet.
  const { data: analysis, isFetched: analysisFetched } = trpc.profiles.getDetailedAnalysis.useQuery(
    { userId },
    { enabled: !!userId },
  );

  const utils = trpc.useUtils();

  // Self-healing: if T3 still not ready after 10s, poke backend
  const { mutate: ensureAnalysis } = trpc.profiles.ensureAnalysis.useMutation();

  // WS: invalidate analysis when backend signals it's ready, retry on failure
  const wsHandler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "analysisReady" && msg.aboutUserId === userId) {
        utils.profiles.getDetailedAnalysis.invalidate({ userId });
      }
      if (msg.type === "analysisFailed" && msg.aboutUserId === userId) {
        ensureAnalysis({ userId });
      }
    },
    [userId, utils.profiles.getDetailedAnalysis.invalidate, ensureAnalysis],
  );
  useWebSocket(wsHandler);
  useEffect(() => {
    if (!analysisFetched || analysis?.status === "ready") return;
    const timer = setTimeout(() => {
      ensureAnalysis({ userId });
    }, 10_000);
    return () => clearTimeout(timer);
  }, [analysisFetched, analysis, userId, ensureAnalysis]);

  // Read wave/conversation state from stores
  const sentWaves = useWavesStore((s) => s.sent);
  const receivedWaves = useWavesStore((s) => s.received);
  const conversationId = useConversationsStore((s) => {
    const conv = s.conversations.find((c) => c.participant?.userId === userId);
    return conv?.id ?? null;
  });

  const sendWaveMutation = trpc.waves.send.useMutation();
  const respondMutation = trpc.waves.respond.useMutation();

  const [optimisticAction, setOptimisticAction] = useState<"accepted" | "declined" | null>(null);

  const incomingWave = useMemo(() => {
    return receivedWaves.find((w) => w.wave.fromUserId === userId && w.wave.status === "pending");
  }, [receivedWaves, userId]);

  // Sync pendingWaveId from store when no mutation is in-flight
  useEffect(() => {
    if (busyRef.current) return;
    const pending = sentWaves.find((w) => w.wave.toUserId === userId && w.wave.status === "pending");
    setPendingWaveId(pending?.wave.id ?? null);
  }, [sentWaves, userId]);

  const updateProfileMutation = trpc.profiles.update.useMutation();

  const handleWave = async () => {
    if (!gate.requireFullProfile()) return;
    if (busyRef.current || pendingWaveId || conversationId) return;

    // Ninja mode check — hidden users must switch to visible before pinging
    const myProfile = useAuthStore.getState().profile;
    if (myProfile?.visibilityMode === "ninja") {
      Alert.alert("Aby pingować musisz być widoczny", "Przejść w tryb Semi-Open?", [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Tak",
          onPress: async () => {
            try {
              const updated = await updateProfileMutation.mutateAsync({ visibilityMode: "semi_open" });
              if (updated) useAuthStore.getState().setProfile(updated);
              handleWave();
            } catch {
              Alert.alert("Błąd", "Nie udało się zmienić trybu widoczności.");
            }
          },
        },
      ]);
      return;
    }
    busyRef.current = true;
    setPendingWaveId("optimistic");
    // Optimistic store update
    useWavesStore
      .getState()
      .addSent(
        { id: "optimistic", fromUserId: "", toUserId: userId, status: "pending", createdAt: new Date().toISOString() },
        cached ? { displayName: cached.displayName, avatarUrl: cached.avatarUrl } : undefined,
      );
    try {
      const result = await sendWaveMutation.mutateAsync({ toUserId: userId });
      useWavesStore.getState().removeSent("optimistic");

      if (result.autoAccepted) {
        // The other user already had a pending wave to us. The server
        // implicitly accepted it on our behalf — we are now connected and
        // a conversation exists. Flip the existing received pending wave
        // to accepted in the local store (so the wave-status map sees us
        // as `connected`), then jump straight into the chat.
        useWavesStore.getState().updateStatus(result.wave.id, true);
        setPendingWaveId(null);
        await Promise.all([utils.waves.getReceived.invalidate(), utils.messages.getConversations.invalidate()]);
        router.push(`/chat/${result.conversationId}`);
        return;
      }

      // Normal flow — replace optimistic with the real sent wave
      useWavesStore.getState().addSent(
        {
          id: result.wave.id,
          fromUserId: result.wave.fromUserId,
          toUserId: result.wave.toUserId,
          status: result.wave.status,
          createdAt: result.wave.createdAt.toString(),
        },
        cached ? { displayName: cached.displayName, avatarUrl: cached.avatarUrl } : undefined,
      );
      setPendingWaveId(result.wave.id);
      await utils.waves.getSent.invalidate();
    } catch (error: unknown) {
      useWavesStore.getState().removeSent("optimistic");
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("already_waved")) {
        // Already waved — keep pending state, let next sync pick up the real ID
      } else if (errorMsg.includes("already_connected")) {
        setPendingWaveId(null);
        Alert.alert("Jesteście połączeni", "Macie już ze sobą chat — otwórz go z listy rozmów.");
      } else if (errorMsg.includes("daily_limit")) {
        setPendingWaveId(null);
        Alert.alert("Limit dzienny", "Wykorzystałeś dzienny limit pingów. Wróć jutro!");
      } else if (errorMsg.includes("per_person:")) {
        const hours = errorMsg.split("per_person:")[1];
        setPendingWaveId(null);
        Alert.alert("Jeszcze nie teraz", `Już pingowałeś tę osobę. Spróbuj ponownie za ${hours}h.`);
      } else if (errorMsg.includes("cooldown:")) {
        const hours = errorMsg.split("cooldown:")[1];
        setPendingWaveId(null);
        Alert.alert("Jeszcze nie teraz", `Możesz pingować tę osobę ponownie za ${hours}h.`);
      } else {
        setPendingWaveId(null);
        Alert.alert("Błąd", `Nie udało się wysłać pinga: ${errorMsg}`);
      }
    } finally {
      busyRef.current = false;
    }
  };

  const handleOpenChat = () => {
    if (conversationId) {
      router.push(`/chat/${conversationId}`);
    }
  };

  const handleAccept = async () => {
    if (!gate.requireFullProfile()) return;
    if (busyRef.current || !incomingWave) return;
    busyRef.current = true;
    setOptimisticAction("accepted");
    useWavesStore.getState().updateStatus(incomingWave.wave.id, true);
    try {
      const result = await respondMutation.mutateAsync({ waveId: incomingWave.wave.id, accept: true });
      if (result.conversationId) {
        sendWsMessage({ type: "subscribe", conversationId: result.conversationId });
        // Add new conversation to store
        useConversationsStore.getState().addNew({
          id: result.conversationId,
          type: "dm",
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
          mutedUntil: null,
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
      useWavesStore.getState().updateStatus(incomingWave.wave.id, false, "pending");
    } finally {
      busyRef.current = false;
    }
  };

  const handleDecline = () => {
    if (!gate.requireFullProfile()) return;
    if (busyRef.current || !incomingWave) return;
    Alert.alert("Nie teraz", "Czy na pewno chcesz pominąć ten ping?", [
      { text: "Anuluj", style: "cancel" },
      {
        text: "Pomiń",
        style: "destructive",
        onPress: async () => {
          busyRef.current = true;
          setOptimisticAction("declined");
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
    ]);
  };

  // Resolve display values: cached store > route params > query
  const displayName = cached?.displayName || params.displayName;
  const resolvedAvatarUrl = cached?.avatarUrl ?? avatarUrl;
  const resolvedBio = cached?.bio ?? profile?.bio;
  const resolvedLookingFor = cached?.lookingFor ?? profile?.lookingFor;
  const resolvedDistance = cached?.distance ?? distance;
  const resolvedMatchScore = cached?.matchScore ?? matchScore;
  const matchPercent = analysis?.matchScore != null ? Math.round(analysis.matchScore) : resolvedMatchScore;

  if (!isLoading && !profile && !cached) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Nie znaleziono profilu</Text>
      </View>
    );
  }

  const isConnected = !!conversationId || optimisticAction === "accepted";

  // Action state: conversation/accepted > waved pending > incoming wave > idle
  const actionState = isConnected
    ? "chat"
    : pendingWaveId
      ? "pending"
      : optimisticAction === "declined"
        ? "idle"
        : incomingWave
          ? "incoming"
          : "idle";

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Header — always visible from cached/list params */}
        <View style={styles.header}>
          <Avatar uri={profile?.avatarUrl ?? resolvedAvatarUrl} name={displayName} size={100} />
          <Text style={styles.displayName}>{displayName}</Text>
          <View style={styles.meta}>
            {matchPercent > 0 && <Text style={styles.matchBadge}>{matchPercent}% dopasowania</Text>}
            <Text style={styles.distance}>{formatDistance(resolvedDistance)}</Text>
          </View>

          {/* Inline action */}
          <View style={styles.actionRow}>
            {actionState === "idle" && (
              <Pressable style={styles.actionPill} onPress={handleWave}>
                <IconWave size={13} color={colors.bg} />
                <Text style={styles.actionPillText}>Ping</Text>
              </Pressable>
            )}
            {actionState === "pending" && (
              <View style={styles.pendingPill}>
                <IconCheck size={12} color={colors.muted} />
                <Text style={styles.pendingPillText}>Pingowano</Text>
              </View>
            )}
            {actionState === "incoming" && (
              <View style={styles.incomingActions}>
                <Pressable style={styles.declinePill} onPress={handleDecline}>
                  <Text style={styles.declinePillText}>Nie teraz</Text>
                </Pressable>
                <Pressable style={styles.actionPill} onPress={handleAccept}>
                  <Text style={styles.actionPillText}>Akceptuj</Text>
                </Pressable>
              </View>
            )}
            {actionState === "chat" && (
              <Pressable style={styles.chatPill} onPress={handleOpenChat}>
                <IconChat size={13} color={colors.bg} />
                <Text style={styles.chatPillText}>Napisz wiadomość</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Status "Na teraz" */}
        {profile?.currentStatus && (
          <View style={styles.otherStatus}>
            <Text style={styles.otherStatusLabel}>NA TERAZ</Text>
            <Text style={styles.otherStatusText} numberOfLines={1}>
              {profile.currentStatus}
            </Text>
          </View>
        )}

        {/* AI connection analysis */}
        {analysis?.status === "ready" && analysis.longDescription ? (
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
        ) : (
          <View style={styles.snippetBlock}>
            <Text style={styles.snippetLabel}>WSPÓLNE</Text>
            <SkeletonLines count={3} />
          </View>
        )}

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>O mnie</Text>
          {!cached && isLoading ? (
            <SkeletonLines count={3} />
          ) : (
            <Text style={styles.sectionContent}>{resolvedBio || "Brak opisu"}</Text>
          )}
        </View>

        {/* Looking for */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kogo szukam</Text>
          {!cached && isLoading ? (
            <SkeletonLines count={2} />
          ) : (
            <Text style={styles.sectionContent}>{resolvedLookingFor || "Brak opisu"}</Text>
          )}
        </View>

        {/* Superpower */}
        {profile?.superpower && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Co mogę dać</Text>
            <Text style={styles.sectionContent}>{profile.superpower}</Text>
            {profile.offerType && (
              <Text style={styles.offerTypeBadge}>
                {{ volunteer: "Wolontariat", exchange: "Wymiana", gig: "Zlecenie" }[profile.offerType]}
              </Text>
            )}
          </View>
        )}

        {/* Social links — visible only after wave acceptance */}
        {isConnected && profile?.socialLinks && Object.values(profile.socialLinks).some(Boolean) && (
          <View style={styles.socialLinksRow}>
            {profile.socialLinks.facebook && (
              <Pressable
                style={styles.socialPill}
                onPress={() => Linking.openURL(`https://facebook.com/${profile.socialLinks!.facebook}`)}
              >
                <Text style={styles.socialPillIcon}>👤</Text>
                <Text style={styles.socialPillLabel}>{profile.socialLinks.facebook}</Text>
              </Pressable>
            )}
            {profile.socialLinks.linkedin && (
              <Pressable
                style={styles.socialPill}
                onPress={() => {
                  const url = profile.socialLinks!.linkedin!.startsWith("http")
                    ? profile.socialLinks!.linkedin!
                    : `https://linkedin.com/in/${profile.socialLinks!.linkedin}`;
                  Linking.openURL(url);
                }}
              >
                <Text style={styles.socialPillIcon}>💼</Text>
                <Text style={styles.socialPillLabel}>{profile.socialLinks.linkedin}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Block action — hidden for own profile */}
        {currentUserId && currentUserId !== userId && <BlockAction userId={userId} displayName={displayName} />}
      </ScrollView>
      <ProfileGateSheet visible={gate.sheetVisible} onDismiss={() => gate.setSheetVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    alignItems: "center",
    paddingVertical: spacing.block,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  displayName: {
    ...typ.heading,
    marginTop: spacing.column,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
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
    textTransform: "uppercase",
    color: colors.bg,
  },
  incomingActions: {
    flexDirection: "row",
    gap: spacing.gutter,
  },
  declinePill: {
    flexDirection: "row",
    alignItems: "center",
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
    textTransform: "uppercase",
    color: colors.muted,
  },
  pendingPill: {
    flexDirection: "row",
    alignItems: "center",
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
    textTransform: "uppercase",
    color: colors.muted,
  },
  chatPill: {
    flexDirection: "row",
    alignItems: "center",
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
    textTransform: "uppercase",
    color: colors.bg,
  },
  otherStatus: {
    marginTop: 10,
    marginHorizontal: spacing.section,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "#FDF5EC",
    borderColor: "#E8C9A0",
  },
  otherStatusLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#D4851C",
    marginBottom: 4,
  },
  otherStatusText: {
    fontSize: 13,
    color: colors.ink,
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
  offerTypeBadge: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: "#D4851C",
    marginTop: spacing.tight,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  socialLinksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.tight,
    paddingVertical: spacing.column,
    paddingHorizontal: spacing.section,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  socialPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.tick,
    paddingVertical: spacing.tick,
    paddingHorizontal: spacing.gutter,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 20,
  },
  socialPillIcon: {
    fontSize: 12,
  },
  socialPillLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.ink,
  },
  blockAction: {
    alignItems: "center",
    paddingVertical: spacing.column,
    paddingHorizontal: spacing.section,
  },
  blockActionText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.accent,
  },
});
