'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface BookingPaymentFormProps {
  clientSecret: string;
  total: number;
  accent: string;
  btnBg: string;
  btnText: string;
  btnRadius?: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function PaymentFormInner({ total, accent, btnBg, btnText, btnRadius, onSuccess, onError }: Omit<BookingPaymentFormProps, 'clientSecret'>) {
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
        return_url: window.location.href,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed');
      onError(confirmError.message || 'Payment failed');
      setProcessing(false);
    } else {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <span className="material-icons text-lg">error</span>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"
        style={{ backgroundColor: btnBg, color: btnText, ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
      >
        {processing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30" style={{ borderTopColor: '#ffffff' }} />
            Processing...
          </span>
        ) : (
          `Pay $${(total / 100).toFixed(2)}`
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <span className="material-icons text-sm">lock</span>
        Secured by Stripe
      </div>
    </form>
  );
}

export function BookingPaymentForm({ clientSecret, ...props }: BookingPaymentFormProps) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: props.accent,
            borderRadius: '12px',
          },
        },
      }}
    >
      <PaymentFormInner {...props} />
    </Elements>
  );
}
