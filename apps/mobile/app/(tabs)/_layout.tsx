import { useEffect, useCallback, useRef } from 'react';
import { Redirect, Tabs, router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { trpc } from '../../src/lib/trpc';
import { useWebSocket, sendWsMessage } from '../../src/lib/ws';
import { colors, type as typ, fonts, spacing } from '../../src/theme';
import { IconPin, IconWave, IconChat, IconPerson, IconSettings } from '../../src/components/ui/icons';
import { useInAppNotifications } from '../../src/hooks/useInAppNotifications';
import { useConversationsStore } from '../../src/stores/conversationsStore';
import { useMessagesStore } from '../../src/stores/messagesStore';
import { useProfilesStore } from '../../src/stores/profilesStore';
import { useWavesStore } from '../../src/stores/wavesStore';
import { useBackgroundSync } from '../../src/hooks/useBackgroundSync';

export default function TabsLayout() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isLoading = useAuthStore((state) => state.isLoading);
  const hasCheckedProfile = useAuthStore((state) => state.hasCheckedProfile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const setHasCheckedProfile = useAuthStore(
    (state) => state.setHasCheckedProfile
  );
  const utils = trpc.useUtils();
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  // WebSocket: real-time updates for badges and stores
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  const wsHandler = useCallback(
    (msg: any) => {
      if (msg.type === 'newWave') {
        const wavesStoreState = useWavesStore.getState();
        wavesStoreState.addReceived(msg.wave, msg.fromProfile);
        useProfilesStore.getState().merge(msg.wave.fromUserId, {
          displayName: msg.fromProfile.displayName,
          avatarUrl: msg.fromProfile.avatarUrl,
          _partial: true,
        });
        // Still refetch for full profile data
        utilsRef.current.waves.getReceived.refetch();
      }
      if (msg.type === 'waveResponded') {
        useWavesStore.getState().updateStatus(msg.waveId, msg.accepted);
        utilsRef.current.waves.getReceived.refetch();
        utilsRef.current.waves.getSent.refetch();
      }
      if (msg.type === 'newMessage') {
        const convStore = useConversationsStore.getState();
        const msgStore = useMessagesStore.getState();

        // Update messages store
        msgStore.prepend(msg.conversationId, {
          ...msg.message,
          replyTo: null,
          reactions: [],
        });

        // Update conversation's last message
        convStore.updateLastMessage(msg.conversationId, {
          id: msg.message.id,
          content: msg.message.content,
          senderId: msg.message.senderId,
          createdAt: msg.message.createdAt,
          type: msg.message.type ?? 'text',
        });

        // Increment unread if not viewing this conversation
        if (
          msg.message.senderId !== userIdRef.current &&
          convStore.activeConversationId !== msg.conversationId
        ) {
          convStore.incrementUnread(msg.conversationId);
        }
      }
      if (msg.type === 'reaction') {
        useMessagesStore.getState().updateReaction(
          msg.conversationId,
          msg.messageId,
          msg.emoji,
          msg.userId,
          msg.action,
          userIdRef.current ?? '',
        );
      }
      if (msg.type === 'waveResponded' && msg.accepted && msg.conversationId) {
        sendWsMessage({ type: 'subscribe', conversationId: msg.conversationId });
        // Refetch conversations to get full participant data for new conversation
        utilsRef.current.messages.getConversations.refetch();
        if (msg.responderProfile) {
          useProfilesStore.getState().merge(msg.responderId ?? '', {
            displayName: msg.responderProfile.displayName,
            avatarUrl: msg.responderProfile.avatarUrl,
            _partial: true,
          });
        }
      }
      if (msg.type === 'profileReady') {
        // AI pipeline completed — refresh profile with socialProfile/embedding/interests
        utilsRef.current.profiles.me.refetch();
      }
    },
    []
  );
  useWebSocket(wsHandler);
  useInAppNotifications();
  useBackgroundSync();

  const { data: profileData, isLoading: isLoadingProfile, isError, refetch } =
    trpc.profiles.me.useQuery(undefined, {
      enabled: !!user && !hasCheckedProfile,
      retry: 2, // Retry twice on failure
    });

  // Waves hydration query — store is the source of truth
  const { data: receivedWaves } = trpc.waves.getReceived.useQuery(
    undefined,
    { enabled: !!user && !!profile, refetchInterval: 60_000 }
  );
  const { data: sentWavesData } = trpc.waves.getSent.useQuery(
    undefined,
    { enabled: !!user && !!profile, refetchInterval: 60_000 }
  );

  // Hydrate waves store when tRPC data arrives
  useEffect(() => {
    if (receivedWaves) {
      useWavesStore.getState().setReceived(
        receivedWaves.map((w) => ({
          wave: {
            id: w.wave.id,
            fromUserId: w.wave.fromUserId,
            toUserId: w.wave.toUserId,
            status: w.wave.status,
            createdAt: w.wave.createdAt.toString(),
          },
          fromProfile: {
            userId: w.fromProfile.userId,
            displayName: w.fromProfile.displayName,
            avatarUrl: w.fromProfile.avatarUrl,
            bio: w.fromProfile.bio,
          },
        }))
      );
    }
  }, [receivedWaves]);

  useEffect(() => {
    if (sentWavesData) {
      useWavesStore.getState().setSent(
        sentWavesData.map((w) => ({
          wave: {
            id: w.wave.id,
            fromUserId: w.wave.fromUserId,
            toUserId: w.wave.toUserId,
            status: w.wave.status,
            createdAt: w.wave.createdAt.toString(),
          },
          toProfile: {
            userId: w.toProfile.userId,
            displayName: w.toProfile.displayName,
            avatarUrl: w.toProfile.avatarUrl,
            bio: w.toProfile.bio,
          },
        }))
      );
    }
  }, [sentWavesData]);

  // Read wave badge from store
  const pendingWaves = useWavesStore(
    (s) => s.received.filter((w) => w.wave.status === 'pending').length
  );

  // Unread messages badge — hydration query, store is the source of truth
  const { data: chatConversations } = trpc.messages.getConversations.useQuery(
    undefined,
    { enabled: !!user && !!profile, refetchInterval: 60_000 }
  );

  // Hydrate conversations store when tRPC data arrives
  useEffect(() => {
    if (chatConversations) {
      useConversationsStore.getState().set(
        chatConversations.map((c) => ({
          id: c.conversation.id,
          participant: c.participant
            ? {
                userId: c.participant.userId,
                displayName: c.participant.displayName,
                avatarUrl: c.participant.avatarUrl,
              }
            : null,
          lastMessage: c.lastMessage
            ? {
                id: c.lastMessage.id,
                content: c.lastMessage.content,
                senderId: c.lastMessage.senderId,
                createdAt: c.lastMessage.createdAt.toString(),
                type: c.lastMessage.type ?? 'text',
              }
            : null,
          unreadCount: c.unreadCount,
          createdAt: c.conversation.createdAt.toString(),
          updatedAt: c.conversation.updatedAt.toString(),
        }))
      );
    }
  }, [chatConversations]);

  // Read badges from stores (single source of truth)
  const totalUnread = useConversationsStore(
    (s) => s.conversations.reduce((sum, c) => sum + c.unreadCount, 0)
  );

  useEffect(() => {
    // Only set profile from query if we haven't checked yet
    // This prevents overwriting a profile that was just created in onboarding
    if (profileData !== undefined && !hasCheckedProfile) {
      setProfile(profileData);
      setHasCheckedProfile(true);
    }
  }, [profileData, hasCheckedProfile, setProfile, setHasCheckedProfile]);

  // If API error, show retry button instead of redirecting to onboarding
  if (isError && !hasCheckedProfile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.bg }}>
        <Text style={{ ...typ.body, color: colors.muted, marginBottom: 16, textAlign: 'center' }}>
          Nie udało się połączyć z serwerem
        </Text>
        <Text
          style={{ ...typ.body, color: colors.accent }}
          onPress={() => refetch()}
        >
          Spróbuj ponownie
        </Text>
      </View>
    );
  }

  if (isLoading || (user && !hasCheckedProfile && isLoadingProfile)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  // If not logged in, redirect to auth
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // If logged in but no profile, redirect to onboarding
  // Note: Check !profile directly - if profile exists in store (e.g., just created), don't redirect
  if (!profile && hasCheckedProfile) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.rule,
          height: 75,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.sansMedium,
          fontSize: 8,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        },
        headerStyle: {
          backgroundColor: colors.bg,
          borderBottomWidth: 1,
          borderBottomColor: colors.rule,
        },
        headerTitleStyle: {
          ...typ.heading,
          fontSize: 18,
        },
        headerShadowVisible: false,
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'W okolicy',
          tabBarIcon: ({ color }) => <IconPin size={20} color={color} />,
          tabBarAccessibilityLabel: 'tab-nearby',
        }}
      />
      <Tabs.Screen
        name="waves"
        options={{
          title: 'Zaczepki',
          tabBarIcon: ({ color }) => <IconWave size={20} color={color} />,
          tabBarAccessibilityLabel: 'tab-waves',
          tabBarBadge: pendingWaves > 0 ? pendingWaves : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            fontFamily: fonts.sansSemiBold,
            fontSize: 10,
            minWidth: 18,
            height: 18,
            lineHeight: 18,
          },
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Czaty',
          tabBarIcon: ({ color }) => <IconChat size={20} color={color} />,
          tabBarAccessibilityLabel: 'tab-chats',
          tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            fontFamily: fonts.sansSemiBold,
            fontSize: 10,
            minWidth: 18,
            height: 18,
            lineHeight: 18,
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <IconPerson size={20} color={color} />,
          tabBarAccessibilityLabel: 'tab-profile',
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(modals)/edit-profile')}
              style={{ marginRight: spacing.section }}
            >
              <IconSettings size={20} color={colors.muted} />
            </Pressable>
          ),
        }}
      />
    </Tabs>
  );
}
