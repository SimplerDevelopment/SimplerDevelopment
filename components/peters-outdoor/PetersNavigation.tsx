'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navLinks = [
  { label: 'Home', href: '/p/home' },
  { label: 'About', href: '/p/about' },
  { label: 'Tours', href: '/p/tours' },
  { label: 'Reviews', href: '/p/reviews' },
  { label: 'Gallery', href: '/p/gallery' },
];

export function PetersNavigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="absolute top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/p/home" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--po-forest)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--po-gold)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
            </svg>
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-tight" style={{ fontFamily: 'var(--font-playfair), serif' }}>W.H. Peters</div>
            <div className="text-white/60 text-[10px] uppercase tracking-widest">Outdoor Adventures</div>
          </div>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 text-sm rounded-full transition-colors ${
                  isActive
                    ? 'bg-[var(--po-forest)] text-white'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/p/booking"
            className="ml-3 px-5 py-2 text-sm font-medium rounded-full bg-[var(--po-gold)] text-[var(--po-forest)] hover:bg-[var(--po-gold)]/90 transition-colors"
          >
            Book a Tour
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-white p-2"
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

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[var(--po-forest)]/95 backdrop-blur-sm border-t border-white/10">
          <div className="px-6 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/p/booking"
              onClick={() => setMobileOpen(false)}
              className="block mt-3 px-4 py-3 text-center font-medium rounded-full bg-[var(--po-gold)] text-[var(--po-forest)]"
            >
              Book a Tour
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
