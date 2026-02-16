import { create } from 'zustand';

export type WaveStatus =
  | { type: 'sent'; waveId: string }
  | { type: 'received'; waveId: string }
  | { type: 'connected' };

export interface WaveEntry {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  createdAt: string;
}

export interface ReceivedWaveEntry {
  wave: WaveEntry;
  fromProfile: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
  };
}

export interface SentWaveEntry {
  wave: WaveEntry;
  toProfile: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
  };
}

interface WavesStore {
  received: ReceivedWaveEntry[];
  sent: SentWaveEntry[];
  waveStatusByUserId: Map<string, WaveStatus>;
  _hydrated: boolean;

  setReceived(waves: ReceivedWaveEntry[]): void;
  setSent(waves: SentWaveEntry[]): void;
  addReceived(
    wave: WaveEntry,
    fromProfile: { displayName: string; avatarUrl: string | null },
  ): void;
  addSent(
    wave: WaveEntry,
    toProfile?: Partial<SentWaveEntry['toProfile']>,
  ): void;
  removeSent(waveId: string): void;
  reset(): void;
  updateStatus(
    waveId: string,
    accepted: boolean,
    statusOverride?: string,
  ): void;
}

function computeStatusMap(
  sent: SentWaveEntry[],
  received: ReceivedWaveEntry[],
): Map<string, WaveStatus> {
  const map = new Map<string, WaveStatus>();

  for (const w of sent) {
    if (w.wave.status === 'accepted') {
      map.set(w.wave.toUserId, { type: 'connected' });
    } else if (w.wave.status === 'pending') {
      map.set(w.wave.toUserId, { type: 'sent', waveId: w.wave.id });
    }
  }

  for (const w of received) {
    if (w.wave.status === 'accepted') {
      map.set(w.wave.fromUserId, { type: 'connected' });
    } else if (w.wave.status === 'pending' && !map.has(w.wave.fromUserId)) {
      map.set(w.wave.fromUserId, { type: 'received', waveId: w.wave.id });
    }
  }

  return map;
}

export const useWavesStore = create<WavesStore>((set, get) => ({
  received: [],
  sent: [],
  waveStatusByUserId: new Map(),
  _hydrated: false,

  setReceived(waves) {
    set((state) => {
      const received = waves;
      const waveStatusByUserId = computeStatusMap(state.sent, received);
      return { received, waveStatusByUserId, _hydrated: true };
    });
  },

  setSent(waves) {
    set((state) => {
      const sent = waves;
      const waveStatusByUserId = computeStatusMap(sent, state.received);
      return { sent, waveStatusByUserId, _hydrated: true };
    });
  },

  addReceived(wave, fromProfile) {
    set((state) => {
      // Dedup
      if (state.received.some((r) => r.wave.id === wave.id)) return state;
      const received = [
        {
          wave,
          fromProfile: {
            userId: wave.fromUserId,
            displayName: fromProfile.displayName,
            avatarUrl: fromProfile.avatarUrl,
            bio: null,
          },
        },
        ...state.received,
      ];
      const waveStatusByUserId = computeStatusMap(state.sent, received);
      return { received, waveStatusByUserId };
    });
  },

  addSent(wave, toProfile) {
    set((state) => {
      // Dedup
      if (state.sent.some((s) => s.wave.id === wave.id)) return state;
      const sent = [
        {
          wave,
          toProfile: {
            userId: wave.toUserId,
            displayName: toProfile?.displayName ?? '',
            avatarUrl: toProfile?.avatarUrl ?? null,
            bio: toProfile?.bio ?? null,
          },
        },
        ...state.sent,
      ];
      const waveStatusByUserId = computeStatusMap(sent, state.received);
      return { sent, waveStatusByUserId };
    });
  },

  removeSent(waveId) {
    set((state) => {
      const sent = state.sent.filter((s) => s.wave.id !== waveId);
      const waveStatusByUserId = computeStatusMap(sent, state.received);
      return { sent, waveStatusByUserId };
    });
  },

  reset() {
    set({ received: [], sent: [], waveStatusByUserId: new Map(), _hydrated: false });
  },

  updateStatus(waveId, accepted, statusOverride) {
    set((state) => {
      const newStatus = statusOverride ?? (accepted ? 'accepted' : 'declined');

      const sent = state.sent.map((s) =>
        s.wave.id === waveId ? { ...s, wave: { ...s.wave, status: newStatus } } : s,
      );
      const received = state.received.map((r) =>
        r.wave.id === waveId ? { ...r, wave: { ...r.wave, status: newStatus } } : r,
      );

      const waveStatusByUserId = computeStatusMap(sent, received);
      return { sent, received, waveStatusByUserId };
    });
  },
}));
