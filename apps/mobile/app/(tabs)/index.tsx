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
  PanResponder,
} from 'react-native';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from '../../src/lib/ws';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { keepPreviousData } from '@tanstack/react-query';
import type { Region } from 'react-native-maps';
import { useLocationStore } from '../../src/stores/locationStore';
import { usePreferencesStore } from '../../src/stores/preferencesStore';
import { useProfilesStore } from '../../src/stores/profilesStore';
import { useWavesStore } from '../../src/stores/wavesStore';
import { useAuthStore } from '../../src/stores/authStore';
import { trpc } from '../../src/lib/trpc';
import {
  NearbyMapView,
  type MapUser,
  type MapGroup,
  type GridCluster,
  type NearbyMapRef,
} from '../../src/components/nearby';
import { UserRow } from '../../src/components/nearby/UserRow';
import type { UserRowStatus } from '../../src/components/nearby/UserRow';
import { GroupRow } from '../../src/components/nearby/GroupRow';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { IconPin, IconSettings } from '../../src/components/ui/icons';
import { Button } from '../../src/components/ui/Button';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAP_EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.4;

function formatTimeLeft(expiresAt: string | null): string {
  if (!expiresAt) return '∞';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'wygasł';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

type NearbyFilter = 'all' | 'people' | 'groups';

const FILTER_CHIPS: { key: NearbyFilter; label: string }[] = [
  { key: 'all', label: 'Wszystko' },
  { key: 'people', label: 'Osoby' },
  { key: 'groups', label: 'Grupy' },
];

export default function NearbyScreen() {
  const [selectedCluster, setSelectedCluster] = useState<GridCluster | null>(null);
  const [nearbyFilter, setNearbyFilter] = useState<NearbyFilter>('all');
  const { latitude, longitude, permissionStatus, setLocation, setPermissionStatus } =
    useLocationStore();
  const { nearbyRadiusMeters, loadPreferences, photoOnly, nearbyOnly } = usePreferencesStore();

  const [mapExpanded, setMapExpanded] = useState(true);
  const mapHeight = useRef(new Animated.Value(MAP_EXPANDED_HEIGHT)).current;
  const mapExpandedRef = useRef(mapExpanded);
  mapExpandedRef.current = mapExpanded;
  const mapRef = useRef<NearbyMapRef>(null);

  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const hasActiveFilters = photoOnly || nearbyOnly;

  const utils = trpc.useUtils();

  const wsHandler = useCallback((msg: any) => {
    if (msg.type === 'analysisReady' || msg.type === 'nearbyChanged' || msg.type === 'statusMatchesReady') {
      utils.profiles.getNearbyUsersForMap.invalidate();
    }
  }, []);
  useWebSocket(wsHandler);

  const updateLocationMutation = trpc.profiles.updateLocation.useMutation();
  const ensureAnalysisMutation = trpc.profiles.ensureAnalysis.useMutation();

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
      radiusMeters: nearbyRadiusMeters,
      limit: 20,
      photoOnly: photoOnly || undefined,
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
      radiusMeters: nearbyRadiusMeters,
      limit: 100,
      photoOnly: photoOnly || undefined,
    },
    {
      enabled: !!latitude && !!longitude,
      staleTime: 30000,
      placeholderData: keepPreviousData,
    }
  );

  // Groups query — only when filter includes groups
  const { data: nearbyGroups } = trpc.groups.getDiscoverable.useQuery(
    {
      latitude: latitude!,
      longitude: longitude!,
      radiusMeters: nearbyRadiusMeters,
    },
    {
      enabled: !!latitude && !!longitude && nearbyFilter !== 'people',
      staleTime: 30000,
    }
  );

  const mapUsers = mapData?.users;
  const totalCount = listData?.pages[0]?.totalCount ?? 0;
  // Derive status from auth store (optimistic) with query fallback
  const profile = useAuthStore((s) => s.profile);
  const myStatus = useMemo(() => {
    if (profile?.currentStatus && profile?.statusExpiresAt) {
      const expires = new Date(profile.statusExpiresAt);
      if (expires > new Date()) {
        return { text: profile.currentStatus, expiresAt: profile.statusExpiresAt };
      }
      return null;
    }
    return listData?.pages[0]?.myStatus ?? null;
  }, [profile?.currentStatus, profile?.statusExpiresAt, listData]);

  // Wave status from store (populated by _layout.tsx hydration + WS)
  const waveStatusByUserId = useWavesStore((s) => s.waveStatusByUserId);

  // Flatten all pages into a single list
  const allListUsers = useMemo(() => {
    if (!listData?.pages) return [];
    return listData.pages.flatMap((page) => page.users);
  }, [listData]);

  // Populate profiles store for instant profile navigation
  useEffect(() => {
    if (allListUsers.length === 0) return;
    useProfilesStore.getState().mergeMany(
      allListUsers.map((u) => ({
        userId: u.profile.userId,
        displayName: u.profile.displayName,
        avatarUrl: u.profile.avatarUrl,
        bio: u.profile.bio,
        distance: u.distance,
        matchScore: u.matchScore,
        commonInterests: u.commonInterests,
        shortSnippet: u.shortSnippet,
        analysisReady: u.analysisReady,
        _partial: true,
      }))
    );
  }, [allListUsers]);

  // Self-healing: if analyses are stuck, poke backend after 30s
  const allListUsersRef = useRef(allListUsers);
  allListUsersRef.current = allListUsers;

  useEffect(() => {
    const unanalyzed = allListUsers.filter((u) => !u.analysisReady);
    if (unanalyzed.length === 0) return;

    const timer = setTimeout(() => {
      const stillUnanalyzed = allListUsersRef.current.filter((u) => !u.analysisReady);
      for (const u of stillUnanalyzed.slice(0, 5)) {
        ensureAnalysisMutation.mutate({ userId: u.profile.userId });
      }
    }, 30_000);

    return () => clearTimeout(timer);
  }, [allListUsers]);

  // Users to display in list: filtered by cluster, nearby viewport, or all
  const displayUsers = useMemo(() => {
    let users: MapUser[];
    if (selectedCluster) {
      users = selectedCluster.users;
    } else {
      users = allListUsers as MapUser[];
    }
    if (nearbyOnly && mapRegion) {
      const latMin = mapRegion.latitude - mapRegion.latitudeDelta / 2;
      const latMax = mapRegion.latitude + mapRegion.latitudeDelta / 2;
      const lngMin = mapRegion.longitude - mapRegion.longitudeDelta / 2;
      const lngMax = mapRegion.longitude + mapRegion.longitudeDelta / 2;
      users = users.filter(
        (u) =>
          u.gridLat >= latMin &&
          u.gridLat <= latMax &&
          u.gridLng >= lngMin &&
          u.gridLng <= lngMax
      );
    }
    return users;
  }, [selectedCluster, allListUsers, nearbyOnly, mapRegion]);

  // Groups for map markers
  const mapGroups = useMemo((): MapGroup[] => {
    if (!nearbyGroups) return [];
    return nearbyGroups
      .filter((g): g is typeof g & { latitude: number; longitude: number } =>
        g.latitude != null && g.longitude != null
      )
      .map((g) => ({
        id: g.id,
        name: g.name,
        avatarUrl: g.avatarUrl,
        latitude: g.latitude,
        longitude: g.longitude,
        nearbyMemberCount: g.nearbyMemberCount,
      }));
  }, [nearbyGroups]);

  const handleGroupPress = useCallback((group: MapGroup) => {
    router.push(`/(modals)/group/${group.id}`);
  }, []);

  // Build combined list data for FlatList
  type NearbyGroup = NonNullable<typeof nearbyGroups>[number];
  type ListItem =
    | { type: 'userHeader'; count: number }
    | { type: 'user'; data: MapUser }
    | { type: 'groupHeader'; count: number }
    | { type: 'group'; data: NearbyGroup }
    | { type: 'groupsEmpty' };

  const listItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    const groups = nearbyGroups ?? [];

    if (nearbyFilter === 'people') {
      // People only — same as before, header handled outside FlatList
      for (const u of displayUsers) {
        items.push({ type: 'user', data: u });
      }
    } else if (nearbyFilter === 'groups') {
      if (groups.length === 0) {
        items.push({ type: 'groupsEmpty' });
      } else {
        for (const g of groups) {
          items.push({ type: 'group', data: g });
        }
      }
    } else {
      // "all" — users section then groups section
      if (displayUsers.length > 0) {
        items.push({ type: 'userHeader', count: selectedCluster ? displayUsers.length : totalCount });
        for (const u of displayUsers) {
          items.push({ type: 'user', data: u });
        }
      }
      if (groups.length > 0) {
        items.push({ type: 'groupHeader', count: groups.length });
        for (const g of groups) {
          items.push({ type: 'group', data: g });
        }
      }
    }
    return items;
  }, [nearbyFilter, displayUsers, nearbyGroups, selectedCluster, totalCount]);

  useEffect(() => {
    loadPreferences();
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
    Promise.all([
      utils.profiles.getNearbyUsersForMap.invalidate(),
      utils.groups.getDiscoverable.invalidate(),
    ]).finally(() => setIsManualRefresh(false));
  }, [utils]);

  const mapPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 5,
      onPanResponderMove: (_, { dy }) => {
        const base = mapExpandedRef.current ? MAP_EXPANDED_HEIGHT : 0;
        mapHeight.setValue(Math.max(0, Math.min(MAP_EXPANDED_HEIGHT, base + dy)));
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        const expanded = mapExpandedRef.current;

        // Tap — toggle
        if (Math.abs(dy) < 5) {
          const toValue = expanded ? 0 : MAP_EXPANDED_HEIGHT;
          if (expanded) {
            Animated.timing(mapHeight, { toValue, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
          } else {
            Animated.spring(mapHeight, { toValue, useNativeDriver: false }).start();
          }
          setMapExpanded(!expanded);
          return;
        }

        const threshold = MAP_EXPANDED_HEIGHT * 0.3;

        // Swipe up to collapse
        if (expanded && (dy < -threshold || vy < -0.5)) {
          Animated.timing(mapHeight, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
          setMapExpanded(false);
        }
        // Swipe down to expand
        else if (!expanded && (dy > threshold || vy > 0.5)) {
          Animated.spring(mapHeight, { toValue: MAP_EXPANDED_HEIGHT, useNativeDriver: false }).start();
          setMapExpanded(true);
        }
        // Snap back
        else {
          const toValue = expanded ? MAP_EXPANDED_HEIGHT : 0;
          Animated.spring(mapHeight, { toValue, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

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

  const renderItem = ({ item }: { item: ListItem }) => {
    switch (item.type) {
      case 'userHeader': {
        const count = item.count;
        return (
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>
              {selectedCluster
                ? `${displayCount} ${displayCount === 1 ? 'OSOBA' : 'OSÓB'} W TYM MIEJSCU`
                : `${count} ${count === 1 ? 'OSOBA' : 'OSÓB'} W POBLIŻU`}
            </Text>
            {selectedCluster && (
              <Text style={styles.clearButtonText} onPress={handleClearFilter}>
                POKAŻ WSZYSTKICH
              </Text>
            )}
          </View>
        );
      }
      case 'user': {
        const u = item.data;
        const waveStatus = waveStatusByUserId.get(u.profile.userId);
        const status: UserRowStatus = waveStatus
          ? waveStatus.type === 'connected' ? 'friend'
            : waveStatus.type === 'sent' ? 'waved'
            : 'incoming'
          : 'none';
        return (
          <UserRow
            userId={u.profile.userId}
            displayName={u.profile.displayName}
            avatarUrl={u.profile.avatarUrl}
            distance={u.distance}
            bio={u.profile.bio}
            rankScore={u.rankScore}
            matchScore={u.matchScore}
            commonInterests={u.commonInterests}
            shortSnippet={u.shortSnippet}
            analysisReady={u.analysisReady}
            statusMatch={u.statusMatch}
            status={status}
            onPress={() =>
              router.push({
                pathname: '/(modals)/user/[userId]',
                params: {
                  userId: u.profile.userId,
                  distance: String(u.distance),
                  rankScore: String(u.rankScore),
                  matchScore: String(u.matchScore),
                  commonInterests: JSON.stringify(u.commonInterests),
                  displayName: u.profile.displayName,
                  avatarUrl: u.profile.avatarUrl ?? '',
                },
              })
            }
          />
        );
      }
      case 'groupHeader':
        return (
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>
              {item.count} {item.count === 1 ? 'GRUPA' : 'GRUP'} W POBLIŻU
            </Text>
          </View>
        );
      case 'group': {
        const g = item.data;
        return (
          <GroupRow
            conversationId={g.id}
            name={g.name}
            avatarUrl={g.avatarUrl}
            description={g.description}
            distance={g.distance}
            memberCount={g.memberCount}
            nearbyMemberCount={g.nearbyMemberCount}
          />
        );
      }
      case 'groupsEmpty':
        return (
          <View style={styles.emptyList}>
            <Text style={styles.emptyListText}>Brak grup w okolicy</Text>
            <View style={{ marginTop: spacing.gutter }}>
              <Button
                title="Utwórz grupę"
                variant="accent"
                onPress={() => router.push('/(modals)/create-group')}
              />
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  const getItemKey = (item: ListItem, index: number) => {
    switch (item.type) {
      case 'userHeader': return 'user-header';
      case 'user': return `user-${item.data.profile.id}`;
      case 'groupHeader': return 'group-header';
      case 'group': return `group-${item.data.id}`;
      case 'groupsEmpty': return 'groups-empty';
      default: return String(index);
    }
  };

  return (
    <View style={styles.container}>
      {/* Status bar — above map */}
      {myStatus ? (
        <Pressable
          style={styles.statusBar}
          onPress={() =>
            router.push({
              pathname: '/set-status' as any,
              params: { prefill: myStatus.text },
            })
          }
        >
          <Text style={styles.statusBarText} numberOfLines={1}>{myStatus.text}</Text>
          <Text style={styles.statusBarTime}>{formatTimeLeft(myStatus.expiresAt)}</Text>
        </Pressable>
      ) : (
        <Pressable
          style={styles.statusBarEmpty}
          onPress={() => router.push('/set-status' as any)}
        >
          <Text style={styles.statusBarEmptyText}>+ Ustaw status na teraz</Text>
        </Pressable>
      )}

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
            groups={nearbyFilter !== 'people' ? mapGroups : undefined}
            onGroupPress={handleGroupPress}
            onRegionChangeComplete={setMapRegion}
          />
        </View>
      </Animated.View>

      {/* Map toggle bar — tap or swipe to show/hide */}
      <View {...mapPanResponder.panHandlers} style={styles.mapToggle}>
        <View style={styles.dragHandle} />
        <Text style={styles.mapToggleText}>
          {mapExpanded ? 'UKRYJ MAPĘ' : 'POKAŻ MAPĘ'}
        </Text>
      </View>

      {/* Filter chips + funnel */}
      <View style={styles.filterRow}>
        <View style={styles.filterChips}>
          {FILTER_CHIPS.map((chip) => (
            <Pressable
              key={chip.key}
              style={[
                styles.filterChip,
                nearbyFilter === chip.key
                  ? styles.filterChipActive
                  : styles.filterChipInactive,
              ]}
              onPress={() => setNearbyFilter(chip.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  nearbyFilter === chip.key
                    ? styles.filterChipTextActive
                    : styles.filterChipTextInactive,
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={[styles.filterFunnel, hasActiveFilters && styles.filterFunnelActive]}
          onPress={() => router.push('/filters' as any)}
        >
          <IconSettings size={16} color={hasActiveFilters ? colors.accent : colors.muted} />
          {hasActiveFilters && <View style={styles.filterDot} />}
        </Pressable>
      </View>

      {/* People-only header (when filter = people) */}
      {nearbyFilter === 'people' && (
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
      )}

      {/* Combined list */}
      <FlatList
        data={listItems}
        keyExtractor={getItemKey}
        renderItem={renderItem}
        ListEmptyComponent={
          nearbyFilter === 'people' ? (
            <View style={styles.emptyList}>
              <Text style={styles.emptyListText}>Nikogo w pobliżu</Text>
            </View>
          ) : null
        }
        onRefresh={handleRefresh}
        refreshing={isManualRefresh}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onEndReached={() => {
          if (nearbyFilter !== 'groups' && hasNextPage && !isFetchingNextPage && !selectedCluster) {
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
  statusBar: {
    backgroundColor: '#FDF5EC',
    borderBottomWidth: 1.5,
    borderBottomColor: '#E8C9A0',
    paddingVertical: spacing.gutter,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBarText: {
    fontSize: 12,
    fontFamily: fonts.sansMedium,
    color: colors.ink,
    flex: 1,
  },
  statusBarTime: {
    fontSize: 10,
    fontFamily: fonts.sansSemiBold,
    color: '#D4851C',
  },
  statusBarEmpty: {
    backgroundColor: colors.mapBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    paddingVertical: spacing.gutter,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  statusBarEmptyText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.muted,
  },
  mapToggle: {
    backgroundColor: colors.mapBg,
    paddingTop: 6,
    paddingBottom: spacing.gutter,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  dragHandle: {
    width: 28,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: colors.rule,
    opacity: 0.5,
    marginBottom: 4,
  },
  mapToggleText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.section,
    marginVertical: spacing.gutter,
    gap: spacing.tight,
  },
  filterChips: {
    flexDirection: 'row',
    gap: spacing.tight,
    flex: 1,
  },
  filterChip: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.tick,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  filterChipInactive: {
    backgroundColor: 'transparent',
    borderColor: colors.rule,
  },
  filterChipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  filterChipTextActive: {
    color: colors.bg,
  },
  filterChipTextInactive: {
    color: colors.ink,
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
  filterFunnel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterFunnelActive: {
    borderColor: colors.accent,
    backgroundColor: colors.status.error.bg,
  },
  filterDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
