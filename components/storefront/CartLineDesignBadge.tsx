'use client';

// Renders the saved-design thumbnail + name + "Edit design" link for a cart
// line. Used by the storefront cart UI (ShoppingCartBlockRender today, the
// account/order pages later) so the customer can see exactly which version
// of their design is sitting in the cart and jump back into the editor.
//
// The "Edit design" link points at /design/<productSlug>?designId=<id>.
// That route (app/sites/[domain]/design/[productSlug]/page.tsx) accepts an
// optional initialDesignId so the editor opens with that saved canvas.

import Link from 'next/link';

interface CartLineDesignBadgeProps {
  design: {
    id: number;
    uuid: string | null;
    name: string | null;
    thumbnailUrl: string | null;
  };
  productSlug?: string;
}

export function CartLineDesignBadge({ design, productSlug }: CartLineDesignBadgeProps) {
  return (
    <div className="mt-2 flex items-center gap-2">
      {design.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={design.thumbnailUrl}
          alt={design.name || 'Saved design'}
          className="w-16 h-16 rounded border border-border object-cover bg-white"
        />
      ) : (
        <div className="w-16 h-16 rounded border border-border bg-muted/20 flex items-center justify-center">
          <span className="material-icons text-muted-foreground/40 text-base">brush</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs italic text-muted-foreground truncate">
          {design.name || 'Untitled design'}
        </p>
        {productSlug && (
          <Link
            href={`/design/${productSlug}?designId=${design.id}`}
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-[14px]">edit</span>
            Edit design
          </Link>
        )}
      </div>
    </div>
  );
}
