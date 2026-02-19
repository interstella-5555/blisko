import { create } from 'zustand';

interface OnboardingState {
  displayName: string;
  bio: string;
  lookingFor: string;
  profilingSessionId: string | null;
  step: number;
  isComplete: boolean;
  // New onboarding flow
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
  // New onboarding flow
  setAnswer: (questionId: string, answer: string) => void;
  addSkipped: (questionId: string) => void;
  setGhost: (isGhost: boolean) => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  displayName: '',
  bio: '',
  lookingFor: '',
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
  reset: () => set({
    displayName: '', bio: '', lookingFor: '', profilingSessionId: null,
    step: 0, isComplete: false, answers: {}, skipped: [], isGhost: false,
  }),
  setAnswer: (questionId, answer) =>
    set((state) => ({
      answers: { ...state.answers, [questionId]: answer },
      skipped: state.skipped.filter((id) => id !== questionId),
    })),
  addSkipped: (questionId) =>
    set((state) => ({
      skipped: state.skipped.includes(questionId)
        ? state.skipped
        : [...state.skipped, questionId],
      answers: (() => {
        const { [questionId]: _, ...rest } = state.answers;
        return rest;
      })(),
    })),
  setGhost: (isGhost) => set({ isGhost }),
}));
