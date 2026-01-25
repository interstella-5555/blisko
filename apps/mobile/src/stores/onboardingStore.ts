import { create } from 'zustand';

interface OnboardingState {
  displayName: string;
  bio: string;
  lookingFor: string;
  step: number;
  isComplete: boolean;
  setDisplayName: (name: string) => void;
  setBio: (bio: string) => void;
  setLookingFor: (lookingFor: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  setStep: (step: number) => void;
  complete: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  displayName: '',
  bio: '',
  lookingFor: '',
  step: 0,
  isComplete: false,
  setDisplayName: (displayName) => set({ displayName }),
  setBio: (bio) => set({ bio }),
  setLookingFor: (lookingFor) => set({ lookingFor }),
  nextStep: () => set((state) => ({ step: state.step + 1 })),
  prevStep: () => set((state) => ({ step: Math.max(0, state.step - 1) })),
  setStep: (step) => set({ step }),
  complete: () => set({ isComplete: true }),
  reset: () => set({ displayName: '', bio: '', lookingFor: '', step: 0, isComplete: false }),
}));
