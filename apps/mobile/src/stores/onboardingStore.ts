import type { Gender, StatusCategory, VisibilityMode } from "@repo/shared";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

const secureStoreAdapter: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface OnboardingState {
  displayName: string;
  bio: string;
  lookingFor: string;
  profilingSessionId: string | null;
  step: number;
  isComplete: boolean;
  answers: Record<string, string>;
  skipped: string[];
  isGhost: boolean;
  // --- v4 3-step onboarding (BLI-292) ---
  /** Photo picked in step 1 (server `source` string from POST /uploads). */
  avatarUrl: string | null;
  /** Gender picked in step 1 — required in the UI, nullable in the DB (BLI-306). */
  gender: Gender | null;
  /** Category tiles selected in step 2 ("Czego szukasz dziś?"), max 2. */
  statusCategories: StatusCategory[];
  /** Free-text status set in step 2. */
  statusText: string;
  /** Account visibility chosen in step 3. */
  visibilityMode: VisibilityMode;
  /** One-time guided first-tap overlay on the map. User-scoped → fresh per account. */
  firstMapHintSeen: boolean;
  setDisplayName: (name: string) => void;
  setBio: (bio: string) => void;
  setLookingFor: (lookingFor: string) => void;
  setProfilingSessionId: (id: string | null) => void;
  nextStep: () => void;
  prevStep: () => void;
  setStep: (step: number) => void;
  complete: () => void;
  reset: () => void;
  setAnswer: (questionId: string, answer: string) => void;
  addSkipped: (questionId: string) => void;
  setGhost: (isGhost: boolean) => void;
  setAvatarUrl: (avatarUrl: string | null) => void;
  setGender: (gender: Gender) => void;
  setStatusCategories: (categories: StatusCategory[]) => void;
  setStatusText: (text: string) => void;
  setVisibilityMode: (mode: VisibilityMode) => void;
  markFirstMapHintSeen: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      displayName: "",
      bio: "",
      lookingFor: "",
      profilingSessionId: null,
      step: 0,
      isComplete: false,
      answers: {},
      skipped: [],
      isGhost: false,
      avatarUrl: null,
      gender: null,
      statusCategories: [],
      statusText: "",
      visibilityMode: "semi_open",
      firstMapHintSeen: false,
      setDisplayName: (displayName) => set({ displayName }),
      setBio: (bio) => set({ bio }),
      setLookingFor: (lookingFor) => set({ lookingFor }),
      setProfilingSessionId: (profilingSessionId) => set({ profilingSessionId }),
      nextStep: () => set((state) => ({ step: state.step + 1 })),
      prevStep: () => set((state) => ({ step: Math.max(0, state.step - 1) })),
      setStep: (step) => set({ step }),
      complete: () => set({ isComplete: true }),
      reset: () =>
        set({
          displayName: "",
          bio: "",
          lookingFor: "",
          profilingSessionId: null,
          step: 0,
          isComplete: false,
          answers: {},
          skipped: [],
          isGhost: false,
          avatarUrl: null,
          gender: null,
          statusCategories: [],
          statusText: "",
          visibilityMode: "semi_open",
          firstMapHintSeen: false,
        }),
      setAnswer: (questionId, answer) =>
        set((state) => ({
          answers: { ...state.answers, [questionId]: answer },
          skipped: state.skipped.filter((id) => id !== questionId),
        })),
      addSkipped: (questionId) =>
        set((state) => ({
          skipped: state.skipped.includes(questionId) ? state.skipped : [...state.skipped, questionId],
          answers: (() => {
            const { [questionId]: _, ...rest } = state.answers;
            return rest;
          })(),
        })),
      setGhost: (isGhost) => set({ isGhost }),
      setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
      setGender: (gender) => set({ gender }),
      setStatusCategories: (statusCategories) => set({ statusCategories }),
      setStatusText: (statusText) => set({ statusText }),
      setVisibilityMode: (visibilityMode) => set({ visibilityMode }),
      markFirstMapHintSeen: () => set({ firstMapHintSeen: true }),
    }),
    {
      name: "blisko_onboarding",
      storage: createJSONStorage(() => secureStoreAdapter),
      partialize: (state) => ({
        displayName: state.displayName,
        profilingSessionId: state.profilingSessionId,
        answers: state.answers,
        skipped: state.skipped,
        isGhost: state.isGhost,
        avatarUrl: state.avatarUrl,
        gender: state.gender,
        statusCategories: state.statusCategories,
        statusText: state.statusText,
        visibilityMode: state.visibilityMode,
        firstMapHintSeen: state.firstMapHintSeen,
      }),
    },
  ),
);
