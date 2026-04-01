'use client';

import { ShoppingCartBlock } from '@/types/blocks';

interface ShoppingCartBlockPreviewProps {
  block: ShoppingCartBlock;
  isSelected: boolean;
  onChange: (updates: Partial<ShoppingCartBlock>) => void;
}

export function ShoppingCartBlockPreview({ block, isSelected, onChange }: ShoppingCartBlockPreviewProps) {
  if (block.variant === 'icon-only') {
    return (
      <div className="py-4 px-6 flex justify-center">
        <div className="relative inline-flex items-center p-2 rounded-lg border border-border bg-card">
          <span className="material-icons text-2xl">shopping_cart</span>
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            3
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center absolute bottom-2">
          Cart icon widget
        </p>
      </div>
    );
  }

  if (block.variant === 'mini') {
    return (
      <div className="py-4 px-6 max-w-sm mx-auto">
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="material-icons">shopping_cart</span>
              <span className="font-semibold">Cart (3)</span>
            </div>
            {block.showSubtotal !== false && (
              <span className="font-bold">$129.97</span>
            )}
          </div>
          <div className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium text-center">
            {block.checkoutButtonText || 'Checkout'}
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4 italic">
          Preview: Mini cart widget
        </p>
      </div>
    );
  }

  // Full cart preview
  return (
    <div className="py-8 my-4 px-6 max-w-3xl mx-auto">
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <span className="material-icons">shopping_cart</span>
          <h2 className="font-semibold text-lg">Shopping Cart (3 items)</h2>
        </div>

        <div className="divide-y divide-border">
          {[
            { name: 'Classic T-Shirt', qty: 2, price: '$29.99' },
            { name: 'Running Shoes', qty: 1, price: '$89.99' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="w-16 h-16 rounded overflow-hidden bg-muted/10 flex-shrink-0 flex items-center justify-center">
                <span className="material-icons text-muted-foreground/30">inventory_2</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium">{item.name}</h3>
                <p className="text-sm text-muted-foreground">Qty: {item.qty}</p>
              </div>
              <div className="font-semibold">{item.price}</div>
            </div>
          ))}
        </div>

        {block.showSubtotal !== false && (
          <div className="flex items-center justify-between p-4 border-t border-border bg-muted/5">
            <span className="font-semibold">Subtotal</span>
            <span className="font-bold text-lg">$149.97</span>
          </div>
        )}

        <div className="p-4 border-t border-border">
          <div className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-md text-sm font-medium text-center">
            {block.checkoutButtonText || 'Proceed to Checkout'}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4 italic">
        Preview: Showing sample cart items. Live data loads from customer session.
      </p>
    </div>
  );
}
