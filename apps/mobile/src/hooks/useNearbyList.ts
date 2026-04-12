import { keepPreviousData } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { Region } from "react-native-maps";
import { trpc } from "@/lib/trpc";
import { useLocationStore } from "@/stores/locationStore";
import { usePreferencesStore } from "@/stores/preferencesStore";

export function useNearbyList() {
  const { latitude, longitude } = useLocationStore();
  const { nearbyRadiusMeters, photoOnly } = usePreferencesStore();
  const [showAll, setShowAll] = useState(false);
  const [bbox, setBbox] = useState<{ south: number; north: number; west: number; east: number } | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, refetch, isFetching } = trpc.profiles.getNearbyUsersForMap.useQuery(
    {
      latitude: latitude!,
      longitude: longitude!,
      radiusMeters: nearbyRadiusMeters,
      limit: 50,
      photoOnly: photoOnly || undefined,
      bbox: showAll ? undefined : bbox,
    },
    {
      enabled: !!latitude && !!longitude,
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    },
  );

  const onRegionChange = useCallback(
    (region: Region) => {
      if (showAll) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setBbox({
          south: region.latitude - region.latitudeDelta / 2,
          north: region.latitude + region.latitudeDelta / 2,
          west: region.longitude - region.longitudeDelta / 2,
          east: region.longitude + region.longitudeDelta / 2,
        });
      }, 300);
    },
    [showAll],
  );

  const toggleShowAll = useCallback(() => {
    setShowAll((prev) => !prev);
  }, []);

  const resetToViewport = useCallback(() => {
    setShowAll(false);
  }, []);

  return {
    users: data?.users ?? [],
    totalCount: data?.totalCount ?? 0,
    nextCursor: data?.nextCursor ?? null,
    myStatus: data?.myStatus ?? null,
    isLoading,
    isFetching,
    refetch,
    onRegionChange,
    showAll,
    toggleShowAll,
    resetToViewport,
    viewportUserCount: data?.users.length ?? 0,
  };
}
