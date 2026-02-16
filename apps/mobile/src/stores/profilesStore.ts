import { create } from 'zustand';

export interface CachedProfile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio?: string;
  lookingFor?: string;
  distance?: number;
  matchScore?: number;
  commonInterests?: string[];
  shortSnippet?: string | null;
  analysisReady?: boolean;
  _partial: boolean; // true = from list, false = full getById
}

interface ProfilesStore {
  profiles: Map<string, CachedProfile>;
  merge(userId: string, data: Partial<CachedProfile>): void;
  mergeMany(entries: Array<{ userId: string } & Partial<CachedProfile>>): void;
  get(userId: string): CachedProfile | undefined;
  reset(): void;
}

export const useProfilesStore = create<ProfilesStore>((set, get) => ({
  profiles: new Map(),

  merge(userId, data) {
    set((state) => {
      const profiles = new Map(state.profiles);
      const existing = profiles.get(userId);

      // Filter out undefined values
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) clean[k] = v;
      }

      // Never downgrade _partial: false -> true (full data wins)
      if (existing && existing._partial === false && clean._partial === true) {
        delete clean._partial;
      }

      profiles.set(userId, {
        ...(existing ?? { userId, displayName: '', avatarUrl: null, _partial: true }),
        ...clean,
      } as CachedProfile);

      return { profiles };
    });
  },

  mergeMany(entries) {
    set((state) => {
      const profiles = new Map(state.profiles);

      for (const { userId, ...data } of entries) {
        const existing = profiles.get(userId);

        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) clean[k] = v;
        }

        if (existing && existing._partial === false && clean._partial === true) {
          delete clean._partial;
        }

        profiles.set(userId, {
          ...(existing ?? { userId, displayName: '', avatarUrl: null, _partial: true }),
          ...clean,
        } as CachedProfile);
      }

      return { profiles };
    });
  },

  get(userId) {
    return get().profiles.get(userId);
  },

  reset() {
    set({ profiles: new Map() });
  },
}));
