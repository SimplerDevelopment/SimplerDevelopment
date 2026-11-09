'use client';
// Extracted verbatim from ../page.tsx for PUX-187 — the Customer + Addresses
// 3-card grid. `contactHref` is the one intentional non-verbatim addition.

import Link from 'next/link';
import { pCard } from '@/components/portal/portal-ui';
import type { Order, Address } from './types';

function formatAddress(addr?: Address | null) {
  if (!addr) return null;
  const parts = [addr.name, addr.line1, addr.line2, [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '), addr.country].filter(
    Boolean
  );
  return parts;
}

interface CustomerCardsProps {
  order: Order;
  contactHref?: string;
}

export default function CustomerCards({ order, contactHref }: CustomerCardsProps) {
  const shippingLines = formatAddress(order.shippingAddress);
  const billingLines = formatAddress(order.billingAddress);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className={`${pCard} p-5 space-y-2`}>
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Customer</h3>
        <p className="text-sm font-medium text-foreground">
          {contactHref ? (
            <Link href={contactHref} className="hover:underline">
              {order.customerName}
            </Link>
          ) : (
            order.customerName
          )}
        </p>
        <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
        {order.customerPhone && <p className="text-sm text-muted-foreground">{order.customerPhone}</p>}
      </div>
      <div className={`${pCard} p-5 space-y-2`}>
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Shipping Address</h3>
        {shippingLines ? (
          shippingLines.map((line, i) => (
            <p key={i} className="text-sm text-foreground">
              {line}
            </p>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No shipping address</p>
        )}
      </div>
      <div className={`${pCard} p-5 space-y-2`}>
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Billing Address</h3>
        {billingLines ? (
          billingLines.map((line, i) => (
            <p key={i} className="text-sm text-foreground">
              {line}
            </p>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Same as shipping</p>
        )}
      </div>
    </div>
  );
}
