'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { StepProps } from './types';
import { BUNDLE, BUNDLE_SLUG, FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';

const BUNDLE_KEY = 'bundle';

interface LineItem {
  name: string;
  icon: string;
  priceCents: number;
}

export function StepPayment({ state, setAnswers, persist, next }: StepProps) {
  const searchParams = useSearchParams();
  const checkoutParam = searchParams.get('checkout');

  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyNotice, setVerifyNotice] = useState(false);
  // Derive initial UI state from the URL param synchronously to avoid
  // setState-in-effect (which triggers cascading renders).
  const [checkoutCancelled] = useState(() => checkoutParam === 'cancelled');
  const [checkoutSuccess, setCheckoutSuccess] = useState(() => checkoutParam === 'success');

  const selectedModules: string[] = state.answers.selectedModules ?? [];
  const isBundle = selectedModules.includes(BUNDLE_KEY);

  // Build line items for order summary
  const lineItems: LineItem[] = isBundle
    ? [{ name: BUNDLE.name, icon: BUNDLE.icon, priceCents: BUNDLE.monthlyPriceCents }]
    : selectedModules.flatMap((key) => {
        const d = FEATURE_DOMAINS.find((f) => f.key === key);
        if (!d) return [];
        return [{ name: d.name, icon: d.icon, priceCents: d.monthlyPriceCents }];
      });

  const totalCents = lineItems.reduce((s, li) => s + li.priceCents, 0);

  // On mount when returning from a successful Stripe checkout: persist the
  // completedAt timestamp and auto-advance. This is the only async/external
  // work that belongs in an effect.
  useEffect(() => {
    if (checkoutParam !== 'success') return;
    const now = new Date().toISOString();
    setAnswers({ checkoutCompletedAt: now });
    void persist({ patch: { checkoutCompletedAt: now } }).then(() => {
      setTimeout(() => {
        setCheckoutSuccess(true);
        next({ checkoutCompletedAt: now });
      }, 1800);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStartTrial() {
    setLaunching(true);
    setError(null);
    setVerifyNotice(false);
    try {
      // Map selection → slugs
      const slugs = isBundle
        ? [BUNDLE_SLUG]
        : selectedModules.flatMap((key) => {
            const d = FEATURE_DOMAINS.find((f) => f.key === key);
            return d ? [d.slug] : [];
          });

      const res = await fetch('/api/portal/billing/modules/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs, returnTo: 'onboarding' }),
      });
      const json = await res.json();

      if (res.status === 403 && json.requiresVerification) {
        setVerifyNotice(true);
        return;
      }
      if (!res.ok || !json.success) {
        if (res.status === 409) {
          // Already subscribed — treat as success, advance
          const now = new Date().toISOString();
          setAnswers({ checkoutCompletedAt: now });
          await persist({ patch: { checkoutCompletedAt: now } });
          next({ checkoutCompletedAt: now });
          return;
        }
        throw new Error(json.message ?? json.error ?? 'Checkout failed. Please try again.');
      }

      window.location.href = json.data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLaunching(false);
    }
  }

  async function handleSkip() {
    await persist({ step: 'brand-vibe' });
    next();
  }

  const formatPrice = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo`;

  if (checkoutSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="rounded-full bg-green-100 p-4">
          <span className="material-icons text-4xl text-green-600">check_circle</span>
        </div>
        <h2 className="text-xl font-bold">Trial started!</h2>
        <p className="text-sm text-muted-foreground">Setting up your workspace…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {checkoutCancelled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2 text-sm text-amber-800">
          <span className="material-icons text-base mt-0.5 shrink-0">info</span>
          No charge made — pick up where you left off.
        </div>
      )}

      {/* Order summary */}
      <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border overflow-hidden">
        {lineItems.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">No modules selected.</div>
        ) : (
          lineItems.map((li) => (
            <div key={li.name} className="flex items-center gap-3 px-4 py-3">
              <span className="material-icons text-lg text-primary">{li.icon}</span>
              <span className="flex-1 text-sm font-medium">{li.name}</span>
              <span className="text-sm text-muted-foreground">{formatPrice(li.priceCents)}</span>
            </div>
          ))
        )}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-sm font-bold">{formatPrice(totalCents)}</span>
        </div>
      </div>

      {/* Trial notice */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-2 text-sm text-foreground">
        <span className="material-icons text-base text-primary mt-0.5 shrink-0">card_giftcard</span>
        <div>
          <span className="font-semibold">14-day free trial</span>
          <span className="text-muted-foreground"> — $0 today, card required. Cancel any time before day 14.</span>
        </div>
      </div>

      {/* Email verify notice */}
      {verifyNotice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2 text-sm text-amber-800">
          <span className="material-icons text-base mt-0.5 shrink-0">mark_email_unread</span>
          Verify your email first — check your inbox for a confirmation link.
        </div>
      )}

      {/* Generic error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2 text-sm text-destructive" role="alert">
          <span className="material-icons text-base mt-0.5 shrink-0">error_outline</span>
          {error}
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={handleStartTrial}
        disabled={launching || lineItems.length === 0}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
      >
        {launching ? (
          <span className="material-icons text-lg animate-spin">refresh</span>
        ) : (
          <span className="material-icons text-lg">rocket_launch</span>
        )}
        {launching ? 'Redirecting…' : 'Start free trial'}
      </button>

      {/* Skip */}
      <div className="text-center">
        <button
          type="button"
          onClick={handleSkip}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Skip for now — I&apos;ll set up billing later
        </button>
      </div>
    </div>
  );
}
