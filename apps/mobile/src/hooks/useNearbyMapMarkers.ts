import { keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocationStore } from "@/stores/locationStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { MarkerPoint } from "./useSupercluster";

const CDN_PREFIX = "https://cdn.blisko.app/";

export function useNearbyMapMarkers() {
  const { latitude, longitude } = useLocationStore();
  const { nearbyRadiusMeters, photoOnly } = usePreferencesStore();

  const { data, isLoading, refetch } = trpc.profiles.getNearbyMapMarkers.useQuery(
    {
      latitude: latitude!,
      longitude: longitude!,
      radiusMeters: nearbyRadiusMeters,
      photoOnly: photoOnly || undefined,
    },
    {
      enabled: !!latitude && !!longitude,
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    },
  );

  const points = useMemo((): GeoJSON.Feature<GeoJSON.Point, MarkerPoint>[] => {
    if (!data) return [];

    const features: GeoJSON.Feature<GeoJSON.Point, MarkerPoint>[] = [];

    for (let i = 0; i < data.users.ids.length; i++) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [data.users.lngs[i], data.users.lats[i]],
        },
        properties: {
          type: "user",
          userId: data.users.ids[i],
          avatar: data.users.avatars[i] ? CDN_PREFIX + data.users.avatars[i] : null,
          statusMatch: data.users.statusMatch[i] === 1,
        },
      });
    }

    for (let i = 0; i < data.groups.ids.length; i++) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [data.groups.lngs[i], data.groups.lats[i]],
        },
        properties: {
          type: "group",
          groupId: data.groups.ids[i],
          avatar: data.groups.avatars[i] ? CDN_PREFIX + data.groups.avatars[i] : null,
          name: data.groups.names[i],
          statusMatch: false,
          members: data.groups.members[i],
        },
      });
    }

    return features;
  }, [data]);

  const totalUserCount = data?.users.ids.length ?? 0;

  return { points, totalUserCount, isLoading, refetch, data };
}
