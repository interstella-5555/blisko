import type { StatusCategory } from "@repo/shared";
import { create } from "zustand";

type VisibilityMode = "ninja" | "semi_open" | "full_nomad";
type OfferType = "help" | "exchange" | "gig" | "collaboration";

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
  // New fields for redesigned onboarding
  visibilityMode: VisibilityMode;
  superpower: string;
  offerTypes: OfferType[];
  statusText: string;
  statusCategories: StatusCategory[];
  statusVisibility: "public" | "private";

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
  setVisibilityMode: (mode: VisibilityMode) => void;
  setSuperpower: (text: string) => void;
  setOfferTypes: (types: OfferType[]) => void;
  toggleOfferType: (type: OfferType) => void;
  setStatusText: (text: string) => void;
  setStatusCategories: (categories: StatusCategory[]) => void;
  toggleStatusCategory: (category: StatusCategory) => void;
  setStatusVisibility: (visibility: "public" | "private") => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  displayName: "",
  bio: "",
  lookingFor: "",
  profilingSessionId: null,
  step: 0,
  isComplete: false,
  answers: {},
  skipped: [],
  isGhost: false,
  visibilityMode: "semi_open",
  superpower: "",
  offerTypes: [],
  statusText: "",
  statusCategories: [],
  statusVisibility: "public",

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
      visibilityMode: "semi_open",
      superpower: "",
      offerTypes: [],
      statusText: "",
      statusCategories: [],
      statusVisibility: "public",
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
  setVisibilityMode: (visibilityMode) => set({ visibilityMode }),
  setSuperpower: (superpower) => set({ superpower }),
  setOfferTypes: (offerTypes) => set({ offerTypes }),
  toggleOfferType: (type) =>
    set((state) => ({
      offerTypes: state.offerTypes.includes(type)
        ? state.offerTypes.filter((t) => t !== type)
        : [...state.offerTypes, type],
    })),
  setStatusText: (statusText) => set({ statusText }),
  setStatusCategories: (statusCategories) => set({ statusCategories }),
  toggleStatusCategory: (category) =>
    set((state) => ({
      statusCategories: state.statusCategories.includes(category)
        ? state.statusCategories.filter((c) => c !== category)
        : state.statusCategories.length < 2
          ? [...state.statusCategories, category]
          : state.statusCategories,
    })),
  setStatusVisibility: (statusVisibility) => set({ statusVisibility }),
}));
