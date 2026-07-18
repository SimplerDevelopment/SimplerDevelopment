'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { StepProps } from './types';
import { BUNDLE, BUNDLE_SLUG, FEATURE_DOMAINS, applyVolumeDiscount } from '@/lib/billing/domain-catalog';
import { obPrimaryBtn } from '../ob-styles';
import { verifyCheckoutSession } from '@/components/portal/billing/verify-checkout-session';

const BUNDLE_KEY = 'bundle';

interface LineItem {
  name: string;
  icon: string;
  priceCents: number;
}

export function StepPayment({
  state,
  setAnswers,
  persist,
  next,
  stripeEnabled = true,
}: StepProps & { stripeEnabled?: boolean }) {
  const searchParams = useSearchParams();
  const checkoutParam = searchParams.get('checkout');

  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyNotice, setVerifyNotice] = useState(false);
  // Derive initial UI state from the URL param synchronously to avoid
  // setState-in-effect (which triggers cascading renders).
  const [checkoutCancelled] = useState(() => checkoutParam === 'cancelled');
  const [checkoutSuccess, setCheckoutSuccess] = useState(() => checkoutParam === 'success');
  // Escape hatch: the success screen is supposed to auto-advance in ~1.8s, but
  // a slow persist left users staring at "Setting up your workspace…" for
  // minutes right after being charged (OBQA-015). Offer a manual Continue.
  const [showEscape, setShowEscape] = useState(false);
  useEffect(() => {
    if (checkoutParam !== 'success') return;
    const t = setTimeout(() => setShowEscape(true), 8000);
    return () => clearTimeout(t);
  }, [checkoutParam]);

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

  // À-la-carte selections earn a volume discount (the bundle is its own price).
  const subtotalCents = lineItems.reduce((s, li) => s + li.priceCents, 0);
  const { discountPercent, discountCents, totalCents } = isBundle
    ? { discountPercent: 0, discountCents: 0, totalCents: subtotalCents }
    : applyVolumeDiscount(subtotalCents, lineItems.length);

  // On mount when returning from a successful Stripe checkout: verify the
  // session server-side so entitlements are granted BEFORE the quick-setup
  // steps render (OBQA-014 — previously we trusted the URL param and raced the
  // webhook), persist the completedAt timestamp, and auto-advance. A verify
  // failure must never strand the user here: the webhook is the backstop, so
  // we advance regardless.
  useEffect(() => {
    if (checkoutParam !== 'success') return;
    const now = new Date().toISOString();
    setAnswers({ checkoutCompletedAt: now });
    const verify = verifyCheckoutSession(searchParams.get('session_id'));
    void Promise.allSettled([persist({ patch: { checkoutCompletedAt: now } }), verify]).then(() => {
      setTimeout(() => {
        setCheckoutSuccess(true);
        next({ checkoutCompletedAt: now });
      }, 400);
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
      // Stripe-less instance: the server granted the modules locally and
      // bypassed checkout — advance the same way a paid checkout would.
      if (res.ok && json.success && json.data?.bypassed) {
        const now = new Date().toISOString();
        setAnswers({ checkoutCompletedAt: now });
        await persist({ patch: { checkoutCompletedAt: now } });
        next({ checkoutCompletedAt: now });
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
        // A 403 is an intentional, user-facing policy message (e.g. an
        // agency-managed plan: "contact us to make changes") — surface it.
        // Everything else (400 catalog mismatch, 500 Stripe/DB) is an internal
        // failure the customer can't act on, so never leak raw strings like
        // "Module not found." — show a friendly, recoverable message instead.
        if (res.status === 403 && json.message) {
          throw new Error(json.message);
        }
        throw new Error(
          "We couldn't start your checkout. Please try again — if it keeps happening, contact support and we'll sort it out.",
        );
      }

      window.location.href = json.data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLaunching(false);
    }
  }

  const formatPrice = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo`;

  if (checkoutSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="rounded-full bg-emerald-500/10 p-4">
          <span className="material-icons text-4xl text-emerald-600">check_circle</span>
        </div>
        <h2 className="text-xl font-bold">Trial started!</h2>
        <p className="text-sm text-muted-foreground">Setting up your workspace…</p>
        {showEscape && (
          <button
            type="button"
            onClick={() => next({ checkoutCompletedAt: new Date().toISOString() })}
            data-testid="onboarding-payment-escape"
            className={obPrimaryBtn}
          >
            Continue
            <span className="material-icons text-lg">arrow_forward</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {checkoutCancelled && (
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 flex items-start gap-2 text-sm text-amber-800">
          <span className="material-icons text-base mt-0.5 shrink-0">info</span>
          No charge made — pick up where you left off.
        </div>
      )}

      {/* Order summary */}
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {lineItems.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">No modules selected.</div>
        ) : (
          lineItems.map((li) => (
            <div key={li.name} className="flex items-center gap-3 px-4 py-3.5">
              <span className="material-icons text-lg text-primary">{li.icon}</span>
              <span className="flex-1 text-[14px] font-semibold">{li.name}</span>
              <span className="text-[13px] text-muted-foreground">{formatPrice(li.priceCents)}</span>
            </div>
          ))
        )}
        {discountPercent > 0 && (
          <>
            <div className="flex items-center justify-between px-4 py-2.5 text-[13px] text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatPrice(subtotalCents)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-[13px] text-emerald-700">
              <span>Volume discount ({discountPercent}% off)</span>
              <span>−{formatPrice(discountCents)}</span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between px-4 py-3.5 bg-[var(--portal-surface-2)]">
          <span className="text-[14px] font-bold">Total</span>
          <span className="text-[14px] font-bold">{formatPrice(totalCents)}</span>
        </div>
      </div>

      {stripeEnabled ? (
        /* Trial notice */
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-500/[0.07] px-4 py-3.5 flex items-start gap-2.5 text-sm text-foreground">
          <span className="material-icons text-base text-emerald-600 mt-0.5 shrink-0">card_giftcard</span>
          <div>
            <span className="font-semibold">14-day free trial</span>
            <span className="text-muted-foreground"> — $0 today, card required. Cancel any time before day 14.</span>
          </div>
        </div>
      ) : (
        /* Payments-not-configured warning (self-host / local dev instances) */
        <div
          className="rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3.5 flex items-start gap-2.5 text-sm text-amber-800"
          data-testid="onboarding-payment-unconfigured"
        >
          <span className="material-icons text-base mt-0.5 shrink-0">warning_amber</span>
          <div>
            <span className="font-semibold">Payments aren&apos;t set up on this instance.</span>{' '}
            You can continue — your selected modules will be activated without a charge. Billing
            starts working once the operator configures Stripe.
          </div>
        </div>
      )}

      {/* Email verify notice */}
      {verifyNotice && (
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 flex items-start gap-2 text-sm text-amber-800">
          <span className="material-icons text-base mt-0.5 shrink-0">mark_email_unread</span>
          Verify your email first — check your inbox for a confirmation link.
        </div>
      )}

      {/* Generic error */}
      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2 text-sm text-destructive" role="alert">
          <span className="material-icons text-base mt-0.5 shrink-0">error_outline</span>
          {error}
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={handleStartTrial}
        disabled={launching || lineItems.length === 0}
        className={`w-full ${obPrimaryBtn}`}
      >
        {launching ? (
          <span className="material-icons text-lg animate-spin">refresh</span>
        ) : (
          <span className="material-icons text-lg">{stripeEnabled ? 'rocket_launch' : 'arrow_forward'}</span>
        )}
        {launching
          ? stripeEnabled ? 'Redirecting…' : 'Activating…'
          : stripeEnabled ? 'Start free trial' : 'Continue without payment'}
      </button>
    </div>
  );
}
