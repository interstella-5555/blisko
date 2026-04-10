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
      }),
    },
  ),
);
