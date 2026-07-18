'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCustomerAuth } from './CustomerAuthContext';
import { RequireAuth } from './RequireAuth';
import { AccountLayout } from './AccountLayout';

interface DesignSummary {
  id: string;
  name: string;
  productId: number;
  productSlug: string;
  productName: string;
  thumbnailUrl: string | null;
  lastAccessedAt: string | null;
  updatedAt: string | null;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const delta = Date.now() - then;
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function MyDesignsPanel({ siteId, domain }: { siteId: number; domain: string }) {
  const { token } = useCustomerAuth();
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/storefront/${siteId}/designs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) setDesigns(res.data as DesignSummary[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteId, token]);

  return (
    <RequireAuth>
      <AccountLayout siteId={siteId} domain={domain}>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Designs</h1>
            <p className="text-gray-500 text-sm mt-1">
              Custom designs you&apos;ve saved. Pick one up where you left off.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <span
                className="material-icons text-gray-300 animate-spin"
                style={{ fontSize: '32px' }}
              >
                progress_activity
              </span>
            </div>
          ) : designs.length === 0 ? (
            <div className="border border-gray-200 rounded-xl p-12 text-center">
              <span className="material-icons text-gray-300" style={{ fontSize: '48px' }}>
                brush
              </span>
              <p className="text-sm text-gray-500 mt-3">
                You haven&apos;t saved any designs yet. Start customizing a product.
              </p>
              <Link
                href="/shop"
                className="inline-block mt-4 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
              >
                Browse Products
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {designs.map((design) => (
                <Link
                  key={design.id}
                  href={`/design/${design.productSlug}?designId=${design.id}`}
                  className="border border-gray-200 rounded-xl overflow-hidden group hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="aspect-square bg-gray-100 relative">
                    {design.thumbnailUrl ? (
                      <img
                        src={design.thumbnailUrl}
                        alt={design.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span
                          className="material-icons text-gray-300"
                          style={{ fontSize: '48px' }}
                        >
                          image
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-1">
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">
                      {design.name || 'Untitled design'}
                    </p>
                    <p className="text-xs text-gray-500 line-clamp-1">{design.productName}</p>
                    <p className="text-xs text-gray-400">
                      {formatRelative(design.lastAccessedAt || design.updatedAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </AccountLayout>
    </RequireAuth>
  );
}
