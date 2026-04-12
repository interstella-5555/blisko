import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Region } from "react-native-maps";
import { ListShimmer, type NearbyMapRef, NearbyMapView } from "@/components/nearby";
import { GroupRow } from "@/components/nearby/GroupRow";
import type { UserRowStatus } from "@/components/nearby/UserRow";
import { UserRow } from "@/components/nearby/UserRow";
import { Button } from "@/components/ui/Button";
import { IconFilter, IconPin } from "@/components/ui/icons";
import { useNearbyList } from "@/hooks/useNearbyList";
import { useNearbyMapMarkers } from "@/hooks/useNearbyMapMarkers";
import { useRetryStatusMatchingOnFailure } from "@/hooks/useRetryStatusMatchingOnFailure";
import { useSupercluster } from "@/hooks/useSupercluster";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import { useLocationStore } from "@/stores/locationStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useProfilesStore } from "@/stores/profilesStore";
import { useWavesStore } from "@/stores/wavesStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const MAP_EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.4;

type NearbyFilter = "all" | "people" | "groups";

const FILTER_CHIPS: { key: NearbyFilter; label: string }[] = [
  { key: "all", label: "Wszystko" },
  { key: "people", label: "Osoby" },
  { key: "groups", label: "Grupy" },
];

export default function NearbyScreen() {
  const [nearbyFilter, setNearbyFilter] = useState<NearbyFilter>("all");
  const { latitude, longitude, permissionStatus, setLocation, setPermissionStatus } = useLocationStore();
  const { nearbyRadiusMeters, loadPreferences, photoOnly, showAllNearby } = usePreferencesStore();

  const [mapExpanded, setMapExpanded] = useState(true);
  const mapHeight = useRef(new Animated.Value(MAP_EXPANDED_HEIGHT)).current;
  const mapExpandedRef = useRef(mapExpanded);
  mapExpandedRef.current = mapExpanded;
  const mapRef = useRef<NearbyMapRef>(null);

  const hasActiveFilters = photoOnly || showAllNearby;

  const { mutateAsync: updateLocationAsync } = trpc.profiles.updateLocation.useMutation();
  const { mutate: ensureAnalysisMutate } = trpc.profiles.ensureAnalysis.useMutation();

  // Split queries: markers for map, list for user rows
  const { points, totalUserCount, refetch: refetchMarkers } = useNearbyMapMarkers();
  const {
    users: listUsers,
    totalCount,
    myStatus: listMyStatus,
    isLoading: isLoadingList,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch: refetchList,
    onRegionChange: onListRegionChange,
  } = useNearbyList();
  const { getClusters, getExpansionZoom } = useSupercluster(points);

  // Track current map region — updated on every pan/zoom, initialized to user location
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: latitude!,
    longitude: longitude!,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // Clusters recompute automatically when points or region change
  const clusters = useMemo(() => getClusters(mapRegion), [getClusters, mapRegion]);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      setMapRegion(region);
      onListRegionChange(region);
    },
    [onListRegionChange],
  );

  const handleClusterPress = useCallback(
    (clusterId: number, lat: number, lng: number) => {
      const zoom = getExpansionZoom(clusterId);
      mapRef.current?.animateToRegion(lat, lng, zoom);
    },
    [getExpansionZoom],
  );

  // Groups query — kept for list detail (member counts, descriptions)
  const { data: nearbyGroups } = trpc.groups.getDiscoverable.useQuery(
    {
      latitude: latitude!,
      longitude: longitude!,
      radiusMeters: nearbyRadiusMeters,
      bbox: showAllNearby
        ? undefined
        : {
            south: mapRegion.latitude - mapRegion.latitudeDelta / 2,
            north: mapRegion.latitude + mapRegion.latitudeDelta / 2,
            west: mapRegion.longitude - mapRegion.longitudeDelta / 2,
            east: mapRegion.longitude + mapRegion.longitudeDelta / 2,
          },
    },
    {
      enabled: !!latitude && !!longitude && nearbyFilter !== "people",
      staleTime: 30000,
    },
  );

  // Derive status from auth store (optimistic) with query fallback
  const profile = useAuthStore((s) => s.profile);
  const myStatus = useMemo(() => {
    if (profile?.currentStatus) {
      return { text: profile.currentStatus };
    }
    return listMyStatus ?? null;
  }, [profile?.currentStatus, listMyStatus]);

  // Wave status from store (populated by _layout.tsx hydration + WS)
  const waveStatusByUserId = useWavesStore((s) => s.waveStatusByUserId);

  // Populate profiles store for instant profile navigation
  useEffect(() => {
    if (listUsers.length === 0) return;
    useProfilesStore.getState().mergeMany(
      listUsers.map((u) => ({
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
      })),
    );
  }, [listUsers]);

  // Self-healing: if analyses are stuck, poke backend after 30s
  const listUsersRef = useRef<typeof listUsers>([]);
  listUsersRef.current = listUsers;

  useEffect(() => {
    const unanalyzed = listUsers.filter((u) => !u.analysisReady);
    if (unanalyzed.length === 0) return;

    const timer = setTimeout(() => {
      const stillUnanalyzed = listUsersRef.current.filter((u) => !u.analysisReady);
      for (const u of stillUnanalyzed.slice(0, 5)) {
        ensureAnalysisMutate({ userId: u.profile.userId });
      }
    }, 30_000);

    return () => clearTimeout(timer);
  }, [listUsers, ensureAnalysisMutate]);

  // WS handler — smart cache patching
  const wsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wsHandler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "nearbyChanged") {
        // Debounce 3s — only refetch list
        if (wsDebounceRef.current) clearTimeout(wsDebounceRef.current);
        wsDebounceRef.current = setTimeout(() => {
          refetchList();
        }, 3000);
      }
      if (msg.type === "analysisReady") {
        // Analysis completed for a nearby user — refetch list to show new snippet/score
        refetchList();
      }
      if (msg.type === "statusMatchesReady") {
        refetchMarkers();
        refetchList();
      }
      if (msg.type === "analysisFailed") {
        const inList = listUsersRef.current.some((u) => u.profile.userId === msg.aboutUserId);
        if (inList) ensureAnalysisMutate({ userId: msg.aboutUserId });
      }
    },
    [refetchList, refetchMarkers, ensureAnalysisMutate],
  );
  useWebSocket(wsHandler);
  useRetryStatusMatchingOnFailure();

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  // Build combined list data for FlatList
  type NearbyGroup = NonNullable<typeof nearbyGroups>[number];
  type ListUser = (typeof listUsers)[number];
  type ListItem =
    | { type: "userHeader"; count: number; viewportCount: number }
    | { type: "user"; data: ListUser }
    | { type: "groupHeader"; count: number }
    | { type: "group"; data: NearbyGroup }
    | { type: "groupsEmpty" };

  const listItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    const groups = nearbyGroups ?? [];

    if (nearbyFilter === "people") {
      for (const u of listUsers) {
        items.push({ type: "user", data: u });
      }
    } else if (nearbyFilter === "groups") {
      if (groups.length === 0) {
        items.push({ type: "groupsEmpty" });
      } else {
        for (const g of groups) {
          items.push({ type: "group", data: g });
        }
      }
    } else {
      // "all" — users section then groups section
      if (listUsers.length > 0) {
        items.push({ type: "userHeader", count: totalUserCount, viewportCount: totalCount });
        for (const u of listUsers) {
          items.push({ type: "user", data: u });
        }
      }
      if (groups.length > 0) {
        items.push({ type: "groupHeader", count: groups.length });
        for (const g of groups) {
          items.push({ type: "group", data: g });
        }
      }
    }
    return items;
  }, [nearbyFilter, listUsers, nearbyGroups, totalUserCount, totalCount, showAllNearby, mapRegion]);

  const updateLocation = useCallback(async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(location.coords.latitude, location.coords.longitude);
      await updateLocationAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.warn("Error getting location:", error);
      setTimeout(() => {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((loc) => {
            setLocation(loc.coords.latitude, loc.coords.longitude);
            updateLocationAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }).catch(() => {});
          })
          .catch(() => {
            console.warn("Location retry failed");
          });
      }, 3000);
    }
  }, [setLocation, updateLocationAsync]);

  const requestLocationPermission = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissionStatus(status === "granted" ? "granted" : "denied");
    if (status === "granted") {
      await updateLocation();
    }
  }, [setPermissionStatus, updateLocation]);

  useEffect(() => {
    loadPreferences();
    requestLocationPermission();
  }, [loadPreferences, requestLocationPermission]);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    Promise.all([refetchMarkers(), refetchList()]).finally(() => setIsManualRefresh(false));
  }, [refetchMarkers, refetchList]);

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
            Animated.timing(mapHeight, {
              toValue,
              duration: 300,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }).start();
          } else {
            Animated.spring(mapHeight, { toValue, useNativeDriver: false }).start();
          }
          setMapExpanded(!expanded);
          return;
        }

        const threshold = MAP_EXPANDED_HEIGHT * 0.3;

        // Swipe up to collapse
        if (expanded && (dy < -threshold || vy < -0.5)) {
          Animated.timing(mapHeight, {
            toValue: 0,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();
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
    }),
  ).current;

  // Permission denied
  if (permissionStatus === "denied") {
    return (
      <View style={styles.centered}>
        <IconPin size={48} color={colors.muted} />
        <Text style={styles.emptyTitle}>Brak dostępu do lokalizacji</Text>
        <Text style={styles.emptyText}>Włącz lokalizację w ustawieniach, aby zobaczyć osoby w pobliżu</Text>
        <View style={{ marginTop: spacing.section }}>
          <Button title="Spróbuj ponownie" variant="accent" onPress={requestLocationPermission} />
        </View>
      </View>
    );
  }

  // Loading location
  if (permissionStatus === "undetermined" || (!latitude && !longitude)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.ink} />
        <Text style={styles.loadingText}>Pobieranie lokalizacji...</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    switch (item.type) {
      case "userHeader": {
        const { count, viewportCount } = item;
        return (
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>
              {showAllNearby || viewportCount >= count
                ? `${count} ${count === 1 ? "OSOBA" : "OSÓB"} W POBLIŻU`
                : `${viewportCount} Z ${count} OSÓB W POBLIŻU`}
            </Text>
          </View>
        );
      }
      case "user": {
        const u = item.data;
        const waveStatus = waveStatusByUserId.get(u.profile.userId);
        const status: UserRowStatus = waveStatus
          ? waveStatus.type === "connected"
            ? "friend"
            : waveStatus.type === "sent"
              ? "waved"
              : "incoming"
          : "none";
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
            hasStatusMatch={u.hasStatusMatch}
            status={status}
            onPress={() =>
              router.push({
                pathname: "/(modals)/user/[userId]",
                params: {
                  userId: u.profile.userId,
                  distance: String(u.distance),
                  rankScore: String(u.rankScore),
                  matchScore: String(u.matchScore),
                  commonInterests: JSON.stringify(u.commonInterests),
                  displayName: u.profile.displayName,
                  avatarUrl: u.profile.avatarUrl ?? "",
                },
              })
            }
          />
        );
      }
      case "groupHeader":
        return (
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>
              {item.count} {item.count === 1 ? "GRUPA" : "GRUP"} W POBLIŻU
            </Text>
          </View>
        );
      case "group": {
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
      case "groupsEmpty":
        return (
          <View style={styles.emptyList}>
            <Text style={styles.emptyListText}>Brak grup w okolicy</Text>
            <View style={{ marginTop: spacing.gutter }}>
              <Button title="Utwórz grupę" variant="accent" onPress={() => router.push("/create-group")} />
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  const getItemKey = (item: ListItem, index: number) => {
    switch (item.type) {
      case "userHeader":
        return "user-header";
      case "user":
        return `user-${item.data.profile.id}`;
      case "groupHeader":
        return "group-header";
      case "group":
        return `group-${item.data.id}`;
      case "groupsEmpty":
        return "groups-empty";
      default:
        return String(index);
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
              pathname: "/set-status" as never,
              params: {
                prefill: myStatus.text,
                prefillVisibility: profile?.statusVisibility ?? undefined,
                prefillCategories: profile?.statusCategories?.join(",") ?? undefined,
              },
            })
          }
        >
          <Text style={styles.statusBarText} numberOfLines={1}>
            {myStatus.text}
          </Text>
        </Pressable>
      ) : (
        <Pressable style={styles.statusBarEmpty} onPress={() => router.push("/set-status" as never)}>
          <Text style={styles.statusBarEmptyText}>+ Ustaw status na teraz</Text>
        </Pressable>
      )}

      {/* Collapsible map */}
      <Animated.View style={{ height: mapHeight, overflow: "hidden" }}>
        <View style={{ height: MAP_EXPANDED_HEIGHT }}>
          <NearbyMapView
            ref={mapRef}
            clusters={clusters}
            userLatitude={latitude!}
            userLongitude={longitude!}
            onClusterPress={handleClusterPress}
            onUserPress={(userId) => router.push({ pathname: "/(modals)/user/[userId]", params: { userId } })}
            onGroupPress={(groupId) => router.push({ pathname: "/(modals)/group/[id]", params: { id: groupId } })}
            onRegionChangeComplete={handleRegionChangeComplete}
          />
        </View>
      </Animated.View>

      {/* Map toggle bar — tap or swipe to show/hide */}
      <View {...mapPanResponder.panHandlers} style={styles.mapToggle}>
        <View style={styles.dragHandle} />
        <Text style={styles.mapToggleText}>{mapExpanded ? "UKRYJ MAPĘ" : "POKAŻ MAPĘ"}</Text>
      </View>

      {/* Filter chips + funnel */}
      <View style={styles.filterRow}>
        <View style={styles.filterChips}>
          {FILTER_CHIPS.map((chip) => (
            <Pressable
              key={chip.key}
              style={[
                styles.filterChip,
                nearbyFilter === chip.key ? styles.filterChipActive : styles.filterChipInactive,
              ]}
              onPress={() => setNearbyFilter(chip.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  nearbyFilter === chip.key ? styles.filterChipTextActive : styles.filterChipTextInactive,
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={[styles.filterFunnel, hasActiveFilters && styles.filterFunnelActive]}
          onPress={() => router.push("/filters" as never)}
        >
          <IconFilter size={16} color={hasActiveFilters ? colors.accent : colors.muted} />
          {hasActiveFilters && <View style={styles.filterDot} />}
        </Pressable>
      </View>

      {/* List header with viewport info */}
      {nearbyFilter === "people" && (
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderTitle}>
            {showAllNearby || totalCount >= totalUserCount
              ? `${totalUserCount} ${totalUserCount === 1 ? "OSOBA" : "OSÓB"} W POBLIŻU`
              : `${totalCount} Z ${totalUserCount} OSÓB W POBLIŻU`}
          </Text>
        </View>
      )}
      {nearbyFilter === "groups" && (nearbyGroups?.length ?? 0) > 0 && (
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderTitle}>
            {nearbyGroups?.length ?? 0} {(nearbyGroups?.length ?? 0) === 1 ? "GRUPA" : "GRUP"} W POBLIŻU
          </Text>
        </View>
      )}

      {/* Combined list */}
      {isLoadingList && !listUsers.length ? (
        <ListShimmer count={4} />
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={getItemKey}
          renderItem={renderItem}
          ListEmptyComponent={
            nearbyFilter === "people" ? (
              <View style={styles.emptyList}>
                <Text style={styles.emptyListText}>Nikogo w pobliżu</Text>
              </View>
            ) : null
          }
          onRefresh={handleRefresh}
          refreshing={isManualRefresh}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator style={{ padding: 16 }} color={colors.ink} /> : null
          }
        />
      )}
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
    justifyContent: "center",
    alignItems: "center",
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
    textAlign: "center",
  },
  emptyText: {
    ...typ.body,
    color: colors.muted,
    textAlign: "center",
  },
  statusBar: {
    backgroundColor: "#FDF5EC",
    borderBottomWidth: 1.5,
    borderBottomColor: "#E8C9A0",
    paddingVertical: spacing.gutter,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBarText: {
    fontSize: 12,
    fontFamily: fonts.sansMedium,
    color: colors.ink,
    flex: 1,
  },
  statusBarEmpty: {
    backgroundColor: colors.mapBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    paddingVertical: spacing.gutter,
    paddingHorizontal: 16,
    alignItems: "center",
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
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.section,
    marginVertical: spacing.gutter,
    gap: spacing.tight,
  },
  filterChips: {
    flexDirection: "row",
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
    backgroundColor: "transparent",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listHeaderTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
  },
  listHeaderAction: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: "#efa844",
  },
  listContent: {
    paddingBottom: 40,
  },
  emptyList: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyListText: {
    ...typ.body,
    color: colors.muted,
  },
  filterFunnel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  filterFunnelActive: {
    borderColor: colors.accent,
    backgroundColor: colors.status.error.bg,
  },
  filterDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
