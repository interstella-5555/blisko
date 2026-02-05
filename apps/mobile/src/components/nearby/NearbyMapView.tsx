import { useRef, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { GridClusterMarker, type ClusterUser } from './GridClusterMarker';
import { UserListSheet, type SheetUser } from './UserListSheet';

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
}

interface NearbyMapViewProps {
  users: MapUser[];
  userLatitude: number;
  userLongitude: number;
  onWave: (userId: string, displayName: string) => void;
  wavedUsers: Set<string>;
  wavingAt: string | null;
}

interface GridCluster {
  gridId: string;
  gridLat: number;
  gridLng: number;
  users: MapUser[];
}

export function NearbyMapView({
  users,
  userLatitude,
  userLongitude,
  onWave,
  wavedUsers,
  wavingAt,
}: NearbyMapViewProps) {
  const mapRef = useRef<MapView>(null);
  const [selectedCluster, setSelectedCluster] = useState<GridCluster | null>(null);

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

  const handleClusterPress = (cluster: GridCluster) => {
    setSelectedCluster(cluster);
  };

  const sheetUsers: SheetUser[] = useMemo(() => {
    if (!selectedCluster) return [];
    return selectedCluster.users.map((u) => ({
      id: u.profile.id,
      userId: u.profile.userId,
      displayName: u.profile.displayName,
      bio: u.profile.bio,
      lookingFor: u.profile.lookingFor,
      avatarUrl: u.profile.avatarUrl,
      distance: u.distance,
    }));
  }, [selectedCluster]);

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
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: userLatitude,
          longitude: userLongitude,
          latitudeDelta: 0.05, // ~5km view
          longitudeDelta: 0.05,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {clusters.map((cluster) => (
          <Marker
            key={cluster.gridId}
            coordinate={{
              latitude: cluster.gridLat,
              longitude: cluster.gridLng,
            }}
            onPress={() => handleClusterPress(cluster)}
          >
            <GridClusterMarker users={clusterUsers(cluster)} />
          </Marker>
        ))}
      </MapView>

      <UserListSheet
        visible={selectedCluster !== null}
        users={sheetUsers}
        onClose={() => setSelectedCluster(null)}
        onWave={onWave}
        wavedUsers={wavedUsers}
        wavingAt={wavingAt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
