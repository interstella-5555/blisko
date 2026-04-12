import { useMemo } from "react";
import type { Region } from "react-native-maps";
import Supercluster from "supercluster";

export interface MarkerPoint {
  userId?: string;
  groupId?: string;
  type: "user" | "group";
  avatar: string | null;
  name?: string | null;
  statusMatch: boolean;
  members?: number;
}

type SC = Supercluster<MarkerPoint, { statusMatchCount: number }>;

const SUPERCLUSTER_OPTIONS: Supercluster.Options<MarkerPoint, { statusMatchCount: number }> = {
  radius: 60,
  maxZoom: 16,
  minPoints: 2,
  map: (props) => ({ statusMatchCount: props.statusMatch ? 1 : 0 }),
  reduce: (acc, props) => {
    acc.statusMatchCount += props.statusMatchCount;
  },
};

export function getZoomLevel(region: Region): number {
  return Math.round(Math.log(360 / region.longitudeDelta) / Math.LN2);
}

export function regionToBBox(region: Region): GeoJSON.BBox {
  return [
    region.longitude - region.longitudeDelta / 2,
    region.latitude - region.latitudeDelta / 2,
    region.longitude + region.longitudeDelta / 2,
    region.latitude + region.latitudeDelta / 2,
  ];
}

export function useSupercluster(points: GeoJSON.Feature<GeoJSON.Point, MarkerPoint>[]) {
  const index = useMemo(() => {
    const sc = new Supercluster(SUPERCLUSTER_OPTIONS) as SC;
    sc.load(points);
    return sc;
  }, [points]);

  return {
    index,
    getClusters: (region: Region) => {
      const bbox = regionToBBox(region);
      const zoom = getZoomLevel(region);
      return index.getClusters(bbox, zoom);
    },
    getExpansionZoom: (clusterId: number) => {
      return index.getClusterExpansionZoom(clusterId);
    },
  };
}
