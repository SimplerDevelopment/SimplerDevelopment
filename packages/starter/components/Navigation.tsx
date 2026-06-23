'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { NavItem, Branding } from '@simplerdevelopment/sdk';

interface NavigationProps {
  siteName: string;
  items: NavItem[];
  branding: Branding;
}

export default function Navigation({ siteName, items, branding }: NavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="border-b"
      style={{
        backgroundColor: branding.navBackground || 'white',
        color: branding.navTextColor || 'inherit',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.logoAlt || siteName} className="h-8" />
          ) : (
            <span className="text-xl font-bold">{siteName}</span>
          )}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {items.map(item => (
            <NavLink key={item.id} item={item} />
          ))}
        </nav>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="md:hidden border-t px-4 py-4 space-y-3">
          {items.map(item => (
            <NavLink key={item.id} item={item} mobile />
          ))}
        </nav>
      )}
    </header>
  );
}

function NavLink({ item, mobile }: { item: NavItem; mobile?: boolean }) {
  const base = mobile ? 'block py-1' : '';
  const className = item.isButton
    ? `${base} px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-medium`
    : `${base} text-sm hover:opacity-70 transition-opacity`;

  return (
    <Link
      href={item.href}
      className={className}
      target={item.openInNewTab ? '_blank' : undefined}
      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
    >
      {item.label}
    </Link>
  );
}
