import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { trpc } from '../../src/lib/trpc';
import { useWebSocket, sendWsMessage } from '../../src/lib/ws';
import { WaveTabBar, WaveTab } from '../../src/components/waves/WaveTabBar';
import { EmptyWavesState } from '../../src/components/waves/EmptyWavesState';
import { WaveCard } from '../../src/components/waves/WaveCard';
import { colors, spacing } from '../../src/theme';

type WaveStatus = 'pending' | 'accepted' | 'declined';

export default function WavesScreen() {
  const [activeTab, setActiveTab] = useState<WaveTab>('received');
  const [refreshing, setRefreshing] = useState(false);
  const [respondingTo, setRespondingTo] = useState<{
    waveId: string;
    action: 'accept' | 'decline';
  } | null>(null);

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

  const respondMutation = trpc.waves.respond.useMutation({
    onSuccess: (data, variables) => {
      utils.waves.getReceived.invalidate();
      utils.waves.getSent.invalidate();

      if (variables.accept && data.conversationId) {
        sendWsMessage({ type: 'subscribe', conversationId: data.conversationId });
        utils.messages.getConversations.refetch();
      }

      if (variables.accept) {
        Alert.alert(
          'Zaakceptowano!',
          'Możecie teraz rozmawiać w zakładce Czaty',
          [{ text: 'OK' }]
        );
      }
    },
    onError: (error) => {
      Alert.alert('Błąd', error.message || 'Nie udało się odpowiedzieć na zaczepienie');
    },
    onSettled: () => {
      setRespondingTo(null);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchReceived(), refetchSent()]);
    setRefreshing(false);
  }, [refetchReceived, refetchSent]);

  const handleAccept = (waveId: string) => {
    setRespondingTo({ waveId, action: 'accept' });
    respondMutation.mutate({ waveId, accept: true });
  };

  const handleDecline = (waveId: string) => {
    Alert.alert(
      'Odrzuć zaczepienie',
      'Czy na pewno chcesz odrzucić to zaczepienie?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Odrzuć',
          style: 'destructive',
          onPress: () => {
            setRespondingTo({ waveId, action: 'decline' });
            respondMutation.mutate({ waveId, accept: false });
          },
        },
      ]
    );
  };

  const pendingReceivedCount = receivedWaves?.length ?? 0;
  const pendingSentCount =
    sentWaves?.filter((w) => w.wave.status === 'pending').length ?? 0;

  const isLoading = activeTab === 'received' ? isLoadingReceived : isLoadingSent;

  const renderReceivedList = () => (
    <FlatList
      data={receivedWaves || []}
      keyExtractor={(item) => item.wave.id}
      renderItem={({ item }) => (
        <WaveCard
          wave={{
            ...item.wave,
            status: item.wave.status as WaveStatus,
          }}
          profile={item.fromProfile}
          type="received"
          onAccept={() => handleAccept(item.wave.id)}
          onDecline={() => handleDecline(item.wave.id)}
          isAccepting={
            respondingTo?.waveId === item.wave.id &&
            respondingTo?.action === 'accept'
          }
          isDeclining={
            respondingTo?.waveId === item.wave.id &&
            respondingTo?.action === 'decline'
          }
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
      data={sentWaves || []}
      keyExtractor={(item) => item.wave.id}
      renderItem={({ item }) => (
        <WaveCard
          wave={{
            ...item.wave,
            status: item.wave.status as WaveStatus,
          }}
          profile={item.toProfile}
          type="sent"
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
    padding: spacing.column,
    flexGrow: 1,
  },
});
