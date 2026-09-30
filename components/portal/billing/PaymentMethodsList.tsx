'use client';

import type { PaymentMethod } from '@/components/portal/billing/use-billing-data';

export default function PaymentMethodsList({
  methods,
  loading,
  removingId,
  onRemove,
}: {
  methods: PaymentMethod[];
  loading: boolean;
  removingId: number | null;
  onRemove: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 text-center">
        <span className="material-icons text-5xl text-muted-foreground/40">credit_card_off</span>
        <h3 className="mt-4 font-display font-extrabold tracking-[-0.01em] text-foreground">No payment methods</h3>
        <p className="mt-2 text-sm text-muted-foreground">Payment methods are saved when you pay an invoice via Stripe.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <ul className="divide-y divide-border">
        {methods.map(m => (
          <li key={m.id} className="flex items-center gap-4 px-6 py-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="material-icons text-primary text-lg">credit_card</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground capitalize">
                {m.brand} ending in {m.last4}
                {m.isDefault && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Default</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">Expires {String(m.expMonth).padStart(2, '0')}/{m.expYear}</p>
            </div>
            <button
              onClick={() => onRemove(m.id)}
              disabled={removingId === m.id}
              className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
            >
              {removingId === m.id
                ? <span className="material-icons text-base animate-spin">refresh</span>
                : <span className="material-icons text-base">delete</span>
              }
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
