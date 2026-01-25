import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
}

interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}

interface Profile {
  id: string;
  displayName: string;
  bio: string;
  lookingFor: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  hasCheckedProfile: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  setHasCheckedProfile: (checked: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  hasCheckedProfile: false,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  setHasCheckedProfile: (hasCheckedProfile) => set({ hasCheckedProfile }),
  reset: () =>
    set({
      user: null,
      session: null,
      profile: null,
      isLoading: false,
      hasCheckedProfile: false,
    }),
}));
