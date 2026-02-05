import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  Image,
  ActivityIndicator,
  Pressable,
} from 'react-native';

export interface SheetUser {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  lookingFor: string;
  avatarUrl: string | null;
  distance: number;
}

interface UserListSheetProps {
  visible: boolean;
  users: SheetUser[];
  onClose: () => void;
  onWave: (userId: string, displayName: string) => void;
  wavedUsers: Set<string>;
  wavingAt: string | null;
}

export function UserListSheet({
  visible,
  users,
  onClose,
  onWave,
  wavedUsers,
  wavingAt,
}: UserListSheetProps) {
  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `~${meters} m`;
    }
    return `~${(meters / 1000).toFixed(1)} km`;
  };

  const renderItem = ({ item }: { item: SheetUser }) => {
    const hasWaved = wavedUsers.has(item.userId);
    const isWaving = wavingAt === item.userId;

    return (
      <View style={styles.userRow}>
        <View style={styles.userAvatar}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {item.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.displayName}</Text>
          <Text style={styles.userDistance}>{formatDistance(item.distance)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.waveButton, hasWaved && styles.waveButtonWaved]}
          onPress={() => onWave(item.userId, item.displayName)}
          disabled={hasWaved || isWaving}
        >
          {isWaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.waveButtonText}>
              {hasWaved ? '\u2713' : '\u{1F44B}'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            {users.length} {users.length === 1 ? 'osoba' : 'osoby'} w okolicy
          </Text>
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={styles.list}
            showsVerticalScrollIndicator={false}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 34,
    maxHeight: '60%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#DEDEDE',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  list: {
    flexGrow: 0,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  userDistance: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  waveButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveButtonWaved: {
    backgroundColor: '#4CAF50',
  },
  waveButtonText: {
    fontSize: 20,
    color: '#fff',
  },
});
