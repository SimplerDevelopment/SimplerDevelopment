'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCustomerAuth } from './CustomerAuthContext';

interface AccountLayoutProps {
  siteId: number;
  domain: string;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: '/account', label: 'Dashboard', icon: 'dashboard', exact: true },
  { href: '/account/orders', label: 'Orders', icon: 'receipt_long' },
  { href: '/account/designs', label: 'My Designs', icon: 'brush' },
  { href: '/account/wishlist', label: 'Wishlist', icon: 'favorite' },
  { href: '/account/support', label: 'Support', icon: 'support_agent' },
  { href: '/account/profile', label: 'Profile', icon: 'person' },
];

export function AccountLayout({ siteId, domain, children }: AccountLayoutProps) {
  const pathname = usePathname();
  const { customer, logout } = useCustomerAuth();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 hidden md:block">
          <div className="sticky top-8 space-y-1">
            {customer && (
              <div className="pb-4 mb-4 border-b border-gray-200">
                <p className="text-sm font-semibold text-gray-900">
                  {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email}
                </p>
                <p className="text-xs text-gray-500 truncate">{customer.email}</p>
              </div>
            )}

            {NAV_ITEMS.map(item => {
              const isActive = item.exact
                ? pathname === `/account` || pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="material-icons text-lg" style={{ fontSize: '20px' }}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}

            <button
              onClick={logout}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full"
            >
              <span className="material-icons text-lg" style={{ fontSize: '20px' }}>logout</span>
              Sign Out
            </button>
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden w-full mb-6">
          <div className="flex gap-1 overflow-x-auto pb-2 border-b border-gray-200">
            {NAV_ITEMS.map(item => {
              const isActive = item.exact
                ? pathname === `/account` || pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <span className="material-icons" style={{ fontSize: '16px' }}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
