'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DesignerShell } from '@/components/storefront/designer/DesignerShell';
import type { DesignDoc, DesignerSurface } from '@/lib/designer/types';

interface DesignerClientProps {
  siteId: number;
  domain: string;
  product: { id: number; slug: string; name: string };
  surfaces: DesignerSurface[];
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

export function DesignerClient({ siteId, product, surfaces }: DesignerClientProps) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>('');
  const [initialDesign, setInitialDesign] = useState<DesignDoc | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    async (file: File, designId?: string): Promise<{ url: string; width: number; height: number }> => {
      if (!designId) throw new Error('Design must be created before uploading assets');
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
    [siteId, sessionId],
  );

  const onAddToCart = useCallback(
    async (designId: string, thumbnailDataUrl?: string): Promise<void> => {
      try {
        // 1. Finalize the design (server snapshots a thumbnail if provided).
        await fetch(`/api/storefront/${siteId}/designs/${designId}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thumbnail: thumbnailDataUrl, sessionId }),
        });

        // 2. Add the customized line to the cart.
        const cartRes = await fetch(`/api/storefront/${siteId}/cart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            productId: product.id,
            quantity: 1,
            designId,
          }),
        });
        const cartJson = await cartRes.json();
        if (!cartJson.success) {
          setError(cartJson.message || 'Failed to add to cart');
          return;
        }

        window.dispatchEvent(new CustomEvent('cart-updated'));
        router.push('/cart');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add to cart');
      }
    },
    [siteId, product.id, sessionId, router],
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
      <DesignerShell
        productId={product.id}
        productName={product.name}
        surfaces={surfaces}
        initialDesign={initialDesign}
        onCreate={onCreate}
        onSave={onSave}
        onUploadImage={onUploadImage}
        onAddToCart={onAddToCart}
      />
    </div>
  );
}
