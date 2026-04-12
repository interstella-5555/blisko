import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import type Supercluster from "supercluster";
import type { MarkerPoint } from "@/hooks/useSupercluster";
import { GridClusterMarker } from "./GridClusterMarker";
import { GroupMarker } from "./GroupMarker";

export interface NearbyMapRef {
  animateToRegion: (lat: number, lng: number, zoom?: number) => void;
}

type ClusterOrPoint =
  | Supercluster.ClusterFeature<{ statusMatchCount: number }>
  | Supercluster.PointFeature<MarkerPoint>;

interface NearbyMapViewProps {
  clusters: ClusterOrPoint[];
  userLatitude: number;
  userLongitude: number;
  onClusterPress?: (clusterId: number, latitude: number, longitude: number) => void;
  onUserPress?: (userId: string) => void;
  onGroupPress?: (groupId: string) => void;
  onRegionChangeComplete?: (region: Region) => void;
}

export const NearbyMapView = forwardRef<NearbyMapRef, NearbyMapViewProps>(
  (
    { clusters, userLatitude, userLongitude, onClusterPress, onUserPress, onGroupPress, onRegionChangeComplete },
    ref,
  ) => {
    const mapRef = useRef<MapView>(null);

    useImperativeHandle(ref, () => ({
      animateToRegion: (lat: number, lng: number, zoom?: number) => {
        // Convert zoom level to lat/lng deltas (inverse of getZoomLevel)
        const delta = zoom != null ? 360 / 2 ** zoom : 0.02;
        mapRef.current?.animateToRegion(
          {
            latitude: lat,
            longitude: lng,
            latitudeDelta: delta,
            longitudeDelta: delta,
          },
          300,
        );
      },
    }));

    return (
      <View testID="nearby-map-container" style={styles.container}>
        <MapView
          testID="nearby-map"
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: userLatitude,
            longitude: userLongitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation
          showsMyLocationButton
          onRegionChangeComplete={onRegionChangeComplete}
        >
          {clusters.map((item) => {
            const [lng, lat] = item.geometry.coordinates;
            const props = item.properties;

            if ("cluster" in props && props.cluster) {
              const cp = props as Supercluster.ClusterProperties & { statusMatchCount: number };
              return (
                <Marker
                  key={`cluster-${cp.cluster_id}`}
                  coordinate={{ latitude: lat, longitude: lng }}
                  onPress={() => onClusterPress?.(cp.cluster_id, lat, lng)}
                >
                  <GridClusterMarker count={cp.point_count} highlighted={cp.statusMatchCount >= 1} />
                </Marker>
              );
            }

            const leafProps = props as MarkerPoint;

            if (leafProps.type === "group") {
              return (
                <Marker
                  key={`group-${leafProps.groupId}`}
                  coordinate={{ latitude: lat, longitude: lng }}
                  onPress={() => onGroupPress?.(leafProps.groupId!)}
                >
                  <GroupMarker
                    name={leafProps.name ?? null}
                    avatarUrl={leafProps.avatar}
                    nearbyCount={leafProps.members ?? 0}
                  />
                </Marker>
              );
            }

            // type === "user"
            return (
              <Marker
                key={`user-${leafProps.userId}`}
                coordinate={{ latitude: lat, longitude: lng }}
                onPress={() => onUserPress?.(leafProps.userId!)}
                tracksViewChanges
              >
                <GridClusterMarker
                  avatarUrl={leafProps.avatar}
                  displayName={leafProps.name}
                  highlighted={leafProps.statusMatch}
                />
              </Marker>
            );
          })}
        </MapView>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
