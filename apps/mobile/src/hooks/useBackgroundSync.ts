import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { trpc } from '../lib/trpc';

const MIN_BACKGROUND_MS = 10_000; // 10 seconds
const PERIODIC_SYNC_MS = 60_000; // 60 seconds

export function useBackgroundSync() {
  const utils = trpc.useUtils();
  const backgroundAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reconcile = async () => {
    try {
      // Refetch waves and conversations — these populate stores via their respective screens / _layout hydration
      await Promise.all([
        utils.waves.getReceived.refetch(),
        utils.waves.getSent.refetch(),
        utils.messages.getConversations.refetch(),
      ]);
    } catch {
      // Silently ignore — next sync will retry
    }
  };

  useEffect(() => {
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        backgroundAtRef.current = Date.now();
      } else if (state === 'active' && backgroundAtRef.current) {
        const elapsed = Date.now() - backgroundAtRef.current;
        backgroundAtRef.current = null;
        if (elapsed > MIN_BACKGROUND_MS) {
          reconcile();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Periodic safety net
    intervalRef.current = setInterval(reconcile, PERIODIC_SYNC_MS);

    return () => {
      subscription.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [utils]);
}
