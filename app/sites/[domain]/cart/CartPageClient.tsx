'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@/lib/utils/money';

interface CartItem {
  id: number;
  productId: number;
  variantId: number | null;
  designId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productName: string;
  productSlug: string;
  variantName: string | null;
  image: string | null;
  design: {
    id: number;
    name: string | null;
    thumbnailUrl: string | null;
  } | null;
}

interface CartPageClientProps {
  siteId: number;
  domain: string;
}

export function CartPageClient({ siteId, domain }: CartPageClientProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  // Lazy initializer: read localStorage once at mount so we never call
  // setState synchronously inside an effect (triggers the ESLint rule).
  const [sessionId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('cart_session_id') : null
  );
  // Only start in loading=true when there is actually a session to fetch.
  // When sessionId is null there is nothing to fetch — start false so the
  // empty-cart view renders immediately without a loading flash.
  const [loading, setLoading] = useState(() =>
    typeof window !== 'undefined' ? !!localStorage.getItem('cart_session_id') : false
  );
  const [updating, setUpdating] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    fetch(`/api/storefront/${siteId}/cart?sessionId=${sessionId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) {
          setItems(json.data.items || []);
          setSubtotal(json.data.subtotal || 0);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId, sessionId]);

  async function updateQty(itemId: number, qty: number) {
    if (!sessionId) return;
    setUpdating(itemId);
    try {
      const res = await fetch(`/api/storefront/${siteId}/cart`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartItemId: itemId, quantity: qty }),
      });
      const json = await res.json();
      if (json.success) {
        if (qty <= 0) {
          const next = items.filter(i => i.id !== itemId);
          setItems(next);
          setSubtotal(next.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
        } else {
          const next = items.map(i =>
            i.id === itemId ? { ...i, quantity: qty, lineTotal: i.unitPrice * qty } : i
          );
          setItems(next);
          setSubtotal(next.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(null);
    }
  }

  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const basePath = `/sites/${domain}`;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="w-20 h-20 bg-muted/30 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted/40 rounded w-2/3" />
                <div className="h-3 bg-muted/30 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span className="material-icons">shopping_cart</span>
        Shopping Cart
        {itemCount > 0 && (
          <span className="text-base font-normal text-muted-foreground">({itemCount} items)</span>
        )}
      </h1>

      {items.length === 0 ? (
        <div className="text-center py-16 border border-border rounded-xl bg-card">
          <span className="material-icons text-5xl text-muted-foreground/30 mb-3 block">shopping_cart</span>
          <p className="text-muted-foreground mb-6">Your cart is empty.</p>
          <Link
            href={`${basePath}/`}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">arrow_back</span>
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Line items */}
          <div className="border border-border rounded-xl bg-card overflow-hidden divide-y divide-border">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-4 p-4">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted/10 flex-shrink-0">
                  {item.image ? (
                    <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-icons text-muted-foreground/30">inventory_2</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.productName}</p>
                  {item.variantName && (
                    <p className="text-sm text-muted-foreground">{item.variantName}</p>
                  )}
                  {item.design && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <span className="material-icons text-xs">brush</span>
                      {item.design.name || 'Custom design'}
                    </p>
                  )}
                  <p className="text-sm font-semibold mt-1">{formatMoney(item.unitPrice)} each</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQty(item.id, item.quantity - 1)}
                    disabled={updating === item.id}
                    aria-label="Decrease quantity"
                    className="w-7 h-7 rounded border border-border flex items-center justify-center hover:bg-muted/50 transition-colors disabled:opacity-40"
                  >
                    <span className="material-icons text-sm">remove</span>
                  </button>
                  <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.id, item.quantity + 1)}
                    disabled={updating === item.id}
                    aria-label="Increase quantity"
                    className="w-7 h-7 rounded border border-border flex items-center justify-center hover:bg-muted/50 transition-colors disabled:opacity-40"
                  >
                    <span className="material-icons text-sm">add</span>
                  </button>
                </div>

                <div className="text-right min-w-[4rem]">
                  <p className="font-semibold">{formatMoney(item.unitPrice * item.quantity)}</p>
                  <button
                    onClick={() => updateQty(item.id, 0)}
                    disabled={updating === item.id}
                    aria-label="Remove item"
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals + CTA */}
          <div className="border border-border rounded-xl bg-card p-4 space-y-3">
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold">Subtotal</span>
              <span className="font-bold">{formatMoney(subtotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Shipping and taxes calculated at checkout.</p>

            <Link
              href={`${basePath}/checkout`}
              className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-base">lock</span>
              Proceed to Checkout
            </Link>

            <Link
              href={`${basePath}/`}
              className="flex items-center justify-center gap-1.5 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="material-icons text-sm">arrow_back</span>
              Continue Shopping
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
