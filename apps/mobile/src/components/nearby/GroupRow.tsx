import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts, spacing } from '../../theme';
import { Avatar } from '../ui/Avatar';
import { formatDistance } from '../../lib/format';

interface GroupRowProps {
  conversationId: string;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  distance: number;
  memberCount: number;
}

export function GroupRow({
  conversationId,
  name,
  avatarUrl,
  description,
  distance,
  memberCount,
}: GroupRowProps) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push(`/(modals)/group/${conversationId}`)}
    >
      <Avatar uri={avatarUrl} name={name ?? 'G'} size={44} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.distance}>{formatDistance(distance)}</Text>
        </View>
        <Text style={styles.meta}>
          GRUPA · {memberCount} {memberCount === 1 ? 'członek' : 'członków'}
        </Text>
        {description ? (
          <Text style={styles.snippet} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.gutter,
    paddingHorizontal: spacing.column,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  info: {
    flex: 1,
    marginLeft: spacing.gutter,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.ink,
    flexShrink: 1,
  },
  distance: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    marginLeft: 'auto',
  },
  meta: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
    marginTop: 2,
  },
  snippet: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
});
