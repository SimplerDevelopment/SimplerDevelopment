'use client';

import { useState } from 'react';
import Link from 'next/link';

interface ServicePaywallProps {
  serviceName: string;
  serviceDescription: string | null;
  price: number;
  billingCycle: string;
  features: string[];
  serviceId: number;
  icon: string;
}

function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function ServicePaywall({
  serviceName,
  serviceDescription,
  price,
  billingCycle,
  features,
  serviceId,
  icon,
}: ServicePaywallProps) {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/services/${serviceId}/checkout`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-8 space-y-6">
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <span className="material-icons text-3xl text-primary">{icon}</span>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground">{serviceName}</h1>
          {serviceDescription && (
            <p className="text-muted-foreground mt-2 text-sm">{serviceDescription}</p>
          )}
        </div>

        <div className="py-4 border-y border-border">
          <span className="text-4xl font-bold text-foreground">{formatCents(price)}</span>
          {billingCycle !== 'once' && (
            <span className="text-muted-foreground text-lg">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
          )}
        </div>

        {features.length > 0 && (
          <ul className="space-y-2 text-left">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                <span className="material-icons text-sm text-green-500">check_circle</span>
                {f}
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl text-base font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <span className="material-icons animate-spin text-xl">refresh</span>
          ) : (
            <>
              <span className="material-icons text-xl">lock_open</span>
              Subscribe Now
            </>
          )}
        </button>
      </div>

      <div className="text-center">
        <Link
          href="/portal/services"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View all services
        </Link>
      </div>
    </div>
  );
}
