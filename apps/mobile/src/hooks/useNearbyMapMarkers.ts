import { keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocationStore } from "@/stores/locationStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { MarkerPoint } from "./useSupercluster";

// Deterministic jitter within grid cell (~200m max) so users in the same
// cell don't stack on the exact same coordinate. Based on userId hash so
// position is stable across renders. Doesn't affect privacy — real coords
// are still grid-snapped, this is visual-only for supercluster separation.
const JITTER_RANGE = 0.002; // ~200m in degrees
function jitter(id: string, axis: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  // Different seed for lat vs lng
  hash = (hash * 17 + axis) | 0;
  return ((hash % 1000) / 1000) * JITTER_RANGE - JITTER_RANGE / 2;
}

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
          coordinates: [
            data.users.lngs[i] + jitter(data.users.ids[i], 0),
            data.users.lats[i] + jitter(data.users.ids[i], 1),
          ],
        },
        properties: {
          type: "user",
          userId: data.users.ids[i],
          name: data.users.names[i] || null,
          avatar: data.users.avatars[i] ? data.users.avatars[i] : null,
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
          avatar: data.groups.avatars[i] ? data.groups.avatars[i] : null,
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
