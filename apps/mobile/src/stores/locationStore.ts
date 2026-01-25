import { create } from 'zustand';

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  lastUpdate: Date | null;
  permissionStatus: 'undetermined' | 'granted' | 'denied';
  setLocation: (latitude: number, longitude: number) => void;
  setPermissionStatus: (status: 'undetermined' | 'granted' | 'denied') => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  latitude: null,
  longitude: null,
  lastUpdate: null,
  permissionStatus: 'undetermined',
  setLocation: (latitude, longitude) =>
    set({ latitude, longitude, lastUpdate: new Date() }),
  setPermissionStatus: (permissionStatus) => set({ permissionStatus }),
}));
