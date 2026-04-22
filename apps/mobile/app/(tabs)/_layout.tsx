import { subMinutes } from "date-fns";
import { Redirect, router, Tabs } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { IconChat, IconPerson, IconPin, IconPlus, IconSettings } from "@/components/ui/icons";
import { TabHeader } from "@/components/ui/TabHeader";
import { useBackgroundSync } from "@/hooks/useBackgroundSync";
import { useInAppNotifications } from "@/hooks/useInAppNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useRetryProfileAIOnFailure } from "@/hooks/useRetryProfileAIOnFailure";
import { trpc } from "@/lib/trpc";
import { sendWsMessage, useWebSocket, type WSMessage } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import { useConversationsStore } from "@/stores/conversationsStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { useProfilesStore } from "@/stores/profilesStore";
import { useWavesStore } from "@/stores/wavesStore";
import { colors, fonts, type as typ } from "@/theme";

export default function TabsLayout() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const hasCheckedProfile = useAuthStore((state) => state.hasCheckedProfile);
  const utils = trpc.useUtils();
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  // WebSocket: real-time updates for badges and stores
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  const wsHandler = useCallback((msg: WSMessage) => {
    if (msg.type === "newWave") {
      useWavesStore.getState().addReceived(msg.wave, msg.fromProfile);
      useProfilesStore.getState().merge(msg.wave.fromUserId, {
        displayName: msg.fromProfile.displayName,
        avatarUrl: msg.fromProfile.avatarUrl,
        _partial: true,
      });
    }
    if (msg.type === "waveResponded") {
      useWavesStore.getState().updateStatus(msg.waveId, msg.accepted);
    }
    if (msg.type === "newMessage") {
      // Skip own messages — HTTP response is the confirmation path
      if (msg.message.senderId === userIdRef.current) return;

      const convStore = useConversationsStore.getState();
      const msgStore = useMessagesStore.getState();

      // Resolve replyTo from cached parent message
      let replyTo = null;
      if (msg.message.replyToId) {
        const chat = msgStore.getChat(msg.conversationId);
        const parent = chat?.items.find((m) => m.id === msg.message.replyToId);
        if (parent) {
          replyTo = { id: parent.id, content: parent.content, senderName: parent.senderName ?? "Użytkownik" };
        }
      }

      // Update messages store
      msgStore.prepend(msg.conversationId, {
        ...msg.message,
        seq: msg.message.seq ?? null,
        conversationId: msg.conversationId,
        type: msg.message.type ?? "text",
        metadata: msg.message.metadata ?? null,
        replyToId: msg.message.replyToId ?? null,
        readAt: msg.message.readAt ?? null,
        deletedAt: msg.message.deletedAt ?? null,
        replyTo,
        reactions: [],
        senderName: msg.senderName ?? null,
        senderAvatarUrl: msg.senderAvatarUrl ?? null,
      });

      // Update conversation's last message
      convStore.updateLastMessage(msg.conversationId, {
        id: msg.message.id,
        content: msg.message.content,
        senderId: msg.message.senderId,
        createdAt: msg.message.createdAt,
        type: msg.message.type ?? "text",
        senderName: msg.senderName ?? null,
      });

      // Increment unread if not viewing this conversation
      if (convStore.activeConversationId !== msg.conversationId) {
        convStore.incrementUnread(msg.conversationId);
      }
    }
    if (msg.type === "reaction") {
      useMessagesStore
        .getState()
        .updateReaction(msg.conversationId, msg.messageId, msg.emoji, msg.userId, msg.action, userIdRef.current ?? "");
    }
    if (msg.type === "waveResponded" && msg.accepted && msg.conversationId) {
      sendWsMessage({ type: "subscribe", conversationId: msg.conversationId });
      // Build conversation entry from WS payload — no HTTP refetch needed
      const responderId = msg.responderId ?? "";
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
        type: "dm",
        participant: msg.responderProfile
          ? {
              userId: responderId,
              displayName: msg.responderProfile.displayName,
              avatarUrl: msg.responderProfile.avatarUrl,
              isSuspended: false,
            }
          : null,
        groupName: null,
        groupAvatarUrl: null,
        memberCount: null,
        lastMessage: null,
        unreadCount: 0,
        mutedUntil: null,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (msg.type === "reconnected") {
      // Reconcile after WS reconnection — may have missed events
      utilsRef.current.waves.getReceived.refetch();
      utilsRef.current.waves.getSent.refetch();
      utilsRef.current.messages.getConversations.refetch();
      utilsRef.current.profiles.me.refetch();

      // Batch gap fill for cached chats
      const reconnectMsgStore = useMessagesStore.getState();
      const cursors: Record<string, number> = {};
      for (const [convId, cache] of reconnectMsgStore.chats) {
        if (cache.newestSeq != null) {
          cursors[convId] = cache.newestSeq;
        }
      }
      if (Object.keys(cursors).length > 0) {
        reconnectMsgStore.syncGaps(cursors);
      }
    }
    if (msg.type === "profileReady") {
      // AI pipeline completed — refresh profile with embedding/interests
      utilsRef.current.profiles.me.refetch();
    }
    if (msg.type === "groupMember") {
      const convStore = useConversationsStore.getState();
      if (msg.action === "joined") {
        convStore.updateMemberCount(msg.conversationId, 1);
      } else if (msg.action === "left" || msg.action === "removed") {
        if (msg.userId === userIdRef.current) {
          convStore.remove(msg.conversationId);
        } else {
          convStore.updateMemberCount(msg.conversationId, -1);
        }
      }
    }
    if (msg.type === "groupUpdated") {
      useConversationsStore.getState().updateGroupInfo(msg.conversationId, msg.updates);
    }
    if (msg.type === "topicEvent") {
      utilsRef.current.groups.getGroupInfo.invalidate({ conversationId: msg.conversationId });
    }
    if (msg.type === "conversationDeleted") {
      const convStore = useConversationsStore.getState();
      const wasActive = convStore.activeConversationId === msg.conversationId;
      convStore.remove(msg.conversationId);
      if (wasActive) {
        router.back();
      }
    }
    if (msg.type === "groupInvited") {
      // Subscribe to the new group conversation and refetch
      sendWsMessage({
        type: "subscribe",
        conversationId: msg.conversationId,
      });
      utilsRef.current.messages.getConversations.refetch();
    }
  }, []);
  useWebSocket(wsHandler);
  useInAppNotifications();
  usePushNotifications();
  useBackgroundSync();
  useRetryProfileAIOnFailure();

  // Startup health check — if AI pipeline never completed, re-enqueue. The
  // profile fetch + hasCheckedProfile gating lives in <AppGate> (root layout)
  // so the cold-launch splash stays as a single <SonarDot> instance without
  // animation restart; here we just read the hydrated profile from the store.
  const { mutate: retryProfileAI, isPending: isRetryingProfileAI } = trpc.profiles.retryProfileAI.useMutation();
  const bio = profile?.bio;
  const portrait = profile?.portrait;
  const updatedAt = profile?.updatedAt;
  useEffect(() => {
    if (!bio || portrait || !updatedAt) return;
    const isStale = new Date(updatedAt) < subMinutes(new Date(), 5);
    if (isStale && !isRetryingProfileAI) retryProfileAI();
  }, [bio, portrait, updatedAt, retryProfileAI, isRetryingProfileAI]);

  // Waves hydration query — store is the source of truth, useBackgroundSync handles periodic reconciliation
  const { data: receivedWaves } = trpc.waves.getReceived.useQuery(undefined, { enabled: !!user && !!profile });
  const { data: sentWavesData } = trpc.waves.getSent.useQuery(undefined, { enabled: !!user && !!profile });

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
            senderStatusSnapshot: w.wave.senderStatusSnapshot ?? null,
            createdAt: w.wave.createdAt.toString(),
          },
          fromProfile: {
            userId: w.fromProfile.userId,
            displayName: w.fromProfile.displayName,
            avatarUrl: w.fromProfile.avatarUrl,
            bio: w.fromProfile.bio,
          },
        })),
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
            senderStatusSnapshot: w.wave.senderStatusSnapshot ?? null,
            createdAt: w.wave.createdAt.toString(),
          },
          toProfile: {
            userId: w.toProfile.userId,
            displayName: w.toProfile.displayName,
            avatarUrl: w.toProfile.avatarUrl,
            bio: w.toProfile.bio,
          },
        })),
      );
    }
  }, [sentWavesData]);

  // Unread messages badge — hydration query, store is the source of truth
  const { data: chatConversations } = trpc.messages.getConversations.useQuery(undefined, {
    enabled: !!user && !!profile,
  });

  // Hydrate conversations store when tRPC data arrives
  useEffect(() => {
    if (chatConversations) {
      useConversationsStore.getState().set(
        chatConversations.map((c) => ({
          id: c.conversation.id,
          type: (c.conversation.type as "dm" | "group") ?? "dm",
          participant: c.participant
            ? {
                userId: c.participant.userId,
                displayName: c.participant.displayName,
                avatarUrl: c.participant.avatarUrl,
                isSuspended: c.participant.isSuspended ?? false,
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
                type: c.lastMessage.type ?? "text",
                senderName: c.lastMessageSenderName ?? null,
              }
            : null,
          unreadCount: c.unreadCount,
          mutedUntil: c.mutedUntil ? c.mutedUntil.toString() : null,
          metadata: (c.conversation.metadata as Record<string, unknown> | null) ?? null,
          createdAt: c.conversation.createdAt.toString(),
          updatedAt: c.conversation.updatedAt.toString(),
        })),
      );
    }
  }, [chatConversations]);

  // Read badges from stores (single source of truth).
  // Chats tab badge = unread messages + pending pings the user hasn't tapped yet.
  // The pings half mirrors `unviewedPingCount` shown on the sonar pill inside the chats screen.
  const totalUnread = useConversationsStore((s) => s.conversations.reduce((sum, c) => sum + c.unreadCount, 0));
  const unviewedPings = useWavesStore((s) =>
    s.received.reduce((n, w) => (w.wave.status === "pending" && !s.viewedWaveIds.has(w.wave.id) ? n + 1 : n), 0),
  );
  const chatsTabBadge = totalUnread + unviewedPings;

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
        tabBarLabelStyle: typ.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "W okolicy",
          tabBarIcon: ({ color }) => <IconPin size={20} color={color} />,
          tabBarAccessibilityLabel: "tab-nearby",
          header: () => <TabHeader title="W okolicy" />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Czaty",
          tabBarIcon: ({ color }) => <IconChat size={20} color={color} />,
          tabBarAccessibilityLabel: "tab-chats",
          tabBarBadge: chatsTabBadge > 0 ? chatsTabBadge : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            fontFamily: fonts.sansSemiBold,
            fontSize: 10,
            minWidth: 18,
            height: 18,
            lineHeight: 18,
          },
          header: () => (
            <TabHeader
              title="Czaty"
              rightAction={{
                Icon: IconPlus,
                onPress: () => router.push("/create-group"),
                testID: "create-group-header-btn",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color }) => <IconPerson size={20} color={color} />,
          tabBarAccessibilityLabel: "tab-profile",
          header: () => (
            <TabHeader
              title="Profil"
              rightAction={{
                Icon: IconSettings,
                onPress: () => router.push("/settings"),
              }}
            />
          ),
        }}
      />
    </Tabs>
  );
}
