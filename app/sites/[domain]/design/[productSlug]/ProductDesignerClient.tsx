'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductDesigner } from '@/components/product-designer';

interface ProductDesignerClientProps {
  siteId: number;
  websiteId: number;
  productId: string;
  productName: string;
  productSlug: string;
  initialDesignId?: string;
}

export function ProductDesignerClient({
  siteId,
  websiteId,
  productId,
  productName,
  productSlug,
  initialDesignId,
}: ProductDesignerClientProps) {
  // The CustomerAuthProvider only wraps /account/** pages. On the design
  // route we resolve the customer best-effort from the same token the
  // CustomerAuthContext stores in localStorage, then call the `me` action
  // ourselves. Anonymous users still get a working designer via the
  // session cart path.
  const [customerId, setCustomerId] = useState<number | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem(`customer_token_${siteId}`) : null;
    if (!token) return;
    fetch(`/api/storefront/${siteId}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'me' }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && res.data?.id) setCustomerId(res.data.id);
      })
      .catch(() => {});
  }, [siteId]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Slim header — the full storefront chrome would fight the editor
          for vertical space, so we replace it with a back link + title. */}
      <header className="flex items-center justify-between px-4 md:px-8 py-3 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-30">
        <Link
          href={`/shop/${productSlug}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-icons text-base">arrow_back</span>
          Back to product
        </Link>
        <div className="text-sm font-semibold truncate max-w-[60%] text-center">
          Customizing — {productName}
        </div>
        <div className="w-[120px]" />
      </header>

      <div className="flex-1 min-h-0">
        <ProductDesigner
          websiteId={websiteId}
          productId={productId}
          customerId={customerId}
          apiBaseUrl={`/api/storefront/${siteId}/designs`}
          initialDesignId={initialDesignId}
        />
      </div>
    </div>
  );
}
