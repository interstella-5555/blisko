import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Share,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';
import { sendWsMessage } from '../../../src/lib/ws';
import { useAuthStore } from '../../../src/stores/authStore';
import { useConversationsStore } from '../../../src/stores/conversationsStore';
import { colors, type as typ, spacing, fonts } from '../../../src/theme';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Button } from '../../../src/components/ui/Button';
import Svg, { Path } from 'react-native-svg';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Wlasciciel',
  admin: 'Admin',
  member: '',
};

const ROLE_ORDER: Record<string, number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

const MAX_VISIBLE_MEMBERS = 5;

export default function GroupInfoScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [topicName, setTopicName] = useState('');
  const [topicEmoji, setTopicEmoji] = useState('💬');

  const utils = trpc.useUtils();

  const { data: groupInfo, isLoading } = trpc.groups.getGroupInfo.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
  );

  const isMember = groupInfo?.isMember ?? false;

  const { data: members } = trpc.groups.getMembers.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId && isMember },
  );

  const leaveGroup = trpc.groups.leave.useMutation({
    onSuccess: () => {
      router.dismissAll();
      router.replace('/(tabs)/chats');
    },
    onError: (error) => {
      Alert.alert('Blad', error.message);
    },
  });

  const joinGroup = trpc.groups.joinDiscoverable.useMutation({
    onSuccess: (data) => {
      sendWsMessage({ type: 'subscribe', conversationId: data.id });
      useConversationsStore.getState().addNew({
        id: data.id,
        type: 'group',
        participant: null,
        groupName: data.name,
        groupAvatarUrl: data.avatarUrl,
        memberCount: (groupInfo?.memberCount ?? 0) + 1,
        lastMessage: null,
        unreadCount: 0,
        createdAt: String(data.createdAt),
        updatedAt: String(data.updatedAt),
      });
      router.replace(`/(modals)/chat/${data.id}`);
    },
    onError: (error) => {
      if (error.message === 'Group is full') {
        Alert.alert('Blad', 'Ta grupa jest pełna');
      } else {
        Alert.alert('Blad', 'Nie udalo sie dolaczyc do grupy');
      }
    },
  });

  const createTopic = trpc.topics.create.useMutation({
    onSuccess: () => {
      setShowTopicForm(false);
      setTopicName('');
      setTopicEmoji('💬');
      utils.groups.getGroupInfo.invalidate({ conversationId: conversationId! });
    },
    onError: () => {
      Alert.alert('Blad', 'Nie udalo sie utworzyc watku');
    },
  });

  const handleLeave = useCallback(() => {
    Alert.alert('Opusc grupe', 'Czy na pewno chcesz opuscic te grupe?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Opusc',
        style: 'destructive',
        onPress: () => leaveGroup.mutate({ conversationId: conversationId! }),
      },
    ]);
  }, [conversationId, leaveGroup]);

  const handleShareInvite = useCallback(async () => {
    if (!groupInfo?.inviteCode) return;
    try {
      await Share.share({
        message: `Dołącz do grupy „${groupInfo.name}" w Blisko!\nhttps://blisko.app/join/${groupInfo.inviteCode}`,
      });
    } catch {
      // User cancelled
    }
  }, [groupInfo]);

  const handleOpenTopic = useCallback(
    (topicId: string) => {
      router.push(`/(modals)/chat/${conversationId}?topicId=${topicId}`);
    },
    [conversationId],
  );

  const handleJoin = useCallback(() => {
    joinGroup.mutate({ conversationId: conversationId! });
  }, [conversationId, joinGroup]);

  const handleCreateTopic = useCallback(() => {
    if (!topicName.trim()) return;
    createTopic.mutate({
      conversationId: conversationId!,
      name: topicName.trim(),
      emoji: topicEmoji || undefined,
    });
  }, [conversationId, topicName, topicEmoji, createTopic]);

  const myRole = members?.find((m) => m.userId === userId)?.role;
  const isAdmin = myRole === 'admin' || myRole === 'owner';

  const sortedMembers = members
    ? [...members].sort(
        (a, b) => (ROLE_ORDER[a.role] ?? 2) - (ROLE_ORDER[b.role] ?? 2),
      )
    : [];

  const visibleMembers = showAllMembers
    ? sortedMembers
    : sortedMembers.slice(0, MAX_VISIBLE_MEMBERS);

  const hasMoreMembers = sortedMembers.length > MAX_VISIBLE_MEMBERS;

  if (isLoading || !groupInfo) {
    return (
      <>
        <Stack.Screen options={{ title: 'Grupa' }} />
        <View style={styles.container} />
      </>
    );
  }

  // Non-member view: discovery preview with join button
  if (!isMember) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.container}>
          <View style={styles.previewContent}>
            <Avatar
              uri={groupInfo.avatarUrl}
              name={groupInfo.name ?? 'G'}
              size={80}
            />
            <Text style={styles.groupName}>{groupInfo.name}</Text>
            {groupInfo.description ? (
              <Text style={styles.groupDescription}>{groupInfo.description}</Text>
            ) : null}
            <Text style={styles.memberCountLabel}>
              {groupInfo.memberCount} czlonkow
            </Text>
            <View style={styles.joinButtonContainer}>
              <Button
                title="Dołącz"
                variant="fullWidth"
                onPress={handleJoin}
                loading={joinGroup.isPending}
              />
            </View>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <Avatar
            uri={groupInfo.avatarUrl}
            name={groupInfo.name ?? 'G'}
            size={80}
          />
          <Text style={styles.groupName}>{groupInfo.name}</Text>
          {groupInfo.description ? (
            <Text style={styles.groupDescription}>{groupInfo.description}</Text>
          ) : null}
          <Text style={styles.memberCountLabel}>
            {groupInfo.memberCount} czlonkow
          </Text>
        </View>

        {/* Topics */}
        {(groupInfo.topics.length > 0 || isAdmin) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Watki</Text>
            {groupInfo.topics.map((topic) => (
              <Pressable
                key={topic.id}
                style={styles.topicRow}
                onPress={() => handleOpenTopic(topic.id)}
              >
                <Text style={styles.topicEmoji}>
                  {topic.emoji || '💬'}
                </Text>
                <View style={styles.topicInfo}>
                  <Text style={styles.topicName} numberOfLines={1}>
                    {topic.name}
                  </Text>
                  {(topic.messageCount ?? 0) > 0 && (
                    <Text style={styles.topicMeta}>
                      {topic.messageCount} wiadomosci
                    </Text>
                  )}
                </View>
                <ChevronRight />
              </Pressable>
            ))}

            {/* Topic creation — admin only */}
            {isAdmin && !showTopicForm && (
              <Pressable
                style={styles.addTopicRow}
                onPress={() => setShowTopicForm(true)}
              >
                <Text style={styles.addTopicText}>+ Nowy wątek</Text>
              </Pressable>
            )}
            {isAdmin && showTopicForm && (
              <View style={styles.topicForm}>
                <TextInput
                  style={styles.topicEmojiInput}
                  value={topicEmoji}
                  onChangeText={(t) => setTopicEmoji(t.slice(-2))}
                  maxLength={2}
                  spellCheck={false}
                  autoCorrect={false}
                  textAlign="center"
                />
                <TextInput
                  style={styles.topicNameInput}
                  value={topicName}
                  onChangeText={setTopicName}
                  placeholder="Nazwa wątku"
                  placeholderTextColor={colors.muted}
                  spellCheck={false}
                  autoCorrect={false}
                  maxLength={50}
                  autoFocus
                />
                <Pressable
                  style={[
                    styles.topicFormBtn,
                    !topicName.trim() && styles.topicFormBtnDisabled,
                  ]}
                  onPress={handleCreateTopic}
                  disabled={!topicName.trim() || createTopic.isPending}
                >
                  <Text style={styles.topicFormBtnText}>UTWÓRZ</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Czlonkowie ({sortedMembers.length})
          </Text>
          {visibleMembers.map((member) => (
            <Pressable
              key={member.userId}
              style={styles.memberRow}
              onPress={() => {
                if (member.userId !== userId) {
                  router.push(`/(modals)/user/${member.userId}`);
                }
              }}
            >
              <Avatar
                uri={member.avatarUrl}
                name={member.displayName}
                size={36}
              />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.displayName}
                  {member.userId === userId ? ' (Ty)' : ''}
                </Text>
              </View>
              {ROLE_LABELS[member.role] ? (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>
                    {ROLE_LABELS[member.role]}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ))}
          {hasMoreMembers && !showAllMembers && (
            <Pressable
              style={styles.showAllBtn}
              onPress={() => setShowAllMembers(true)}
            >
              <Text style={styles.showAllText}>
                Pokaz wszystkich ({sortedMembers.length})
              </Text>
            </Pressable>
          )}
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Pressable style={styles.actionRow} onPress={handleShareInvite}>
            <Text style={styles.actionText}>Link zaproszenia</Text>
            <Text style={styles.actionHint}>Udostepnij</Text>
          </Pressable>

          <Pressable
            style={[styles.actionRow, styles.dangerAction]}
            onPress={handleLeave}
          >
            <Text style={styles.dangerText}>Opusc grupe</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

function ChevronRight() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5l7 7-7 7"
        stroke={colors.muted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: 60,
  },
  previewContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.section,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.section,
    paddingTop: spacing.section,
    paddingBottom: spacing.block,
  },
  groupName: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginTop: spacing.gutter,
    textAlign: 'center',
  },
  groupDescription: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
    marginTop: spacing.tight,
    textAlign: 'center',
    paddingHorizontal: spacing.section,
  },
  memberCountLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    marginTop: spacing.tight,
  },
  joinButtonContainer: {
    width: '100%',
    marginTop: spacing.block,
    paddingHorizontal: spacing.section,
  },
  section: {
    paddingHorizontal: spacing.section,
    marginBottom: spacing.section,
  },
  sectionTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: spacing.gutter,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.compact,
    gap: spacing.gutter,
  },
  topicEmoji: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  topicInfo: {
    flex: 1,
  },
  topicName: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
  },
  topicMeta: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
  addTopicRow: {
    paddingVertical: spacing.compact,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
    marginTop: spacing.tight,
  },
  addTopicText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.accent,
  },
  topicForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    marginTop: spacing.tight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
    paddingTop: spacing.compact,
  },
  topicEmojiInput: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 8,
    fontSize: 20,
    textAlign: 'center',
    backgroundColor: colors.bg,
  },
  topicNameInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    paddingVertical: spacing.tight,
  },
  topicFormBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.tick,
    borderRadius: 8,
  },
  topicFormBtnDisabled: {
    opacity: 0.3,
  },
  topicFormBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.compact,
    gap: spacing.gutter,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
  },
  roleBadge: {
    backgroundColor: colors.rule,
    paddingHorizontal: spacing.tight,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  showAllBtn: {
    paddingVertical: spacing.compact,
  },
  showAllText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.accent,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  actionText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
  },
  actionHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  dangerAction: {
    borderBottomWidth: 0,
  },
  dangerText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.accent,
  },
});
