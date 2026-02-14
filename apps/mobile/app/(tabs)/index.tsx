import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from '../../src/lib/ws';
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
import type { UserRowStatus } from '../../src/components/nearby/UserRow';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { IconPin } from '../../src/components/ui/icons';
import { Button } from '../../src/components/ui/Button';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAP_EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.4;

export default function NearbyScreen() {
  const [selectedCluster, setSelectedCluster] = useState<GridCluster | null>(null);
  const { latitude, longitude, permissionStatus, setLocation, setPermissionStatus } =
    useLocationStore();

  const [mapExpanded, setMapExpanded] = useState(false);
  const mapHeight = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<NearbyMapRef>(null);

  const utils = trpc.useUtils();

  const wsHandler = useCallback((msg: any) => {
    if (msg.type === 'analysisReady' || msg.type === 'nearbyChanged') {
      utils.profiles.getNearbyUsersForMap.invalidate();
    }
  }, []);
  useWebSocket(wsHandler);

  const updateLocationMutation = trpc.profiles.updateLocation.useMutation();

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  // Infinite query for the list (paginated)
  const {
    data: listData,
    isLoading: isLoadingList,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchList,
  } = trpc.profiles.getNearbyUsersForMap.useInfiniteQuery(
    {
      latitude: latitude!,
      longitude: longitude!,
      radiusMeters: 5000,
      limit: 20,
    },
    {
      enabled: !!latitude && !!longitude,
      staleTime: 30000,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialCursor: 0,
    }
  );

  // Separate query for map markers (needs all users, no pagination)
  const {
    data: mapData,
    isLoading: isLoadingMap,
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

  const mapUsers = mapData?.users;
  const totalCount = listData?.pages[0]?.totalCount ?? 0;

  // Fetch waves for status badges
  const { data: sentWaves } = trpc.waves.getSent.useQuery();
  const { data: receivedWaves } = trpc.waves.getReceived.useQuery();

  const waveStatusMap = useMemo(() => {
    const map = new Map<string, 'waved' | 'incoming' | 'friend'>();

    for (const w of sentWaves ?? []) {
      if (w.wave.status === 'accepted') map.set(w.wave.toUserId, 'friend');
      else if (w.wave.status === 'pending') map.set(w.wave.toUserId, 'waved');
    }

    for (const w of receivedWaves ?? []) {
      if (w.wave.status === 'accepted') map.set(w.wave.fromUserId, 'friend');
      else if (w.wave.status === 'pending' && !map.has(w.wave.fromUserId))
        map.set(w.wave.fromUserId, 'incoming');
    }

    return map;
  }, [sentWaves, receivedWaves]);

  // Flatten all pages into a single list
  const allListUsers = useMemo(() => {
    if (!listData?.pages) return [];
    return listData.pages.flatMap((page) => page.users);
  }, [listData]);

  // Users to display in list: filtered by cluster or all
  const displayUsers = useMemo(() => {
    if (selectedCluster) {
      return selectedCluster.users;
    }
    return allListUsers as MapUser[];
  }, [selectedCluster, allListUsers]);

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

  const handleClusterPress = useCallback((cluster: GridCluster) => {
    setSelectedCluster(cluster);
    mapRef.current?.animateToRegion(cluster.gridLat, cluster.gridLng);
  }, []);

  const handleClearFilter = useCallback(() => {
    setSelectedCluster(null);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    refetchList().finally(() => setIsManualRefresh(false));
  }, [refetchList]);

  const toggleMap = useCallback(() => {
    const toValue = mapExpanded ? 0 : MAP_EXPANDED_HEIGHT;
    const animation = mapExpanded
      ? Animated.timing(mapHeight, {
          toValue,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        })
      : Animated.spring(mapHeight, {
          toValue,
          useNativeDriver: false,
        });
    animation.start();
    setMapExpanded((v) => !v);
  }, [mapExpanded, mapHeight]);

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

  // Loading data
  if (isLoadingList && !allListUsers.length) {
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
            users={(mapUsers as MapUser[] | undefined) || []}
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
        renderItem={({ item }) => {
          const status: UserRowStatus = waveStatusMap.get(item.profile.userId) ?? 'none';
          return (
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
            status={status}
            onPress={() =>
              router.push({
                pathname: '/(modals)/user/[userId]',
                params: {
                  userId: item.profile.userId,
                  distance: String(item.distance),
                  rankScore: String(item.rankScore),
                  commonInterests: JSON.stringify(item.commonInterests),
                  displayName: item.profile.displayName,
                  avatarUrl: item.profile.avatarUrl ?? '',
                },
              })
            }
          />
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyListText}>Nikogo w pobliżu</Text>
          </View>
        }
        onRefresh={handleRefresh}
        refreshing={isManualRefresh}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !selectedCluster) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="small" color={colors.muted} />
            </View>
          ) : null
        }
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
  loadingFooter: {
    paddingVertical: spacing.column,
    alignItems: 'center',
  },
});
