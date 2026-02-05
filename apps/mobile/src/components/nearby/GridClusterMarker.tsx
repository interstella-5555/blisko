import { View, Text, Image, StyleSheet } from 'react-native';

export interface ClusterUser {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface GridClusterMarkerProps {
  users: ClusterUser[];
}

export function GridClusterMarker({ users }: GridClusterMarkerProps) {
  const count = users.length;

  // Single user - show avatar
  if (count === 1) {
    const user = users[0];
    return (
      <View style={styles.singleContainer}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {user.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // 2-3 users - show stacked avatars
  if (count <= 3) {
    return (
      <View style={styles.stackContainer}>
        {users.slice(0, 3).map((user, index) => (
          <View
            key={user.id}
            style={[
              styles.stackItem,
              { marginLeft: index * 14, zIndex: 3 - index },
            ]}
          >
            {user.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.smallAvatar} />
            ) : (
              <View style={styles.smallAvatarPlaceholder}>
                <Text style={styles.smallAvatarText}>
                  {user.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  }

  // 4+ users - show count badge
  return (
    <View style={styles.badgeContainer}>
      <Text style={styles.badgeText}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  singleContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  stackContainer: {
    flexDirection: 'row',
    height: 36,
    paddingRight: 8,
  },
  stackItem: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  smallAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  smallAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallAvatarText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  badgeContainer: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  badgeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
