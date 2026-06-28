import { Trans, useLingui } from "@lingui/react/macro";
import { MATCH_QUALITY_THRESHOLD } from "@repo/shared";
import { keepPreviousData } from "@tanstack/react-query";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDebouncedCallback } from "use-debounce";
import { DEFAULT_MAP_DELTA, FirstTapHint, ListShimmer, type NearbyMapRef, NearbyMapView } from "@/components/nearby";
import { GroupRow } from "@/components/nearby/GroupRow";
import type { UserRowStatus } from "@/components/nearby/UserRow";
import { UserRow } from "@/components/nearby/UserRow";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconChevronRight, IconFilter, IconNavigate, IconPin, IconPlus, IconSearch } from "@/components/ui/icons";
import { SplashHold } from "@/components/ui/SplashHold";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useNearbyList } from "@/hooks/useNearbyList";
import { useNearbyMapMarkers } from "@/hooks/useNearbyMapMarkers";
import { useRetryStatusMatchingOnFailure } from "@/hooks/useRetryStatusMatchingOnFailure";
import { useSupercluster } from "@/hooks/useSupercluster";
import { hapticTap } from "@/lib/haptics";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import { useLocationStore } from "@/stores/locationStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useProfilesStore } from "@/stores/profilesStore";
import { useWavesStore } from "@/stores/wavesStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const LIST_SHEET_HEIGHT = SCREEN_HEIGHT * 0.8;

// Bottom-right floating action button (recenter, and future stacked actions).
const FAB_SIZE = 46;

/**
 * Equirectangular distance approximation — treats Earth as flat over short distances.
 * Good enough for UI-level "has the user panned outside their radius?" checks (error < 0.5% under 10 km).
 *
 * METERS_PER_DEGREE: Earth's circumference (~40 075 km) / 360°.
 * Longitude degrees shrink toward the poles — multiplied by cos(latitude) to compensate.
 * Math.PI / 180 converts degrees to radians for Math.cos().
 */
const METERS_PER_DEGREE = 40_075_000 / 360;

function approxDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * METERS_PER_DEGREE;
  const dLng = (lng2 - lng1) * METERS_PER_DEGREE * Math.cos(lat1 * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

type NearbyFilter = "all" | "people" | "groups";

export default function NearbyScreen() {
  const { t } = useLingui();
  const FILTER_CHIPS: { key: NearbyFilter; label: string }[] = [
    { key: "all", label: t`Wszystko` },
    { key: "people", label: t`Osoby` },
    { key: "groups", label: t`Grupy` },
  ];
  const [nearbyFilter, setNearbyFilter] = useState<NearbyFilter>("all");
  const { latitude, longitude, permissionStatus, setLocation, setPermissionStatus } = useLocationStore();
  const { loadPreferences, photoOnly, showAllNearby } = usePreferencesStore();
  const config = useAppConfig();
  const nearbyRadiusMeters = config.nearby.defaultRadiusMeters;

  const insets = useSafeAreaInsets();
  const mapRef = useRef<NearbyMapRef>(null);

  const [listOpen, setListOpen] = useState(false);
  const sheetAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(sheetAnim, { toValue: listOpen ? 0 : 1, duration: 280, useNativeDriver: true }).start();
  }, [listOpen, sheetAnim]);

  const hasActiveFilters = photoOnly || showAllNearby;

  const { mutateAsync: updateLocationAsync } = trpc.profiles.updateLocation.useMutation();
  const { mutate: ensureAnalysisMutate } = trpc.profiles.ensureAnalysis.useMutation();

  // Split queries: markers for map, list for user rows
  const { points, totalUserCount, refetch: refetchMarkers } = useNearbyMapMarkers();
  const {
    users: listUsers,
    totalCount,
    qualityCount,
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
    latitudeDelta: DEFAULT_MAP_DELTA,
    longitudeDelta: DEFAULT_MAP_DELTA,
  });

  // Detect when the viewport center has drifted outside the nearby radius
  const isOutsideRadius = useMemo(() => {
    if (!latitude || !longitude || showAllNearby) return false;
    return approxDistanceMeters(latitude, longitude, mapRegion.latitude, mapRegion.longitude) > nearbyRadiusMeters;
  }, [latitude, longitude, mapRegion.latitude, mapRegion.longitude, nearbyRadiusMeters, showAllNearby]);

  const handleReturnToMyLocation = useCallback(() => {
    if (!latitude || !longitude) return;
    mapRef.current?.animateToRegion(latitude, longitude, DEFAULT_MAP_DELTA);
  }, [latitude, longitude]);

  // The recenter button only makes sense once the map has drifted off the user's location —
  // i.e. when tapping it would actually move the map. Show it when the user dot is more than
  // 15% of the viewport away from the current center; fades in/out otherwise.
  const showRecenter = useMemo(() => {
    if (!latitude || !longitude) return false;
    const offLat = Math.abs(mapRegion.latitude - latitude);
    const offLng = Math.abs(mapRegion.longitude - longitude);
    return offLat > mapRegion.latitudeDelta * 0.15 || offLng > mapRegion.longitudeDelta * 0.15;
  }, [latitude, longitude, mapRegion]);

  const recenterAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(recenterAnim, {
      toValue: showRecenter ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [showRecenter, recenterAnim]);

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
      const expansionZoom = getExpansionZoom(clusterId);
      const currentZoom = Math.log2(360 / mapRegion.latitudeDelta);
      // Always zoom in at least 2 levels past expansion zoom AND current zoom
      const targetZoom = Math.max(expansionZoom, currentZoom) + 2;
      const delta = 360 / 2 ** targetZoom;
      mapRef.current?.animateToRegion(lat, lng, delta);
    },
    [getExpansionZoom, mapRegion.latitudeDelta],
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
      placeholderData: keepPreviousData,
    },
  );

  // Derive status from auth store (optimistic) with query fallback
  const profile = useAuthStore((s) => s.profile);

  // One-time guided first-tap overlay (v4, BLI-292). Shown to a fresh, complete
  // (non-ghost) profile on their first map visit, then never again.
  const firstMapHintSeen = useOnboardingStore((s) => s.firstMapHintSeen);
  const markFirstMapHintSeen = useOnboardingStore((s) => s.markFirstMapHintSeen);
  const showFirstTapHint = !firstMapHintSeen && !!profile?.isComplete;
  const myStatus = useMemo(() => {
    if (profile?.currentStatus) {
      return { text: profile.currentStatus };
    }
    return listMyStatus ?? null;
  }, [profile?.currentStatus, listMyStatus]);

  // Ambient status feedback (BLI-294): how many nearby loaded people match my status.
  const nearbyStatusMatchCount = useMemo(() => listUsers.filter((u) => u.hasStatusMatch).length, [listUsers]);

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

  // Coalesce WS-triggered refetches — backend fires bursts (e.g. dozens of analysisReady
  // after login) that without debounce fanned out into 40-60 refetches in 10s and hit the
  // profiles.getNearby rate limit.
  const debouncedRefetchList = useDebouncedCallback(refetchList, 2000);
  const debouncedRefetchMarkers = useDebouncedCallback(refetchMarkers, 2000);

  const wsHandler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "nearbyChanged" || msg.type === "analysisReady") {
        debouncedRefetchList();
      }
      if (msg.type === "statusMatchesReady") {
        debouncedRefetchList();
        debouncedRefetchMarkers();
      }
      if (msg.type === "analysisFailed") {
        const inList = listUsersRef.current.some((u) => u.profile.userId === msg.aboutUserId);
        if (inList) ensureAnalysisMutate({ userId: msg.aboutUserId });
      }
    },
    [debouncedRefetchList, debouncedRefetchMarkers, ensureAnalysisMutate],
  );
  useWebSocket(wsHandler);
  useRetryStatusMatchingOnFailure();

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  // Build combined list data for FlatList
  type NearbyGroup = NonNullable<typeof nearbyGroups>[number];
  type ListUser = (typeof listUsers)[number];
  type ListItem =
    | { type: "userHeader"; count: number; viewportCount: number; qualityCount: number }
    | { type: "user"; data: ListUser }
    | { type: "groupHeader"; count: number }
    | { type: "group"; data: NearbyGroup }
    | { type: "groupsEmpty" };

  const uniqueListUsers = useMemo(() => {
    const seen = new Set<string>();
    return listUsers.filter((u) => {
      if (seen.has(u.profile.id)) return false;
      seen.add(u.profile.id);
      return true;
    });
  }, [listUsers]);

  const listItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    const groups = nearbyGroups ?? [];

    if (nearbyFilter === "people") {
      for (const u of uniqueListUsers) {
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
      if (uniqueListUsers.length > 0) {
        items.push({ type: "userHeader", count: totalUserCount, viewportCount: totalCount, qualityCount });
        for (const u of uniqueListUsers) {
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
  }, [nearbyFilter, uniqueListUsers, nearbyGroups, totalUserCount, totalCount, qualityCount]);

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

  // Permission denied
  if (permissionStatus === "denied") {
    return (
      <View style={styles.centered}>
        <IconPin size={48} color={colors.muted} />
        <Text style={styles.emptyTitle}>
          <Trans>Brak dostępu do lokalizacji</Trans>
        </Text>
        <Text style={styles.emptyText}>
          <Trans>Włącz lokalizację w ustawieniach, aby zobaczyć osoby w pobliżu</Trans>
        </Text>
        <View style={{ marginTop: spacing.section }}>
          <Button title={t`Spróbuj ponownie`} variant="accent" onPress={requestLocationPermission} />
        </View>
      </View>
    );
  }

  // Loading location — only shown when we have NO coordinates at all. Returning
  // users get the cached GPS fix from locationStore (persisted via SecureStore)
  // and render the map immediately, while a fresh fix comes in from
  // `Location.watchPositionAsync` in the background. Falls through to the
  // splash on fresh installs and on the narrow window between permission-
  // granted and the first GPS fix.
  if (!latitude || !longitude) {
    return <SplashHold />;
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    switch (item.type) {
      case "userHeader": {
        const { count, viewportCount, qualityCount: headerQualityCount } = item;
        return (
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>
              {headerQualityCount > 0
                ? `${headerQualityCount} ${t`Z DOPASOWANIEM`} ${MATCH_QUALITY_THRESHOLD}%+`
                : showAllNearby || viewportCount >= count
                  ? `${count} ${count === 1 ? t`OSOBA` : t`OSÓB`} ${t`W POBLIŻU`}`
                  : `${viewportCount} ${t`Z`} ${count} ${t`OSÓB W POBLIŻU`}`}
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
            currentStatus={u.profile.currentStatus}
            bioEssence={u.profile.bioEssence}
            hasStatusMatch={u.hasStatusMatch}
            lastActiveAt={u.profile.lastActiveAt}
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
              {item.count} {item.count === 1 ? t`GRUPA` : t`GRUP`} <Trans>W POBLIŻU</Trans>
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
            <Text style={styles.emptyListText}>
              {isOutsideRadius
                ? t`Jesteś poza zasięgiem — pokazujemy grupy tylko w pobliżu Twojej lokalizacji`
                : t`Tutaj jeszcze cicho. Możesz być pierwszy.`}
            </Text>
            <Pressable style={styles.returnButton} onPress={handleReturnToMyLocation}>
              <IconPin size={14} color={colors.accent} />
              <Text style={styles.returnButtonText}>
                <Trans>Wróć do mojej lokalizacji</Trans>
              </Text>
            </Pressable>
            <Pressable style={styles.returnButton} onPress={() => router.push("/create-group")}>
              <IconPlus size={14} color={colors.accent} />
              <Text style={styles.returnButtonText}>
                <Trans>Utwórz grupę</Trans>
              </Text>
            </Pressable>
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
      {/* Full-screen map */}
      <View style={StyleSheet.absoluteFill}>
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

      {/* Bottom-right floating action column — stacks bottom-up. The primary "+" sits
          at the bottom (thumb-closest); secondary actions (recenter) stack above it.
          Add more buttons by inserting another <Pressable style={styles.fab}> here. */}
      <View style={[styles.fabColumn, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
        <Animated.View
          pointerEvents={showRecenter ? "auto" : "none"}
          style={{
            opacity: recenterAnim,
            transform: [{ scale: recenterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          }}
        >
          <Pressable
            testID="map-recenter-button"
            style={styles.fab}
            onPressIn={hapticTap}
            onPress={handleReturnToMyLocation}
          >
            <IconNavigate size={20} color={isOutsideRadius ? colors.accent : colors.ink} />
          </Pressable>
        </Animated.View>
        {/* Filters — moved out of the top bar; sits between recenter and the primary +. */}
        <Pressable
          style={[styles.fab, hasActiveFilters && styles.fabActive]}
          onPressIn={hapticTap}
          onPress={() => router.push("/filters" as never)}
        >
          <IconFilter size={20} color={hasActiveFilters ? colors.accent : colors.ink} />
          {hasActiveFilters && <View style={styles.filterDot} />}
        </Pressable>
        {/* Primary action — opens the status sheet (prefilled when a status is already set).
            Carries the `set-status-pill` testID inherited from the removed top status pill. */}
        <Pressable
          testID="set-status-pill"
          style={[styles.fab, styles.fabPrimary]}
          onPressIn={hapticTap}
          onPress={() => {
            if (myStatus) {
              router.push({
                pathname: "/set-status" as never,
                params: {
                  prefill: myStatus.text,
                  prefillCategories: profile?.statusCategories?.join(",") ?? undefined,
                },
              });
            } else {
              router.push("/set-status" as never);
            }
          }}
        >
          <IconPlus size={24} color={colors.bg} />
        </Pressable>
      </View>

      {/* Ambient status-feedback line — sits just above the count pill (BLI-294) */}
      {!listOpen && (myStatus || nearbyStatusMatchCount > 0) && (
        <View style={[styles.ambientLineWrap, { bottom: insets.bottom + 74 }]} pointerEvents="none">
          <Text style={styles.ambientLineText} numberOfLines={1}>
            {nearbyStatusMatchCount > 0 ? (
              <Trans>✨ Ktoś w pobliżu pasuje do Twojego statusu</Trans>
            ) : (
              <Trans>🔍 Szukam za Ciebie…</Trans>
            )}
          </Text>
        </View>
      )}

      {/* Floating count pill — opens the list sheet */}
      {!listOpen && (
        <View style={[styles.countPillWrap, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
          <Pressable
            testID="nearby-count-pill"
            style={styles.countPill}
            onPressIn={hapticTap}
            onPress={() => setListOpen(true)}
            disabled={totalCount === 0}
          >
            {totalCount === 0 ? (
              <View style={styles.pillAvatarWrap}>
                <View style={styles.pillEmptyIcon}>
                  <IconSearch size={15} color={colors.muted} />
                </View>
              </View>
            ) : uniqueListUsers.length > 0 ? (
              <View style={styles.pillStack}>
                {uniqueListUsers.slice(0, 3).map((u, i) => (
                  <View key={u.profile.id} style={[styles.pillAvatarWrap, i > 0 && { marginLeft: -12 }]}>
                    <Avatar uri={u.profile.avatarUrl} name={u.profile.displayName} size={28} />
                  </View>
                ))}
              </View>
            ) : null}
            {totalCount === 0 ? (
              <Text style={styles.countPillText}>
                <Trans>Nikogo w pobliżu</Trans>
              </Text>
            ) : qualityCount > 0 ? (
              <View style={styles.countPillTextCol}>
                <Text style={styles.countPillLine1} numberOfLines={1}>
                  {qualityCount} {qualityCount === 1 ? t`osoba` : t`osób`} <Trans>z dopasowaniem</Trans>
                </Text>
                <Text style={styles.countPillLine2} numberOfLines={1}>
                  <Trans>{MATCH_QUALITY_THRESHOLD}%+ w pobliżu</Trans>
                </Text>
              </View>
            ) : (
              <Text style={styles.countPillText}>
                <Trans>Sprawdź kto jest w pobliżu</Trans>
              </Text>
            )}
            {totalCount > 0 && (
              <View style={styles.chevUp}>
                <IconChevronRight size={16} color={colors.muted} />
              </View>
            )}
          </Pressable>
        </View>
      )}

      {/* Backdrop */}
      <Animated.View
        pointerEvents={listOpen ? "auto" : "none"}
        style={[
          styles.sheetBackdrop,
          { opacity: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }) },
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={() => setListOpen(false)} />
      </Animated.View>

      {/* List sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            height: LIST_SHEET_HEIGHT,
            transform: [
              { translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, LIST_SHEET_HEIGHT] }) },
            ],
          },
        ]}
      >
        <Pressable style={styles.sheetGrabHit} onPress={() => setListOpen(false)}>
          <View style={styles.sheetGrab} />
        </Pressable>

        {/* filter chips */}
        <View style={styles.sheetChips}>
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

        {isLoadingList && !listUsers.length ? (
          <ListShimmer count={4} />
        ) : (
          <FlatList
            data={listItems}
            keyExtractor={getItemKey}
            renderItem={renderItem}
            ListEmptyComponent={
              nearbyFilter !== "groups" ? (
                <View style={styles.emptyList}>
                  <Text style={styles.emptyListText}>
                    {isOutsideRadius
                      ? t`Jesteś poza zasięgiem — pokazujemy ${nearbyFilter === "people" ? t`osoby` : t`osoby i grupy`} tylko w pobliżu Twojej lokalizacji`
                      : t`Cisza. Może właściwa osoba jest w drodze.`}
                  </Text>
                  <Pressable style={styles.returnButton} onPress={handleReturnToMyLocation}>
                    <IconPin size={14} color={colors.accent} />
                    <Text style={styles.returnButtonText}>
                      <Trans>Wróć do mojej lokalizacji</Trans>
                    </Text>
                  </Pressable>
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
      </Animated.View>

      {/* One-time guided first-tap overlay (v4, BLI-292) */}
      {showFirstTapHint && !listOpen && <FirstTapHint onDismiss={markFirstMapHintSeen} />}
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
    textAlign: "center",
    paddingHorizontal: spacing.section,
  },
  returnButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.column,
    paddingVertical: spacing.tight,
    paddingHorizontal: spacing.column,
  },
  returnButtonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.accent,
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

  // --- map-first layout: full-screen map, floating controls, bottom-sheet list ---
  fabActive: { borderWidth: 1, borderColor: colors.accent },
  fabColumn: {
    position: "absolute",
    right: spacing.column,
    alignItems: "center",
    gap: spacing.gutter,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3a2e1e",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 5,
  },
  fabPrimary: {
    backgroundColor: colors.accent,
  },
  ambientLineWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  ambientLineText: {
    fontSize: 12,
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: spacing.gutter,
    paddingVertical: 4,
    textShadowColor: "rgba(255,255,255,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  countPillWrap: {
    position: "absolute",
    left: spacing.column,
    // Reserve room for the bottom-right FAB column so the left-aligned pill never slides under it.
    right: spacing.column + FAB_SIZE + spacing.gutter,
    alignItems: "flex-start",
  },
  countPill: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: 28,
    paddingVertical: 9,
    paddingLeft: 10,
    paddingRight: 16,
    shadowColor: "#3a2e1e",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  pillStack: { flexDirection: "row" },
  pillAvatarWrap: { borderWidth: 2, borderColor: colors.bg, borderRadius: 16 },
  pillEmptyIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1E9DB",
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: { fontSize: 14, fontFamily: fonts.sans, color: colors.ink },
  countPillNum: { fontFamily: fonts.sansSemiBold, color: colors.ink },
  countPillTextCol: { flexShrink: 1 },
  countPillLine1: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: colors.ink },
  countPillLine2: { fontSize: 11, fontFamily: fonts.sans, color: colors.muted, marginTop: 1 },
  chevUp: { transform: [{ rotate: "-90deg" }] },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: "#3a2e1e",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  sheetGrabHit: { paddingTop: 10, paddingBottom: 6, alignItems: "center" },
  sheetGrab: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.rule },
  sheetChips: {
    flexDirection: "row",
    gap: spacing.tight,
    paddingHorizontal: spacing.column,
    paddingTop: spacing.tick,
    paddingBottom: spacing.tight,
  },
});
