import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { useLocationStore } from '../../src/stores/locationStore';
import { trpc } from '../../src/lib/trpc';

interface NearbyUser {
  profile: {
    id: string;
    userId: string;
    displayName: string;
    bio: string;
    lookingFor: string;
    avatarUrl: string | null;
  };
  distance: number;
  similarityScore: number | null;
}

export default function NearbyScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [wavingAt, setWavingAt] = useState<string | null>(null);
  const [wavedUsers, setWavedUsers] = useState<Set<string>>(new Set());
  const { latitude, longitude, permissionStatus, setLocation, setPermissionStatus } =
    useLocationStore();

  const updateLocationMutation = trpc.profiles.updateLocation.useMutation();
  const sendWaveMutation = trpc.waves.send.useMutation();

  const {
    data: nearbyUsers,
    isLoading,
    refetch,
  } = trpc.profiles.getNearbyUsers.useQuery(
    {
      latitude: latitude!,
      longitude: longitude!,
      radiusMeters: 5000, // 5km
      limit: 50,
    },
    {
      enabled: !!latitude && !!longitude,
    }
  );

  // Fetch sent waves to know who we already waved at
  const { data: sentWaves } = trpc.waves.getSent.useQuery();

  useEffect(() => {
    if (sentWaves) {
      const waved = new Set(
        sentWaves
          .filter((w) => w.wave.status === 'pending')
          .map((w) => w.wave.toUserId)
      );
      setWavedUsers(waved);
    }
  }, [sentWaves]);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissionStatus(status === 'granted' ? 'granted' : 'denied');

    if (status === 'granted') {
      await updateLocation();
    }
  };

  const updateLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocation(location.coords.latitude, location.coords.longitude);

      // Update location on server
      await updateLocationMutation.mutateAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await updateLocation();
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleWave = async (userId: string, displayName: string) => {
    if (wavedUsers.has(userId)) {
      Alert.alert('Już zaczepiono', `Już wysłałeś zaczepienie do ${displayName}`);
      return;
    }

    setWavingAt(userId);
    try {
      await sendWaveMutation.mutateAsync({
        toUserId: userId,
      });
      setWavedUsers((prev) => new Set([...prev, userId]));
      Alert.alert('Wysłano! 👋', `Zaczepienie wysłane do ${displayName}`);
    } catch (error: any) {
      if (error.message?.includes('already waved')) {
        Alert.alert('Już zaczepiono', `Już wysłałeś zaczepienie do ${displayName}`);
        setWavedUsers((prev) => new Set([...prev, userId]));
      } else {
        Alert.alert('Błąd', 'Nie udało się wysłać zaczepienia');
      }
    } finally {
      setWavingAt(null);
    }
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const renderUserCard = ({ item }: { item: NearbyUser }) => {
    const hasWaved = wavedUsers.has(item.profile.userId);
    const isWaving = wavingAt === item.profile.userId;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            {item.profile.avatarUrl ? (
              <Image source={{ uri: item.profile.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {item.profile.displayName.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.name}>{item.profile.displayName}</Text>
            <Text style={styles.distance}>{formatDistance(item.distance)}</Text>
          </View>
          {item.similarityScore !== null && item.similarityScore > 0.5 && (
            <View style={styles.matchBadge}>
              <Text style={styles.matchText}>
                {Math.round(item.similarityScore * 100)}% match
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.bio} numberOfLines={2}>
          {item.profile.bio}
        </Text>

        <View style={styles.lookingForContainer}>
          <Text style={styles.lookingForLabel}>Szuka:</Text>
          <Text style={styles.lookingFor} numberOfLines={1}>
            {item.profile.lookingFor}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.waveButton,
            hasWaved && styles.waveButtonDisabled,
          ]}
          onPress={() => handleWave(item.profile.userId, item.profile.displayName)}
          disabled={hasWaved || isWaving}
        >
          {isWaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.waveButtonText}>
              {hasWaved ? '✓ Zaczepiono' : '👋 Zaczep'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (permissionStatus === 'denied') {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>📍</Text>
        <Text style={styles.emptyTitle}>Brak dostępu do lokalizacji</Text>
        <Text style={styles.emptyText}>
          Włącz lokalizację w ustawieniach, aby zobaczyć osoby w pobliżu
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={requestLocationPermission}>
          <Text style={styles.retryButtonText}>Spróbuj ponownie</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (permissionStatus === 'undetermined' || (!latitude && !longitude)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Pobieranie lokalizacji...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={nearbyUsers || []}
        keyExtractor={(item) => item.profile.id}
        renderItem={renderUserCard}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>Nikogo w pobliżu</Text>
              <Text style={styles.emptyText}>
                Nie znaleziono użytkowników w promieniu 5 km
              </Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  distance: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  matchBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  matchText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  bio: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 8,
  },
  lookingForContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  lookingForLabel: {
    fontSize: 13,
    color: '#666',
    marginRight: 4,
  },
  lookingFor: {
    flex: 1,
    fontSize: 13,
    color: '#007AFF',
  },
  waveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  waveButtonDisabled: {
    backgroundColor: '#4CAF50',
  },
  waveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
