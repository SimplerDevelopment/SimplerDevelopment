'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import type { OnboardingAnswers, OnboardingState, OnboardingStep } from '@/lib/onboarding/types';
import { ONBOARDING_STEPS } from '@/lib/onboarding/types';
import { obEyebrow, obHeading, obSubtext, obQuietLink } from './ob-styles';
import { StepWelcome } from './steps/StepWelcome';
import { StepAboutYou } from './steps/StepAboutYou';
import { StepAboutCompany } from './steps/StepAboutCompany';
import { StepChooseModules } from './steps/StepChooseModules';
import { StepPayment } from './steps/StepPayment';
import { StepBrandVibe } from './steps/StepBrandVibe';
import { StepMission } from './steps/StepMission';
import { StepFeatures } from './steps/StepFeatures';
import { StepPowerUp } from './steps/StepPowerUp';
import { StepDone } from './steps/StepDone';
import { StepModuleSetup } from './steps/StepModuleSetup';
import { StepUpsell } from './steps/StepUpsell';

interface Props {
  initialState: OnboardingState;
}

// `title`/`subtitle` drive the content header; `rail`/`icon` drive the left
// stepper rail; `eyebrow` is the mono category label above each step's heading.
const STEP_META: Record<
  OnboardingStep,
  { title: string; subtitle: string; rail: string; icon: string; eyebrow: string }
> = {
  welcome: { title: 'Welcome', subtitle: 'Two minutes to a personalized setup.', rail: 'Welcome', icon: 'waving_hand', eyebrow: 'Welcome' },
  'about-you': { title: 'About you', subtitle: 'Just the basics — you can change anything later.', rail: 'About you', icon: 'person', eyebrow: 'About you' },
  'about-company': { title: 'About your company', subtitle: 'Tells us how to size things for you.', rail: 'Your company', icon: 'business', eyebrow: 'About you' },
  'choose-modules': { title: 'Pick your tools', subtitle: 'Only pay for what you need — add more any time.', rail: 'Choose plan', icon: 'widgets', eyebrow: 'Your plan' },
  payment: { title: 'Start your free trial', subtitle: '14 days free, cancel any time.', rail: 'Payment', icon: 'credit_card', eyebrow: 'Your plan' },
  'module-setup': { title: 'Get started', subtitle: 'A few quick first steps for each module you unlocked.', rail: 'Quick setup', icon: 'checklist', eyebrow: 'Quick setup' },
  'brand-vibe': { title: 'Your brand vibe', subtitle: 'We use this to draft content that sounds like you.', rail: 'Brand vibe', icon: 'palette', eyebrow: 'Your brand' },
  mission: { title: 'What do you do?', subtitle: 'One sentence — your AI assistant will lean on this.', rail: 'Your mission', icon: 'flag', eyebrow: 'Your brand' },
  features: { title: 'What brings you here?', subtitle: "Pick what you want to explore first — we'll tailor your setup around it.", rail: 'Your goals', icon: 'interests', eyebrow: 'Your goals' },
  upsell: { title: 'Supercharge your plan', subtitle: 'Modules other teams like yours add first.', rail: 'Add-ons', icon: 'auto_awesome', eyebrow: 'Add-ons' },
  'power-up': { title: 'Power up with Claude', subtitle: 'Optional, but the magic happens when you wire this up.', rail: 'Power up', icon: 'bolt', eyebrow: 'Power up' },
  done: { title: "You're all set!", subtitle: 'Welcome to SimplerDevelopment.', rail: 'Done', icon: 'celebration', eyebrow: 'All set' },
};

function seedTimezone(s: OnboardingState): OnboardingState {
  if (s.answers.timezone) return s;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return { ...s, answers: { ...s.answers, timezone: tz } };
  } catch {}
  return s;
}

export default function OnboardingWizard({ initialState }: Props) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(() => seedTimezone(initialState));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Steps visible for this client. Billing steps are hidden when:
  // • billingMode !== 'saas', OR
  // • client already has an active subscription (showBillingSteps=false), OR
  // • checkout was completed during this session (checkoutCompletedAt set).
  const BILLING_STEPS: OnboardingStep[] = ['choose-modules', 'payment'];
  const showBilling =
    state.showBillingSteps && !state.answers.checkoutCompletedAt;
  // Upsell is shown when the client went through billing (either showBillingSteps
  // was true or they completed checkout in a prior session).
  const showUpsell = state.showBillingSteps || !!state.answers.checkoutCompletedAt;
  const activeSteps = useMemo(
    () =>
      ONBOARDING_STEPS.filter((s) => {
        if (!showBilling && BILLING_STEPS.includes(s)) return false;
        if (s === 'module-setup' && (state.answers.selectedModules?.length ?? 0) === 0) return false;
        if (s === 'upsell' && !showUpsell) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showBilling, showUpsell, state.answers.selectedModules?.length],
  );

  const currentStep = state.step;
  const stepIndex = activeSteps.indexOf(currentStep);
  const totalSteps = activeSteps.length;
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
    const idx = activeSteps.indexOf(currentStep);
    if (idx < activeSteps.length - 1) {
      goTo(activeSteps[idx + 1], patch);
    }
  }, [currentStep, goTo, activeSteps]);

  const back = useCallback(() => {
    const idx = activeSteps.indexOf(currentStep);
    if (idx > 0) goTo(activeSteps[idx - 1]);
  }, [currentStep, goTo, activeSteps]);

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

  // Fire-and-forget: sync the auto-detected timezone to the server once on
  // mount. We call fetch directly (not `persist`) so no React state is touched
  // inside this effect — satisfying the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    const tz = state.answers.timezone;
    if (!tz) return;
    void fetch('/api/portal/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { timezone: tz } }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = STEP_META[currentStep];

  const stepBody = useMemo(() => {
    const common = { state, setAnswers, persist, next, back, goTo, finish };
    switch (currentStep) {
      case 'welcome': return <StepWelcome {...common} />;
      case 'about-you': return <StepAboutYou {...common} />;
      case 'about-company': return <StepAboutCompany {...common} />;
      case 'choose-modules': return <StepChooseModules {...common} />;
      case 'payment': return <StepPayment {...common} />;
      case 'module-setup': return <StepModuleSetup {...common} />;
      case 'brand-vibe': return <StepBrandVibe {...common} />;
      case 'mission': return <StepMission {...common} />;
      case 'features': return <StepFeatures {...common} />;
      case 'upsell': return <StepUpsell {...common} />;
      case 'power-up': return <StepPowerUp {...common} />;
      case 'done': return <StepDone {...common} />;
    }
  }, [currentStep, state, setAnswers, persist, next, back, goTo, finish]);

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[300px_1fr]">
      {/* ── LEFT: stepper rail (lg+) ─────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-[#0e0d0c] px-7 py-7 text-white lg:flex lg:flex-col">
        <div className="auth-mesh">
          <span className="auth-blob" style={{ width: 230, height: 230, background: '#2563eb', top: '-70px', left: '-60px' }} />
          <span className="auth-blob" style={{ width: 180, height: 180, background: '#10b981', top: '34%', right: '-70px', opacity: 0.8, animationDelay: '-6s' }} />
          <span className="auth-blob" style={{ width: 160, height: 160, background: '#f59e0b', bottom: '-50px', left: '-20px', opacity: 0.7, animationDelay: '-11s' }} />
        </div>
        <div className="auth-grain" />

        <div className="relative z-10 flex h-full flex-col">
          <Link href="/" className="flex items-center font-heading text-lg text-white">
            <Image src="/iconLogo.png" alt="" width={40} height={40} className="nav-logo-icon" priority />
            <span><b>Simpler</b> Development</span>
          </Link>

          <div className="mb-4 mt-7 flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.2em] text-white/50">
            <span className="auth-dot inline-block h-[7px] w-[7px] rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
            Get set up
          </div>

          <ol className="flex-1 space-y-0.5">
            {activeSteps.map((s, i) => {
              const status = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'upcoming';
              return (
                <li
                  key={s}
                  className={`relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] transition ${
                    status === 'active'
                      ? 'bg-white/[0.07] font-semibold text-white'
                      : status === 'done'
                        ? 'text-white/75'
                        : 'text-white/40'
                  }`}
                >
                  {status === 'active' && (
                    <span className="absolute -left-[7px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded bg-white" />
                  )}
                  <span
                    className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full border text-[13px] ${
                      status === 'done'
                        ? 'border-emerald-500 bg-emerald-500 text-[#04231a]'
                        : status === 'active'
                          ? 'border-white bg-white text-[#0e0d0c]'
                          : 'border-white/25'
                    }`}
                  >
                    <span className="material-icons text-[13px]">
                      {status === 'done' ? 'check' : STEP_META[s].icon}
                    </span>
                  </span>
                  {STEP_META[s].rail}
                </li>
              );
            })}
          </ol>

          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/45">
              Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps} · {Math.round(progress)}%
            </div>
            <div className="mt-2.5 h-[5px] overflow-hidden rounded bg-white/10">
              <motion.div
                className="h-full rounded bg-gradient-to-r from-[#2563eb] to-[#10b981]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      </aside>

      {/* ── RIGHT: content ───────────────────────────────────────────────── */}
      <div className="relative flex min-h-screen flex-col bg-background">
        {/* Mobile progress strip (rail is hidden below lg) */}
        <div
          className="flex items-center gap-3 border-b border-border px-5 py-3 pr-24 lg:hidden"
          data-testid="onboarding-topbar"
        >
          <div className="flex-1">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span data-testid="onboarding-step-label">
                Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-foreground"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        {currentStep !== 'done' && (
          <button
            type="button"
            onClick={skipAll}
            data-testid="onboarding-skip-all"
            className="absolute right-5 top-4 z-10 whitespace-nowrap text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip setup
          </button>
        )}

        <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-6 py-10 sm:px-10 sm:py-14">
          {/* Header */}
          <header className="mb-7">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className={obEyebrow}>{meta.eyebrow}</div>
                <h1 className={obHeading} data-testid="onboarding-step-title">
                  {meta.title}
                </h1>
                <p className={obSubtext}>{meta.subtitle}</p>
              </motion.div>
            </AnimatePresence>
          </header>

          {/* Step body */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              data-testid={`onboarding-step-${currentStep}`}
            >
              {stepBody}
            </motion.div>
          </AnimatePresence>

          {/* Footer */}
          <div className="mt-8 flex items-center justify-between">
            {stepIndex > 0 && currentStep !== 'done' ? (
              <button
                type="button"
                onClick={back}
                disabled={saving}
                data-testid="onboarding-back"
                className={`${obQuietLink} inline-flex items-center gap-1.5`}
              >
                <span className="material-icons text-base">arrow_back</span>
                Back
              </button>
            ) : <span />}
            {error && <span className="text-xs text-destructive" role="alert">{error}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
