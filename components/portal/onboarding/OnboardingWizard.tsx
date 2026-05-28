'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { OnboardingAnswers, OnboardingState, OnboardingStep } from '@/lib/onboarding/types';
import { ONBOARDING_STEPS } from '@/lib/onboarding/types';
import { StepWelcome } from './steps/StepWelcome';
import { StepAboutYou } from './steps/StepAboutYou';
import { StepAboutCompany } from './steps/StepAboutCompany';
import { StepBrandVibe } from './steps/StepBrandVibe';
import { StepMission } from './steps/StepMission';
import { StepFeatures } from './steps/StepFeatures';
import { StepPowerUp } from './steps/StepPowerUp';
import { StepDone } from './steps/StepDone';

interface Props {
  initialState: OnboardingState;
}

const STEP_META: Record<OnboardingStep, { title: string; subtitle: string }> = {
  welcome: { title: 'Welcome', subtitle: 'Two minutes to a personalized setup.' },
  'about-you': { title: 'About you', subtitle: 'Just the basics — you can change anything later.' },
  'about-company': { title: 'About your company', subtitle: 'Tells us how to size things for you.' },
  'brand-vibe': { title: 'Your brand vibe', subtitle: 'We use this to draft content that sounds like you.' },
  mission: { title: 'What do you do?', subtitle: 'One sentence — your AI assistant will lean on this.' },
  features: { title: 'What brings you here?', subtitle: 'Pick the tools you want to try. (You unlock them all anyway.)' },
  'power-up': { title: 'Power up with Claude', subtitle: 'Optional, but the magic happens when you wire this up.' },
  done: { title: "You're all set!", subtitle: 'Welcome to SimplerDevelopment.' },
};

export default function OnboardingWizard({ initialState }: Props) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(initialState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = state.step;
  const stepIndex = ONBOARDING_STEPS.indexOf(currentStep);
  const totalSteps = ONBOARDING_STEPS.length;
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  const persist = useCallback(async (opts: { step?: OnboardingStep; patch?: Partial<OnboardingAnswers> }) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: opts.step, answers: opts.patch }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'Failed to save');
      setState(json.data as OnboardingState);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, []);

  const goTo = useCallback((next: OnboardingStep, patch?: Partial<OnboardingAnswers>) => {
    void persist({ step: next, patch });
  }, [persist]);

  const next = useCallback((patch?: Partial<OnboardingAnswers>) => {
    const idx = ONBOARDING_STEPS.indexOf(currentStep);
    if (idx < ONBOARDING_STEPS.length - 1) {
      goTo(ONBOARDING_STEPS[idx + 1], patch);
    }
  }, [currentStep, goTo]);

  const back = useCallback(() => {
    const idx = ONBOARDING_STEPS.indexOf(currentStep);
    if (idx > 0) goTo(ONBOARDING_STEPS[idx - 1]);
  }, [currentStep, goTo]);

  const finish = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/portal/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      const json = await res.json();
      if (json.success) router.push('/portal/dashboard');
    } finally {
      setSaving(false);
    }
  }, [router]);

  const skipAll = useCallback(async () => {
    setSaving(true);
    try {
      await fetch('/api/portal/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      router.push('/portal/dashboard');
    } finally {
      setSaving(false);
    }
  }, [router]);

  const setAnswers = useCallback((patch: Partial<OnboardingAnswers>) => {
    setState((s) => ({ ...s, answers: { ...s.answers, ...patch } }));
  }, []);

  // Auto-detect timezone once, on mount, if not already saved.
  useEffect(() => {
    if (state.answers.timezone) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        setAnswers({ timezone: tz });
        void persist({ patch: { timezone: tz } });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = STEP_META[currentStep];

  const stepBody = useMemo(() => {
    const common = { state, setAnswers, persist, next, back, goTo, finish };
    switch (currentStep) {
      case 'welcome': return <StepWelcome {...common} />;
      case 'about-you': return <StepAboutYou {...common} />;
      case 'about-company': return <StepAboutCompany {...common} />;
      case 'brand-vibe': return <StepBrandVibe {...common} />;
      case 'mission': return <StepMission {...common} />;
      case 'features': return <StepFeatures {...common} />;
      case 'power-up': return <StepPowerUp {...common} />;
      case 'done': return <StepDone {...common} />;
    }
  }, [currentStep, state, setAnswers, persist, next, back, goTo, finish]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Top bar: progress + skip */}
      <div className="mb-8 flex items-center gap-4" data-testid="onboarding-topbar">
        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span data-testid="onboarding-step-label">
              Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>
        {currentStep !== 'done' && (
          <button
            type="button"
            onClick={skipAll}
            data-testid="onboarding-skip-all"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            Skip for now
          </button>
        )}
      </div>

      {/* Header */}
      <header className="mb-6 sm:mb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="onboarding-step-title">
              {meta.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{meta.subtitle}</p>
          </motion.div>
        </AnimatePresence>
      </header>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm shadow-sm p-6 sm:p-8"
          data-testid={`onboarding-step-${currentStep}`}
        >
          {stepBody}
        </motion.div>
      </AnimatePresence>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-between">
        {stepIndex > 0 && currentStep !== 'done' ? (
          <button
            type="button"
            onClick={back}
            disabled={saving}
            data-testid="onboarding-back"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">arrow_back</span>
            Back
          </button>
        ) : <span />}
        {error && <span className="text-xs text-destructive" role="alert">{error}</span>}
      </div>
    </div>
  );
}
