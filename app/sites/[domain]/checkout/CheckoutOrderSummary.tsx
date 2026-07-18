'use client';

import type { CartItem, ShippingRate, CheckoutResult } from './checkout-types';
import { formatPrice } from './checkout-types';

export interface CheckoutOrderSummaryProps {
  items: CartItem[];
  cartSubtotal: number;
  selectedRate: ShippingRate | undefined;
  shippingCost: number;
  displayTotal: number;
  displayCurrency: string;
}

export function CheckoutOrderSummary({
  items,
  cartSubtotal,
  selectedRate,
  shippingCost,
  displayTotal,
  displayCurrency,
}: CheckoutOrderSummaryProps) {
  return (
    <div className="lg:col-span-2">
      <div className="border border-border rounded-xl bg-card p-5 sticky top-24 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <span className="material-icons text-base">receipt</span>
          Order Summary
        </h2>

        <div className="divide-y divide-border">
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-3 py-3">
              <div className="w-12 h-12 rounded-md overflow-hidden bg-muted/10 flex-shrink-0">
                {item.image ? (
                  <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-icons text-sm text-muted-foreground/30">inventory_2</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.productName}</p>
                {item.variantName && <p className="text-xs text-muted-foreground">{item.variantName}</p>}
                <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
              </div>
              <p className="text-sm font-semibold flex-shrink-0">{formatPrice(item.unitPrice * item.quantity)}</p>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 pt-1 text-sm border-t border-border">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatPrice(cartSubtotal)}</span>
          </div>
          {selectedRate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>{shippingCost === 0 ? 'Free' : formatPrice(shippingCost)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-1 border-t border-border mt-1">
            <span>Total</span>
            <span>{formatPrice(displayTotal, displayCurrency)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-export CheckoutResult type so callers can import from this file if needed
export type { CheckoutResult };
