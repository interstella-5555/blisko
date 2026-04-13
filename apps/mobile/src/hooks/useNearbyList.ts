import { NEARBY_PAGE_SIZE, VIEWPORT_DEBOUNCE_MS } from "@repo/shared";
import { keepPreviousData } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Region } from "react-native-maps";
import { trpc } from "@/lib/trpc";
import { useLocationStore } from "@/stores/locationStore";
import { usePreferencesStore } from "@/stores/preferencesStore";

export function useNearbyList() {
  const { latitude, longitude } = useLocationStore();
  const { nearbyRadiusMeters, photoOnly, showAllNearby } = usePreferencesStore();
  const [bbox, setBbox] = useState<{ south: number; north: number; west: number; east: number } | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    trpc.profiles.getNearbyUsersForMap.useInfiniteQuery(
      {
        latitude: latitude!,
        longitude: longitude!,
        radiusMeters: nearbyRadiusMeters,
        limit: NEARBY_PAGE_SIZE,
        photoOnly: photoOnly || undefined,
        bbox: showAllNearby ? undefined : bbox,
      },
      {
        enabled: !!latitude && !!longitude,
        staleTime: 30_000,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    );

  const users = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.users);
  }, [data]);

  const totalCount = data?.pages[0]?.totalCount ?? 0;
  const myStatus = data?.pages[0]?.myStatus ?? null;

  const onRegionChange = useCallback(
    (region: Region) => {
      if (showAllNearby) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setBbox({
          south: region.latitude - region.latitudeDelta / 2,
          north: region.latitude + region.latitudeDelta / 2,
          west: region.longitude - region.longitudeDelta / 2,
          east: region.longitude + region.longitudeDelta / 2,
        });
      }, VIEWPORT_DEBOUNCE_MS);
    },
    [showAllNearby],
  );

  return {
    users,
    totalCount,
    myStatus,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    refetch,
    onRegionChange,
    showAllNearby,
  };
}
