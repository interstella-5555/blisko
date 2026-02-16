import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { router } from 'expo-router';
import { trpc } from '../../src/lib/trpc';
import { useWavesStore } from '../../src/stores/wavesStore';
import { WaveTabBar, WaveTab } from '../../src/components/waves/WaveTabBar';
import { EmptyWavesState } from '../../src/components/waves/EmptyWavesState';
import { UserRow } from '../../src/components/nearby/UserRow';
import { colors } from '../../src/theme';

export default function WavesScreen() {
  const [activeTab, setActiveTab] = useState<WaveTab>('received');
  const [refreshing, setRefreshing] = useState(false);

  // tRPC queries for pull-to-refresh (hydration happens in _layout.tsx)
  const { refetch: refetchReceived } = trpc.waves.getReceived.useQuery();
  const { refetch: refetchSent } = trpc.waves.getSent.useQuery();

  // Read from waves store (populated by _layout.tsx hydration + WS)
  const receivedWaves = useWavesStore((s) => s.received);
  const sentWaves = useWavesStore((s) => s.sent);
  const hydrated = useWavesStore((s) => s._hydrated);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchReceived(), refetchSent()]);
    setRefreshing(false);
  }, [refetchReceived, refetchSent]);

  const pendingReceivedCount = receivedWaves.filter(
    (w) => w.wave.status === 'pending'
  ).length;
  const pendingSentCount = sentWaves.filter(
    (w) => w.wave.status === 'pending'
  ).length;

  const filteredSent = useMemo(
    () => sentWaves.filter((w) => w.wave.status !== 'declined'),
    [sentWaves]
  );

  const renderReceivedList = () => (
    <FlatList
      data={receivedWaves}
      keyExtractor={(item) => item.wave.id}
      renderItem={({ item }) => (
        <UserRow
          userId={item.fromProfile.userId}
          displayName={item.fromProfile.displayName}
          avatarUrl={item.fromProfile.avatarUrl}
          bio={item.fromProfile.bio}
          status={item.wave.status === 'accepted' ? 'friend' : 'incoming'}
          timestamp={item.wave.createdAt}
          onPress={() => router.push({
            pathname: '/(modals)/user/[userId]',
            params: {
              userId: item.fromProfile.userId,
              displayName: item.fromProfile.displayName,
              avatarUrl: item.fromProfile.avatarUrl ?? '',
            },
          })}
        />
      )}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        hydrated && !refreshing ? <EmptyWavesState type="received" /> : null
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
      }
    />
  );

  const renderSentList = () => (
    <FlatList
      data={filteredSent}
      keyExtractor={(item) => item.wave.id}
      renderItem={({ item }) => (
        <UserRow
          userId={item.toProfile.userId}
          displayName={item.toProfile.displayName}
          avatarUrl={item.toProfile.avatarUrl}
          bio={item.toProfile.bio}
          status={item.wave.status === 'accepted' ? 'friend' : 'waved'}
          timestamp={item.wave.createdAt}
          onPress={() => router.push({
            pathname: '/(modals)/user/[userId]',
            params: {
              userId: item.toProfile.userId,
              displayName: item.toProfile.displayName,
              avatarUrl: item.toProfile.avatarUrl ?? '',
            },
          })}
        />
      )}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        hydrated && !refreshing ? <EmptyWavesState type="sent" /> : null
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
      }
    />
  );

  return (
    <View testID="waves-screen" style={styles.container}>
      <WaveTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        receivedCount={pendingReceivedCount}
        sentCount={pendingSentCount}
      />
      {activeTab === 'received' ? renderReceivedList() : renderSentList()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    paddingBottom: 40,
    flexGrow: 1,
  },
});
