import type { OnboardingAnswers, OnboardingState, OnboardingStep } from '@/lib/onboarding/types';

export interface StepProps {
  state: OnboardingState;
  setAnswers: (patch: Partial<OnboardingAnswers>) => void;
  persist: (opts: { step?: OnboardingStep; patch?: Partial<OnboardingAnswers> }) => Promise<void>;
  next: (patch?: Partial<OnboardingAnswers>) => void;
  back: () => void;
  goTo: (step: OnboardingStep, patch?: Partial<OnboardingAnswers>) => void;
  finish: () => Promise<void>;
}
