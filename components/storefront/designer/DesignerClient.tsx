'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DesignerShell } from '@/components/storefront/designer/DesignerShell';
import EffectsFloating from '@/components/storefront/designer/EffectsFloating';
import ExportButton from '@/components/storefront/designer/ExportButton';
import TemplatesDrawer from '@/components/storefront/designer/TemplatesDrawer';
import { useCanvasStore } from '@/lib/designer/canvasStore';
import type { DesignDoc, DesignerSurface } from '@/lib/designer/types';

interface DesignerClientProps {
  siteId: number;
  domain: string;
  product: {
    id: number;
    slug: string;
    name: string;
    /** Base price in cents — what's stored on the products row. */
    priceCents?: number;
    /** ISO 4217 code, e.g. "USD". Defaults to USD if not supplied. */
    currency?: string;
  };
  surfaces: DesignerSurface[];
  /**
   * Where to send the customer after a successful add-to-cart. The storefront
   * doesn't ship a built-in cart page — the merchant builds one in the CMS —
   * so the default is to stay put and surface a success message; pass a path
   * here when a cart page exists.
   */
  afterAddToCartPath?: string;
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sessionId = localStorage.getItem('cart_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('cart_session_id', sessionId);
  }
  return sessionId;
}

export function DesignerClient({ siteId, product, surfaces, afterAddToCartPath }: DesignerClientProps) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>('');
  const [initialDesign, setInitialDesign] = useState<DesignDoc | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Bootstrap sessionId + any existing draft design for this product/session.
  useEffect(() => {
    let cancelled = false;
    const sid = getOrCreateSessionId();
    setSessionId(sid);

    (async () => {
      try {
        const params = new URLSearchParams({
          sessionId: sid,
          productId: String(product.id),
          status: 'draft',
        });
        // Best-effort lookup of an existing draft. The endpoint may not yet
        // exist; if it 404s we just start fresh.
        const res = await fetch(`/api/storefront/${siteId}/designs?${params}`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.success && json.data) {
            const list = Array.isArray(json.data) ? json.data : [json.data];
            const existing = list[0];
            if (existing) {
              setInitialDesign({
                id: existing.id,
                name: existing.name,
                productId: existing.productId,
                layersBySurface: existing.layersBySurface || {},
                canvasSize: existing.canvasSize || { width: 800, height: 600, dpi: 72 },
                status: existing.status || 'draft',
              } as DesignDoc);
            }
          }
        }
      } catch {
        /* fresh start is fine */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [siteId, product.id]);

  const onCreate = useCallback(
    async (doc: DesignDoc): Promise<{ id: string }> => {
      const res = await fetch(`/api/storefront/${siteId}/designs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          name: doc.name || `${product.name} design`,
          sessionId,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to create design');
      return { id: json.data.id };
    },
    [siteId, product.id, product.name, sessionId],
  );

  const onSave = useCallback(
    async (doc: DesignDoc): Promise<void> => {
      if (!doc.id) return;
      const res = await fetch(`/api/storefront/${siteId}/designs/${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: doc.name,
          layersBySurface: doc.layersBySurface,
          canvasSize: doc.canvasSize,
          status: doc.status || 'draft',
          sessionId,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Save failed');
    },
    [siteId, sessionId],
  );

  const onUploadImage = useCallback(
    async (file: File): Promise<{ url: string; width: number; height: number }> => {
      // The image-upload endpoint hangs off /designs/[id]/assets, so we need
      // a saved design first. Callers (AddLayerPanel's file picker, the
      // canvas drop zone) only know about the File — we read the current
      // designId from the canvas store and auto-create an empty design when
      // none exists yet, so the very first action a customer takes can be
      // an image upload.
      let designId = useCanvasStore.getState().designId;
      if (!designId) {
        const res = await fetch(`/api/storefront/${siteId}/designs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: product.id,
            name: `${product.name} design`,
            sessionId,
          }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Failed to create design');
        designId = json.data.id as string;
        // Seed the store so subsequent autosaves PUT instead of POSTing again.
        useCanvasStore
          .getState()
          .setDesign(designId, json.data.name || product.name, product.id);
      }
      const form = new FormData();
      form.append('file', file);
      form.append('sessionId', sessionId);
      const res = await fetch(`/api/storefront/${siteId}/designs/${designId}/assets`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Upload failed');
      return {
        url: json.data.url,
        width: json.data.width || 0,
        height: json.data.height || 0,
      };
    },
    [siteId, sessionId, product.id, product.name],
  );

  const onAddToCart = useCallback(
    async (designId: string, quantity: number = 1): Promise<void> => {
      try {
        // 1. Finalize the design (server snapshots a thumbnail if provided).
        await fetch(`/api/storefront/${siteId}/designs/${designId}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });

        // 2. Add the customized line to the cart.
        const cartRes = await fetch(`/api/storefront/${siteId}/cart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            productId: product.id,
            quantity: Math.max(1, Math.min(999, Math.floor(quantity) || 1)),
            designId,
          }),
        });
        const cartJson = await cartRes.json();
        if (!cartJson.success) {
          setError(cartJson.message || 'Failed to add to cart');
          return;
        }

        window.dispatchEvent(new CustomEvent('cart-updated'));
        setToast({ kind: 'success', text: 'Added to cart!' });
        // Only redirect when the host product/storefront supplies a cart
        // page path — otherwise stay put and let the customer keep designing.
        if (afterAddToCartPath) {
          router.push(afterAddToCartPath);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add to cart');
      }
    },
    [siteId, product.id, sessionId, router, afterAddToCartPath],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="material-icons animate-spin text-primary text-3xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="h-screen w-full">
      {error && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 shadow-lg">
          <span className="material-icons text-base">error</span>
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 p-0.5 hover:bg-red-100 dark:hover:bg-red-900/40 rounded"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>
      )}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 p-3 rounded-xl text-sm shadow-lg ${
            toast.kind === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400'
              : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
          }`}
        >
          <span className="material-icons text-base">
            {toast.kind === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.text}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 p-0.5 hover:bg-black/5 dark:hover:bg-white/10 rounded"
            aria-label="Dismiss"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>
      )}
      <DesignerShell
        productId={product.id}
        productName={product.name}
        productPriceCents={product.priceCents}
        currency={product.currency}
        exitHref={`/${product.slug}`}
        surfaces={surfaces}
        initialDesign={initialDesign}
        onCreate={onCreate}
        onSave={onSave}
        onUploadImage={onUploadImage}
        onAddToCart={onAddToCart}
      />
      {/* Floating designer-utility mounts — siblings of DesignerShell so
          they don't conflict with the wave-2/3 panels living inside it. */}
      <EffectsFloating />
      <TemplatesDrawer siteId={siteId} productId={product.id} />
      <ExportButton />
    </div>
  );
}
