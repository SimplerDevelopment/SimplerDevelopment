'use client';

import { ShoppingCartBlock } from '@/types/blocks';
import { useEffect, useState } from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { CartLineDesignBadge } from '@/components/storefront/CartLineDesignBadge';
import { formatMoney } from '@/lib/utils/money';

interface CartItem {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  productName?: string;
  productSlug?: string;
  image?: string | null;
  product?: {
    name: string;
    image: string | null;
    slug: string;
  };
  // Set when the customer added a saved design to the cart (see
  // /api/storefront/[siteId]/cart GET enrichment).
  design?: {
    id: number;
    uuid: string | null;
    name: string | null;
    thumbnailUrl: string | null;
  } | null;
}

interface ShoppingCartBlockRenderProps {
  block: ShoppingCartBlock;
  siteId?: number;
}

export function ShoppingCartBlockRender({ block, siteId }: ShoppingCartBlockRenderProps) {
  const branding = useBranding();
  const bs = branding?.buttonStyle;
  const btnRadius = bs?.borderRadius || branding?.borderRadius;
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;

    async function fetchCart() {
      try {
        setLoading(true);
        const sessionId = typeof window !== 'undefined'
          ? localStorage.getItem('cart_session_id') || ''
          : '';
        if (!sessionId) {
          setLoading(false);
          return;
        }
        const res = await fetch(`/api/storefront/${siteId}/cart?sessionId=${sessionId}`);
        const json = await res.json();
        if (json.success && json.data?.items) {
          setItems(json.data.items);
        }
      } catch (error) {
        console.error('Error fetching cart:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchCart();
  }, [siteId]);

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  if (block.variant === 'icon-only') {
    return (
      <a href="/cart" className="relative inline-flex items-center p-2 rounded-lg hover:bg-accent transition-colors">
        <span className="material-icons text-2xl">shopping_cart</span>
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {itemCount}
          </span>
        )}
      </a>
    );
  }

  if (block.variant === 'mini') {
    return (
      <div className="border border-border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="material-icons">shopping_cart</span>
            <span className="font-semibold">Cart ({itemCount})</span>
          </div>
          {block.showSubtotal !== false && itemCount > 0 && (
            <span className="font-bold">{formatMoney(subtotal)}</span>
          )}
        </div>
        {itemCount > 0 ? (
          <a
            href="/checkout"
            className={`block w-full px-4 py-2 bg-primary text-primary-foreground text-sm font-medium text-center hover:bg-primary/90 transition-colors ${!btnRadius ? 'rounded-md' : ''}`}
            style={{ ...(bs?.primaryBg ? { backgroundColor: bs.primaryBg } : {}), ...(bs?.primaryText ? { color: bs.primaryText } : {}), ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
          >
            {block.checkoutButtonText || 'Checkout'}
          </a>
        ) : (
          <p className="text-sm text-muted-foreground text-center">
            {block.emptyCartMessage || 'Your cart is empty'}
          </p>
        )}
      </div>
    );
  }

  // Full cart
  return (
    <section>
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b border-border">
            <span className="material-icons">shopping_cart</span>
            <h2 className="font-semibold text-lg">Shopping Cart ({itemCount} items)</h2>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="w-16 h-16 bg-muted/30 rounded" />
                  <div className="flex-1">
                    <div className="h-4 bg-muted/50 rounded mb-1 w-2/3" />
                    <div className="h-3 bg-muted/30 rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="divide-y divide-border">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-4">
                    <div className="w-16 h-16 rounded overflow-hidden bg-muted/10 flex-shrink-0">
                      {item.product?.image ? (
                        <img src={item.product.image} alt={item.product?.name || ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-icons text-muted-foreground/30">inventory_2</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{item.product?.name || item.productName || `Product #${item.productId}`}</h3>
                      <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                      {item.design && (
                        <CartLineDesignBadge
                          design={item.design}
                          productSlug={item.product?.slug || item.productSlug}
                        />
                      )}
                    </div>
                    <div className="font-semibold">{formatMoney(item.unitPrice * item.quantity)}</div>
                  </div>
                ))}
              </div>
              {block.showSubtotal !== false && (
                <div className="flex items-center justify-between p-4 border-t border-border bg-muted/5">
                  <span className="font-semibold">Subtotal</span>
                  <span className="font-bold text-lg">{formatMoney(subtotal)}</span>
                </div>
              )}
              <div className="p-4 border-t border-border">
                <a
                  href="/checkout"
                  className={`block w-full px-4 py-3 bg-primary text-primary-foreground text-sm font-medium text-center hover:bg-primary/90 transition-colors ${!btnRadius ? 'rounded-md' : ''}`}
                  style={{ ...(bs?.primaryBg ? { backgroundColor: bs.primaryBg } : {}), ...(bs?.primaryText ? { color: bs.primaryText } : {}), ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
                >
                  {block.checkoutButtonText || 'Proceed to Checkout'}
                </a>
              </div>
            </>
          ) : (
            <div className="p-8 text-center">
              <span className="material-icons text-5xl text-muted-foreground/30 mb-3 block">shopping_cart</span>
              <p className="text-muted-foreground">
                {block.emptyCartMessage || 'Your cart is empty. Start shopping!'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
