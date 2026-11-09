import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  completedAt: string | undefined;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      completedAt: undefined,
      completeOnboarding: () => set({ hasCompletedOnboarding: true, completedAt: new Date().toISOString() }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false, completedAt: undefined })
    }),
    { name: "storymapper-onboarding" }
  )
);
