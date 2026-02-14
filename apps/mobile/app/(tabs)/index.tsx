import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  Pressable,
} from 'react-native';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { keepPreviousData } from '@tanstack/react-query';
import { useLocationStore } from '../../src/stores/locationStore';
import { trpc } from '../../src/lib/trpc';
import {
  NearbyMapView,
  type MapUser,
  type GridCluster,
  type NearbyMapRef,
} from '../../src/components/nearby';
import { UserRow } from '../../src/components/nearby/UserRow';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { IconPin } from '../../src/components/ui/icons';
import { Button } from '../../src/components/ui/Button';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAP_EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.4;

export default function NearbyScreen() {
  const [wavingAt, setWavingAt] = useState<string | null>(null);
  const [wavedUsers, setWavedUsers] = useState<Set<string>>(new Set());
  const [selectedCluster, setSelectedCluster] = useState<GridCluster | null>(null);
  const { latitude, longitude, permissionStatus, setLocation, setPermissionStatus } =
    useLocationStore();

  const [mapExpanded, setMapExpanded] = useState(false);
  const mapHeight = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<NearbyMapRef>(null);

  const utils = trpc.useUtils();
  const updateLocationMutation = trpc.profiles.updateLocation.useMutation();
  const sendWaveMutation = trpc.waves.send.useMutation();

  const {
    data: mapUsers,
    isLoading: isLoadingMap,
    isRefetching: isRefetchingMap,
    refetch: refetchMap,
  } = trpc.profiles.getNearbyUsersForMap.useQuery(
    {
      latitude: latitude!,
      longitude: longitude!,
      radiusMeters: 5000,
      limit: 100,
    },
    {
      enabled: !!latitude && !!longitude,
      staleTime: 30000,
      placeholderData: keepPreviousData,
    }
  );

  // Fetch sent waves
  const { data: sentWaves } = trpc.waves.getSent.useQuery();

  // Users to display in sheet: filtered by cluster or all
  const displayUsers = useMemo(() => {
    if (selectedCluster) {
      return selectedCluster.users;
    }
    return (mapUsers as MapUser[]) || [];
  }, [selectedCluster, mapUsers]);

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
      await updateLocationMutation.mutateAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.warn('Error getting location:', error);
      if (__DEV__) {
        // Fallback: centrum Warszawy w symulatorze
        const fallbackLat = 52.2297;
        const fallbackLng = 21.0122;
        setLocation(fallbackLat, fallbackLng);
        await updateLocationMutation.mutateAsync({
          latitude: fallbackLat,
          longitude: fallbackLng,
        });
      } else {
        setPermissionStatus('denied');
      }
    }
  };

  const handleWave = async (userId: string, displayName: string) => {
    if (wavedUsers.has(userId)) {
      return;
    }

    setWavingAt(userId);
    try {
      await sendWaveMutation.mutateAsync({ toUserId: userId });
      setWavedUsers((prev) => new Set([...prev, userId]));
      utils.waves.getSent.invalidate();
    } catch (error: any) {
      const errorMsg = error.message || error.toString();
      if (errorMsg.includes('already waved')) {
        setWavedUsers((prev) => new Set([...prev, userId]));
      } else {
        Alert.alert('Błąd', `Nie udało się wysłać zaczepienia: ${errorMsg}`);
      }
    } finally {
      setWavingAt(null);
    }
  };

  const handleClusterPress = useCallback((cluster: GridCluster) => {
    setSelectedCluster(cluster);
    mapRef.current?.animateToRegion(cluster.gridLat, cluster.gridLng);
  }, []);

  const handleClearFilter = useCallback(() => {
    setSelectedCluster(null);
  }, []);

  const handleRefresh = useCallback(() => {
    refetchMap();
  }, [refetchMap]);

  const toggleMap = useCallback(() => {
    const toValue = mapExpanded ? 0 : MAP_EXPANDED_HEIGHT;
    Animated.spring(mapHeight, {
      toValue,
      useNativeDriver: false,
    }).start();
    setMapExpanded((v) => !v);
  }, [mapExpanded, mapHeight]);

  const totalCount = (mapUsers as MapUser[])?.length ?? 0;
  const displayCount = displayUsers.length;

  // Permission denied
  if (permissionStatus === 'denied') {
    return (
      <View style={styles.centered}>
        <IconPin size={48} color={colors.muted} />
        <Text style={styles.emptyTitle}>Brak dostępu do lokalizacji</Text>
        <Text style={styles.emptyText}>
          Włącz lokalizację w ustawieniach, aby zobaczyć osoby w pobliżu
        </Text>
        <View style={{ marginTop: spacing.section }}>
          <Button
            title="Spróbuj ponownie"
            variant="accent"
            onPress={requestLocationPermission}
          />
        </View>
      </View>
    );
  }

  // Loading location
  if (permissionStatus === 'undetermined' || (!latitude && !longitude)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.ink} />
        <Text style={styles.loadingText}>Pobieranie lokalizacji...</Text>
      </View>
    );
  }

  // Loading map data
  if (isLoadingMap && !(mapUsers as MapUser[] | undefined)?.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.ink} />
        <Text style={styles.loadingText}>Ładowanie mapy...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Collapsible map */}
      <Animated.View style={{ height: mapHeight, overflow: 'hidden' }}>
        <View style={{ height: MAP_EXPANDED_HEIGHT }}>
          <NearbyMapView
            ref={mapRef}
            users={(mapUsers as MapUser[]) || []}
            userLatitude={latitude!}
            userLongitude={longitude!}
            onClusterPress={handleClusterPress}
            highlightedGridId={selectedCluster?.gridId}
          />
        </View>
      </Animated.View>

      {/* Map toggle bar */}
      <Pressable onPress={toggleMap} style={styles.mapToggle}>
        <Text style={styles.mapToggleText}>
          {mapExpanded ? 'UKRYJ MAPĘ' : 'POKAŻ MAPĘ'}
        </Text>
      </Pressable>

      {/* List header */}
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderTitle}>
          {selectedCluster
            ? `${displayCount} ${displayCount === 1 ? 'OSOBA' : 'OSÓB'} W TYM MIEJSCU`
            : `${totalCount} ${totalCount === 1 ? 'OSOBA' : 'OSÓB'} W POBLIŻU`}
        </Text>
        {selectedCluster && (
          <Text style={styles.clearButtonText} onPress={handleClearFilter}>
            POKAŻ WSZYSTKICH
          </Text>
        )}
      </View>

      {/* User list */}
      <FlatList
        data={displayUsers}
        keyExtractor={(item) => item.profile.id}
        renderItem={({ item }) => (
          <UserRow
            userId={item.profile.userId}
            displayName={item.profile.displayName}
            avatarUrl={item.profile.avatarUrl}
            distance={item.distance}
            bio={item.profile.bio}
            rankScore={item.rankScore}
            commonInterests={item.commonInterests}
            shortSnippet={item.shortSnippet}
            analysisReady={item.analysisReady}
            hasWaved={wavedUsers.has(item.profile.userId)}
            isWaving={wavingAt === item.profile.userId}
            onWave={() => handleWave(item.profile.userId, item.profile.displayName)}
            onPress={() =>
              router.push({
                pathname: '/(modals)/user/[userId]',
                params: {
                  userId: item.profile.userId,
                  distance: String(item.distance),
                  rankScore: String(item.rankScore),
                  commonInterests: JSON.stringify(item.commonInterests),
                  displayName: item.profile.displayName,
                },
              })
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyListText}>Nikogo w pobliżu</Text>
          </View>
        }
        onRefresh={handleRefresh}
        refreshing={isRefetchingMap}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.section,
    backgroundColor: colors.bg,
  },
  loadingText: {
    ...typ.body,
    color: colors.muted,
    marginTop: spacing.column,
  },
  emptyTitle: {
    ...typ.heading,
    marginTop: spacing.column,
    marginBottom: spacing.tight,
    textAlign: 'center',
  },
  emptyText: {
    ...typ.body,
    color: colors.muted,
    textAlign: 'center',
  },
  mapToggle: {
    backgroundColor: colors.mapBg,
    paddingVertical: spacing.gutter,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  mapToggleText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
  },
  listHeader: {
    paddingHorizontal: spacing.column,
    paddingVertical: spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listHeaderTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
  },
  clearButtonText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.accent,
  },
  listContent: {
    paddingBottom: 40,
  },
  emptyList: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyListText: {
    ...typ.body,
    color: colors.muted,
  },
});
