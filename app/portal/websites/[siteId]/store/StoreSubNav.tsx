'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

// Store sub-navigation — rendered by store/layout.tsx on every store page.
// Mirrors the quick-links that previously lived only on the dashboard, but
// persistent across all /store/* routes with an active-section indicator.
const ITEMS: Array<{ label: string; icon: string; seg: string }> = [
  { label: 'Dashboard', icon: 'dashboard', seg: '' },
  { label: 'Products', icon: 'inventory_2', seg: 'products' },
  { label: 'Orders', icon: 'receipt_long', seg: 'orders' },
  { label: 'Shipping', icon: 'local_shipping', seg: 'shipping' },
  { label: 'Discounts', icon: 'sell', seg: 'discounts' },
  { label: 'Categories', icon: 'category', seg: 'categories' },
  { label: 'Settings', icon: 'settings', seg: 'settings' },
];

export default function StoreSubNav() {
  const { siteId } = useParams<{ siteId: string }>();
  const pathname = usePathname();
  const baseHref = `/portal/websites/${siteId}/store`;

  return (
    <nav className="border-b border-border mb-6">
      <div className="flex items-center gap-1 overflow-x-auto">
        {ITEMS.map((item) => {
          const href = item.seg ? `${baseHref}/${item.seg}` : baseHref;
          // Dashboard matches only the exact store root; sections match their
          // subtree (so e.g. /store/orders/123 keeps "Orders" active).
          const active = item.seg
            ? pathname === href || pathname.startsWith(`${href}/`)
            : pathname === baseHref;
          return (
            <Link
              key={item.label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
