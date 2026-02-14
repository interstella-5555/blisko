import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useState, useCallback, useRef, useMemo } from 'react';
import { router } from 'expo-router';
import { trpc } from '../../src/lib/trpc';
import { useWebSocket } from '../../src/lib/ws';
import { WaveTabBar, WaveTab } from '../../src/components/waves/WaveTabBar';
import { EmptyWavesState } from '../../src/components/waves/EmptyWavesState';
import { UserRow } from '../../src/components/nearby/UserRow';
import { colors } from '../../src/theme';

export default function WavesScreen() {
  const [activeTab, setActiveTab] = useState<WaveTab>('received');
  const [refreshing, setRefreshing] = useState(false);

  const utils = trpc.useUtils();
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  // WebSocket: update wave lists on real-time events
  const wsHandler = useCallback(
    (msg: any) => {
      if (msg.type === 'newWave' || msg.type === 'waveResponded') {
        utilsRef.current.waves.getReceived.refetch();
        utilsRef.current.waves.getSent.refetch();
      }
    },
    []
  );
  useWebSocket(wsHandler);

  const {
    data: receivedWaves,
    isLoading: isLoadingReceived,
    refetch: refetchReceived,
  } = trpc.waves.getReceived.useQuery();

  const {
    data: sentWaves,
    isLoading: isLoadingSent,
    refetch: refetchSent,
  } = trpc.waves.getSent.useQuery();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchReceived(), refetchSent()]);
    setRefreshing(false);
  }, [refetchReceived, refetchSent]);

  const pendingReceivedCount = receivedWaves?.length ?? 0;
  const pendingSentCount =
    sentWaves?.filter((w) => w.wave.status === 'pending').length ?? 0;

  const filteredSent = useMemo(
    () => sentWaves?.filter((w) => w.wave.status !== 'declined') ?? [],
    [sentWaves]
  );

  const isLoading = activeTab === 'received' ? isLoadingReceived : isLoadingSent;

  const renderReceivedList = () => (
    <FlatList
      data={receivedWaves || []}
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
        !isLoading && !refreshing ? <EmptyWavesState type="received" /> : null
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
        !isLoading && !refreshing ? <EmptyWavesState type="sent" /> : null
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
