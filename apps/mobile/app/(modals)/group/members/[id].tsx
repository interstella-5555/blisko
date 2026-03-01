import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { trpc } from '../../../../src/lib/trpc';
import { useAuthStore } from '../../../../src/stores/authStore';
import { colors, spacing, fonts } from '../../../../src/theme';
import { Avatar } from '../../../../src/components/ui/Avatar';

const PAGE_SIZE = 50;

const ROLE_LABELS: Record<string, string> = {
  owner: 'Właściciel',
  admin: 'Admin',
};

type Member = {
  userId: string;
  role: string;
  joinedAt: string;
  displayName: string;
  avatarUrl: string | null;
};

export default function GroupMembersScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  const [cursor, setCursor] = useState(0);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const prevCursorRef = useRef(-1);

  const { data: groupInfo } = trpc.groups.getGroupInfo.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
  );

  const { data, isLoading, isFetching } = trpc.groups.getMembers.useQuery(
    { conversationId: conversationId!, limit: PAGE_SIZE, cursor },
    { enabled: !!conversationId },
  );

  useEffect(() => {
    if (!data || cursor === prevCursorRef.current) return;
    prevCursorRef.current = cursor;

    if (cursor === 0) {
      setAllMembers(data as Member[]);
    } else {
      setAllMembers((prev) => [...prev, ...(data as Member[])]);
    }
    if (data.length < PAGE_SIZE) {
      setHasMore(false);
    }
  }, [data, cursor]);

  const handleEndReached = useCallback(() => {
    if (!isFetching && hasMore) {
      setCursor(allMembers.length);
    }
  }, [isFetching, hasMore, allMembers.length]);

  const memberCount = groupInfo?.memberCount ?? allMembers.length;

  const renderMember = useCallback(
    ({ item }: { item: Member }) => (
      <Pressable
        style={styles.memberRow}
        onPress={() => {
          if (item.userId !== userId) {
            router.push(`/(modals)/user/${item.userId}`);
          }
        }}
      >
        <Avatar uri={item.avatarUrl} name={item.displayName} size={40} />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName} numberOfLines={1}>
            {item.displayName}
            {item.userId === userId ? ' (Ty)' : ''}
          </Text>
        </View>
        {ROLE_LABELS[item.role] ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {ROLE_LABELS[item.role]}
            </Text>
          </View>
        ) : null}
      </Pressable>
    ),
    [userId],
  );

  if (isLoading && allMembers.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Członkowie' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Członkowie (${memberCount})` }} />
      <FlatList
        data={allMembers}
        keyExtractor={(item) => item.userId}
        renderItem={renderMember}
        style={styles.container}
        contentContainerStyle={styles.content}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetching && allMembers.length > 0 ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : null
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.section,
    paddingTop: spacing.gutter,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
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
  footer: {
    paddingVertical: spacing.section,
    alignItems: 'center',
  },
});
