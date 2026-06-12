'use client';

import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { Stripe as StripeClient } from '@stripe/stripe-js';
import type { CheckoutResult } from './checkout-types';
import { formatPrice } from './checkout-types';

// ─── Inner payment form (inside <Elements>) ────────────────────────────────

interface PaymentFormInnerProps {
  total: number;
  currency: string;
  orderNumber: string;
  onSuccess: (orderNumber: string) => void;
  basePath: string;
}

function PaymentFormInner({ total, currency, orderNumber, onSuccess, basePath }: PaymentFormInnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError('');

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'Payment failed');
      setProcessing(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${basePath}/checkout?order=${orderNumber}`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed');
      setProcessing(false);
    } else {
      onSuccess(orderNumber);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90"
      >
        {processing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30" style={{ borderTopColor: '#ffffff' }} />
            Processing...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <span className="material-icons text-base">lock</span>
            Pay {formatPrice(total, currency)}
          </span>
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <span className="material-icons text-sm">lock</span>
        Secured by Stripe
      </div>
    </form>
  );
}

// ─── Payment section (the payment card: header + loading/error + Elements) ──

export interface CheckoutPaymentSectionProps {
  checkoutResult: CheckoutResult | null;
  stripePromise: Promise<StripeClient | null> | null;
  checkoutLoading: boolean;
  checkoutError: string;
  onSuccess: (orderNumber: string) => void;
  basePath: string;
}

export function CheckoutPaymentSection({
  checkoutResult,
  stripePromise,
  checkoutLoading,
  checkoutError,
  onSuccess,
  basePath,
}: CheckoutPaymentSectionProps) {
  return (
    <div className="border border-border rounded-xl bg-card p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-4">
        <span className="material-icons text-base">credit_card</span>
        Payment
      </h2>

      {checkoutLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <span className="animate-spin rounded-full h-4 w-4 border-2 border-primary/30" style={{ borderTopColor: 'currentColor' }} />
          Preparing payment...
        </div>
      )}

      {checkoutError && !checkoutLoading && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          <span className="material-icons text-base">error</span>
          {checkoutError}
        </div>
      )}

      {checkoutResult && stripePromise && !checkoutLoading && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: checkoutResult.clientSecret,
            appearance: {
              theme: 'stripe',
              variables: { borderRadius: '8px' },
            },
          }}
        >
          <PaymentFormInner
            total={checkoutResult.total}
            currency={checkoutResult.currency}
            orderNumber={checkoutResult.orderNumber}
            onSuccess={onSuccess}
            basePath={basePath}
          />
        </Elements>
      )}
    </div>
  );
}
