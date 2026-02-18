import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Avatar } from '../ui/Avatar';
import { colors, fonts, spacing } from '../../theme';

interface ConversationRowProps {
  type?: 'dm' | 'group';
  displayName: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastMessageSenderName?: string | null;
  lastMessageTime: string | null;
  memberCount?: number;
  unreadCount: number;
  onPress: () => void;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'teraz';
  if (diffMins < 60) return `${diffMins} min`;
  if (diffHours < 24) return `${diffHours} godz.`;
  if (diffDays < 7) return `${diffDays} d.`;
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

export function ConversationRow({
  type = 'dm',
  displayName,
  avatarUrl,
  lastMessage,
  lastMessageSenderName,
  lastMessageTime,
  memberCount,
  unreadCount,
  onPress,
}: ConversationRowProps) {
  const isGroup = type === 'group';

  // For groups, build preview with sender name prefix
  let previewText: React.ReactNode;
  if (!lastMessage) {
    previewText = isGroup ? 'Brak wiadomości' : 'Rozpocznij rozmowę';
  } else if (isGroup && lastMessageSenderName) {
    previewText = (
      <Text numberOfLines={1}>
        <Text style={styles.senderPrefix}>{lastMessageSenderName}: </Text>
        {lastMessage}
      </Text>
    );
  } else {
    previewText = lastMessage;
  }

  return (
    <Pressable style={styles.row} onPress={onPress} testID="conversation-row">
      <Avatar uri={avatarUrl} name={displayName} size={48} />
      <View style={styles.content}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {lastMessageTime && (
            <Text style={styles.time}>{formatRelativeTime(lastMessageTime)}</Text>
          )}
        </View>
        <View style={styles.bottomLine}>
          <Text
            style={[styles.preview, unreadCount > 0 && styles.previewUnread]}
            numberOfLines={1}
          >
            {previewText}
          </Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.gutter,
    paddingHorizontal: spacing.section,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  content: {
    flex: 1,
    marginLeft: spacing.gutter,
  },
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
  },
  time: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.muted,
    marginLeft: spacing.tight,
  },
  bottomLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  preview: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    flex: 1,
  },
  previewUnread: {
    fontFamily: fonts.sansMedium,
    color: colors.ink,
  },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: spacing.tight,
  },
  badgeText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    color: '#FFFFFF',
  },
  senderPrefix: {
    fontFamily: fonts.sansMedium,
    color: colors.ink,
  },
});
