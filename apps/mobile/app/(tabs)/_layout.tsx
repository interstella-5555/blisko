import { useEffect, useCallback, useRef } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { View, ActivityIndicator, Text } from 'react-native';
import { trpc } from '../../src/lib/trpc';
import { useWebSocket, sendWsMessage } from '../../src/lib/ws';
import { colors, type as typ, fonts } from '../../src/theme';
import { IconPin, IconWave, IconChat, IconPerson } from '../../src/components/ui/icons';

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

  // WebSocket: real-time updates for badges
  const wsHandler = useCallback(
    (msg: any) => {
      if (msg.type === 'newWave' || msg.type === 'waveResponded') {
        utilsRef.current.waves.getReceived.refetch();
      }
      if (msg.type === 'newMessage' || (msg.type === 'waveResponded' && msg.accepted)) {
        utilsRef.current.messages.getConversations.refetch();
      }
      if (msg.type === 'waveResponded' && msg.accepted && msg.conversationId) {
        sendWsMessage({ type: 'subscribe', conversationId: msg.conversationId });
      }
      if (msg.type === 'profileReady') {
        // AI pipeline completed — refresh profile with socialProfile/embedding/interests
        utilsRef.current.profiles.me.refetch();
      }
    },
    []
  );
  useWebSocket(wsHandler);

  const { data: profileData, isLoading: isLoadingProfile, isError, refetch } =
    trpc.profiles.me.useQuery(undefined, {
      enabled: !!user && !hasCheckedProfile,
      retry: 2, // Retry twice on failure
    });

  // Pending waves badge (must be before early returns to respect hook rules)
  const { data: receivedWaves } = trpc.waves.getReceived.useQuery(
    undefined,
    { enabled: !!user && !!profile, refetchInterval: 15_000 }
  );
  const pendingWaves = receivedWaves?.length || 0;

  // Unread messages badge
  const { data: chatConversations } = trpc.messages.getConversations.useQuery(
    undefined,
    { enabled: !!user && !!profile, refetchInterval: 15_000 }
  );
  const totalUnread = chatConversations?.reduce((sum, c) => sum + c.unreadCount, 0) || 0;

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
        }}
      />
    </Tabs>
  );
}
