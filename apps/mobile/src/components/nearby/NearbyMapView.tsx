import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { GridClusterMarker, type ClusterUser } from './GridClusterMarker';
import { GroupMarker } from './GroupMarker';

export interface MapUser {
  profile: {
    id: string;
    userId: string;
    displayName: string;
    bio: string;
    lookingFor: string;
    avatarUrl: string | null;
  };
  distance: number;
  gridLat: number;
  gridLng: number;
  gridId: string;
  rankScore: number;
  matchScore: number;
  commonInterests: string[];
  shortSnippet: string | null;
  analysisReady: boolean;
  statusMatch: { reason: string; matchedVia: string } | null;
}

export interface GridCluster {
  gridId: string;
  gridLat: number;
  gridLng: number;
  users: MapUser[];
}

export interface NearbyMapRef {
  animateToRegion: (lat: number, lng: number) => void;
}

export interface MapGroup {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  latitude: number;
  longitude: number;
  nearbyMemberCount: number;
}

interface NearbyMapViewProps {
  users: MapUser[];
  userLatitude: number;
  userLongitude: number;
  onClusterPress?: (cluster: GridCluster) => void;
  highlightedGridId?: string | null;
  groups?: MapGroup[];
  onGroupPress?: (group: MapGroup) => void;
  onRegionChangeComplete?: (region: Region) => void;
}

export const NearbyMapView = forwardRef<NearbyMapRef, NearbyMapViewProps>(
  (
    { users, userLatitude, userLongitude, onClusterPress, highlightedGridId, groups, onGroupPress, onRegionChangeComplete },
    ref
  ) => {
    const mapRef = useRef<MapView>(null);

    useImperativeHandle(ref, () => ({
      animateToRegion: (lat: number, lng: number) => {
        mapRef.current?.animateToRegion(
          {
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          300
        );
      },
    }));

    // Group users by gridId
    const clusters = useMemo(() => {
      const map = new Map<string, GridCluster>();

      for (const user of users) {
        const existing = map.get(user.gridId);
        if (existing) {
          existing.users.push(user);
        } else {
          map.set(user.gridId, {
            gridId: user.gridId,
            gridLat: user.gridLat,
            gridLng: user.gridLng,
            users: [user],
          });
        }
      }

      return Array.from(map.values());
    }, [users]);

    const clusterUsers = (cluster: GridCluster): ClusterUser[] =>
      cluster.users.map((u) => ({
        id: u.profile.id,
        userId: u.profile.userId,
        displayName: u.profile.displayName,
        avatarUrl: u.profile.avatarUrl,
      }));

    return (
      <View style={styles.container}>
        <MapView
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
          {clusters.map((cluster) => (
            <Marker
              key={cluster.gridId}
              coordinate={{
                latitude: cluster.gridLat,
                longitude: cluster.gridLng,
              }}
              onPress={() => onClusterPress?.(cluster)}
            >
              <GridClusterMarker
                users={clusterUsers(cluster)}
                highlighted={cluster.gridId === highlightedGridId}
              />
            </Marker>
          ))}
          {groups?.map((group) => (
            <Marker
              key={`group-${group.id}`}
              coordinate={{ latitude: group.latitude, longitude: group.longitude }}
              onPress={() => onGroupPress?.(group)}
            >
              <GroupMarker
                name={group.name}
                avatarUrl={group.avatarUrl}
                nearbyCount={group.nearbyMemberCount}
              />
            </Marker>
          ))}
        </MapView>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
