import { create } from "zustand";

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
  avatarUrl?: string | null;
  socialLinks?: { facebook?: string; linkedin?: string; website?: string } | null;
  visibilityMode?: "ninja" | "semi_open" | "full_nomad";
  doNotDisturb?: boolean;
  isComplete?: boolean;
  currentStatus?: string | null;
  statusExpiresAt?: string | null;
  statusSetAt?: string | null;
  statusVisibility?: "public" | "private" | null;
  statusCategories?: string[] | null;
  superpower?: string | null;
  offerType?: "volunteer" | "exchange" | "gig" | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  hasCheckedProfile: boolean;
  // Mirror of this device's row in push_tokens for the current session. Set by
  // usePushNotifications after a successful register/unregister; cleared on reset.
  pushToken: string | null;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  setHasCheckedProfile: (checked: boolean) => void;
  setPushToken: (token: string | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  hasCheckedProfile: false,
  pushToken: null,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  setHasCheckedProfile: (hasCheckedProfile) => set({ hasCheckedProfile }),
  setPushToken: (pushToken) => set({ pushToken }),
  reset: () =>
    set({
      user: null,
      session: null,
      profile: null,
      isLoading: false,
      hasCheckedProfile: false,
      pushToken: null,
    }),
}));
