import { useEffect, useCallback, useRef } from 'react';
import { Redirect, Tabs, router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { trpc } from '../../src/lib/trpc';
import { useWebSocket, sendWsMessage } from '../../src/lib/ws';
import { colors, type as typ, fonts, spacing } from '../../src/theme';
import { IconPin, IconWave, IconChat, IconPerson, IconSettings, IconPlus } from '../../src/components/ui/icons';
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
        useWavesStore.getState().addReceived(msg.wave, msg.fromProfile);
        useProfilesStore.getState().merge(msg.wave.fromUserId, {
          displayName: msg.fromProfile.displayName,
          avatarUrl: msg.fromProfile.avatarUrl,
          _partial: true,
        });
      }
      if (msg.type === 'waveResponded') {
        useWavesStore.getState().updateStatus(msg.waveId, msg.accepted);
      }
      if (msg.type === 'newMessage') {
        const convStore = useConversationsStore.getState();
        const msgStore = useMessagesStore.getState();

        // Resolve replyTo from existing store data (optimistic message may have it)
        let replyTo = null;
        if (msg.message.replyToId) {
          const chat = msgStore.get(msg.conversationId);
          const match = chat?.items.find(
            (m) => m.replyToId === msg.message.replyToId && m.replyTo,
          );
          replyTo = match?.replyTo ?? null;
        }

        // Update messages store
        msgStore.prepend(msg.conversationId, {
          ...msg.message,
          replyTo,
          reactions: [],
          senderName: msg.senderName ?? null,
          senderAvatarUrl: msg.senderAvatarUrl ?? null,
        });

        // Update conversation's last message (include senderName for groups)
        convStore.updateLastMessage(msg.conversationId, {
          id: msg.message.id,
          content: msg.message.content,
          senderId: msg.message.senderId,
          createdAt: msg.message.createdAt,
          type: msg.message.type ?? 'text',
          senderName: msg.senderName ?? null,
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
        // Build conversation entry from WS payload — no HTTP refetch needed
        const responderId = msg.responderId ?? '';
        if (msg.responderProfile) {
          useProfilesStore.getState().merge(responderId, {
            displayName: msg.responderProfile.displayName,
            avatarUrl: msg.responderProfile.avatarUrl,
            _partial: true,
          });
        }
        const now = new Date().toISOString();
        useConversationsStore.getState().addNew({
          id: msg.conversationId,
          type: 'dm',
          participant: msg.responderProfile
            ? {
                userId: responderId,
                displayName: msg.responderProfile.displayName,
                avatarUrl: msg.responderProfile.avatarUrl,
              }
            : null,
          groupName: null,
          groupAvatarUrl: null,
          memberCount: null,
          lastMessage: null,
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (msg.type === 'reconnected') {
        // Reconcile after WS reconnection — may have missed events
        utilsRef.current.waves.getReceived.refetch();
        utilsRef.current.waves.getSent.refetch();
        utilsRef.current.messages.getConversations.refetch();
      }
      if (msg.type === 'profileReady') {
        // AI pipeline completed — refresh profile with embedding/interests
        utilsRef.current.profiles.me.refetch();
      }
      if (msg.type === 'groupMember') {
        const convStore = useConversationsStore.getState();
        if (msg.action === 'joined') {
          convStore.updateMemberCount(msg.conversationId, 1);
        } else if (msg.action === 'left' || msg.action === 'removed') {
          convStore.updateMemberCount(msg.conversationId, -1);
        }
      }
      if (msg.type === 'groupUpdated') {
        useConversationsStore
          .getState()
          .updateGroupInfo(msg.conversationId, msg.updates);
      }
      if (msg.type === 'groupInvited') {
        // Subscribe to the new group conversation and refetch
        sendWsMessage({
          type: 'subscribe',
          conversationId: msg.conversationId,
        });
        utilsRef.current.messages.getConversations.refetch();
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

  // Waves hydration query — store is the source of truth, useBackgroundSync handles periodic reconciliation
  const { data: receivedWaves } = trpc.waves.getReceived.useQuery(
    undefined,
    { enabled: !!user && !!profile }
  );
  const { data: sentWavesData } = trpc.waves.getSent.useQuery(
    undefined,
    { enabled: !!user && !!profile }
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
    { enabled: !!user && !!profile }
  );

  // Hydrate conversations store when tRPC data arrives
  useEffect(() => {
    if (chatConversations) {
      useConversationsStore.getState().set(
        chatConversations.map((c) => ({
          id: c.conversation.id,
          type: (c.conversation.type as 'dm' | 'group') ?? 'dm',
          participant: c.participant
            ? {
                userId: c.participant.userId,
                displayName: c.participant.displayName,
                avatarUrl: c.participant.avatarUrl,
              }
            : null,
          groupName: c.conversation.name ?? null,
          groupAvatarUrl: c.conversation.avatarUrl ?? null,
          memberCount: c.memberCount ?? null,
          lastMessage: c.lastMessage
            ? {
                id: c.lastMessage.id,
                content: c.lastMessage.content,
                senderId: c.lastMessage.senderId,
                createdAt: c.lastMessage.createdAt.toString(),
                type: c.lastMessage.type ?? 'text',
                senderName: c.lastMessageSenderName ?? null,
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
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(modals)/create-group')}
              style={{ marginRight: spacing.section }}
            >
              <IconPlus size={20} color={colors.muted} />
            </Pressable>
          ),
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
