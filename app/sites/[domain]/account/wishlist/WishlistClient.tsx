'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCustomerAuth } from '@/components/storefront/account/CustomerAuthContext';
import { RequireAuth } from '@/components/storefront/account/RequireAuth';
import { AccountLayout } from '@/components/storefront/account/AccountLayout';
import { formatMoney } from '@/lib/utils/money';

interface WishlistItem {
  id: number;
  productId: number;
  productName: string;
  productSlug: string;
  price: number;
  imageUrl?: string;
}

export function WishlistClient({ siteId, domain }: { siteId: number; domain: string }) {
  const { token } = useCustomerAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/storefront/${siteId}/account/wishlist`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(res => { if (res.success) setItems(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteId, token]);

  const removeItem = async (productId: number) => {
    if (!token) return;
    setRemovingId(productId);
    try {
      const res = await fetch(`/api/storefront/${siteId}/account/wishlist`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (data.success) {
        setItems(prev => prev.filter(i => i.productId !== productId));
      }
    } catch {
      // silently fail
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <RequireAuth>
      <AccountLayout siteId={siteId} domain={domain}>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Wishlist</h1>
            <p className="text-gray-500 text-sm mt-1">Products you&apos;ve saved for later.</p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <span className="material-icons text-gray-300 animate-spin" style={{ fontSize: '32px' }}>progress_activity</span>
            </div>
          ) : items.length === 0 ? (
            <div className="border border-gray-200 rounded-xl p-12 text-center">
              <span className="material-icons text-gray-300" style={{ fontSize: '48px' }}>favorite_border</span>
              <p className="text-sm text-gray-500 mt-3">Your wishlist is empty.</p>
              <Link href="/shop" className="inline-block mt-4 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">
                Browse Products
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(item => (
                <div key={item.id} className="border border-gray-200 rounded-xl overflow-hidden group">
                  {/* Image */}
                  <div className="aspect-square bg-gray-100 relative">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-icons text-gray-300" style={{ fontSize: '48px' }}>image</span>
                      </div>
                    )}
                    <button
                      onClick={() => removeItem(item.productId)}
                      disabled={removingId === item.productId}
                      className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full shadow-sm flex items-center justify-center hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Remove from wishlist"
                    >
                      <span className="material-icons text-gray-400 hover:text-red-500" style={{ fontSize: '18px' }}>
                        {removingId === item.productId ? 'progress_activity' : 'close'}
                      </span>
                    </button>
                  </div>
                  {/* Info */}
                  <div className="p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.productName}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-1">{formatMoney(item.price)}</p>
                    </div>
                    <Link
                      href={`/shop/${item.productSlug}`}
                      className="block w-full text-center px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      View Product
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AccountLayout>
    </RequireAuth>
  );
}
