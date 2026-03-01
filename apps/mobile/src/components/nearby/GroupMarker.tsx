import { View, Text, StyleSheet } from 'react-native';
import { Avatar } from '../ui/Avatar';

interface GroupMarkerProps {
  name: string | null;
  avatarUrl: string | null;
  nearbyCount: number;
}

export function GroupMarker({ name, avatarUrl, nearbyCount }: GroupMarkerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.avatarWrap}>
        <Avatar uri={avatarUrl} name={name ?? 'G'} size={40} />
      </View>
      {nearbyCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{nearbyCount}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 46, height: 46, position: 'relative' },
  avatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#ffffff' },
});
