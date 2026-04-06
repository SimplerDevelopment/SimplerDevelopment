'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { NavItem } from '@/lib/actions/client-sites';

interface SiteNavClientProps {
  siteName: string;
  navItems: NavItem[];
  isTransparent: boolean;
  navBg: string;
  navText: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  logoAlt: string;
  buttonStyle?: {
    primaryBg?: string;
    primaryText?: string;
    borderRadius?: string;
  };
  headingFont?: string;
}

export function SiteNavClient({
  siteName,
  navItems,
  isTransparent,
  navBg,
  navText,
  primaryColor,
  secondaryColor,
  logoUrl,
  logoAlt,
  buttonStyle,
  headingFont,
}: SiteNavClientProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // When transparent, show scrolled style after scroll
  const showScrolled = isTransparent ? scrolled : true;
  const currentBg = showScrolled ? (isTransparent ? 'rgba(255,255,255,0.95)' : navBg) : 'transparent';
  const currentText = showScrolled ? (isTransparent ? secondaryColor : navText) : '#ffffff';
  const currentBorder = showScrolled ? `1px solid ${primaryColor}15` : 'none';

  // Split nav items: regular links vs button CTA
  const regularItems = navItems.filter(item => !item.isButton);
  const buttonItems = navItems.filter(item => item.isButton);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
      style={{
        backgroundColor: currentBg,
        borderBottom: currentBorder,
        ...(showScrolled && isTransparent ? { backdropFilter: 'blur(12px)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' } : {}),
      }}
    >
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        {/* Logo / Site Name */}
        <Link href="/" className="flex items-center gap-3 group">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={logoAlt}
              className="h-10 w-auto transition-all duration-300"
              style={{
                filter: showScrolled ? 'brightness(0)' : 'none',
              }}
            />
          ) : (
            <span
              className="text-xl font-bold transition-colors duration-300"
              style={{ color: currentText, fontFamily: headingFont ? `"${headingFont}", serif` : undefined }}
            >
              {siteName}
            </span>
          )}
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-8">
          {regularItems.map((item) => (
            item.children && item.children.length > 0 ? (
              <div
                key={item.id}
                className="relative group"
                onMouseEnter={() => setOpenDropdown(item.id)}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <Link
                  href={item.href}
                  className="text-sm tracking-wide transition-colors duration-300"
                  style={{ color: `${currentText}b3` }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = primaryColor; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = `${currentText}b3`; }}
                >
                  {item.label}
                </Link>
                {openDropdown === item.id && (
                  <div className="absolute top-full left-0 pt-2">
                    <div
                      className="rounded-sm min-w-[240px] py-2"
                      style={{
                        backgroundColor: '#ffffff',
                        boxShadow: `0 10px 40px ${secondaryColor}15`,
                        border: '1px solid #e8f0fe',
                      }}
                    >
                      {item.children.map((child) => (
                        <Link
                          key={child.id}
                          href={child.href}
                          className="block px-5 py-2.5 text-sm transition-colors duration-200"
                          style={{ color: `${secondaryColor}b3` }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = primaryColor; e.currentTarget.style.backgroundColor = '#f4f7fc'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = `${secondaryColor}b3`; e.currentTarget.style.backgroundColor = 'transparent'; }}
                          {...(child.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={item.id}
                href={item.href}
                className="text-sm tracking-wide transition-colors duration-300"
                style={{ color: `${currentText}b3` }}
                onMouseEnter={(e) => { e.currentTarget.style.color = primaryColor; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = `${currentText}b3`; }}
                {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {item.label}
              </Link>
            )
          ))}

          {/* CTA button items */}
          {buttonItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="ml-2 px-5 py-2 text-sm font-medium transition-colors duration-300"
              style={{
                backgroundColor: buttonStyle?.primaryBg || primaryColor,
                color: buttonStyle?.primaryText || secondaryColor,
                borderRadius: buttonStyle?.borderRadius || '2px',
              }}
              {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="lg:hidden flex flex-col gap-1.5 p-2"
          aria-label="Toggle menu"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block w-6 h-px transition-all duration-300"
              style={{
                backgroundColor: currentText,
                ...(menuOpen && i === 0 ? { transform: 'rotate(45deg) translateY(4px)' } : {}),
                ...(menuOpen && i === 1 ? { opacity: 0 } : {}),
                ...(menuOpen && i === 2 ? { transform: 'rotate(-45deg) translateY(-4px)' } : {}),
              }}
            />
          ))}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className="lg:hidden overflow-hidden transition-all duration-500"
        style={{
          maxHeight: menuOpen ? '600px' : '0',
          borderBottom: menuOpen ? `1px solid ${primaryColor}33` : 'none',
        }}
      >
        <div className="px-6 py-4 flex flex-col gap-3" style={{ backgroundColor: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(12px)' }}>
          {navItems.map((item) => (
            item.isButton ? (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="mt-2 px-5 py-2 text-sm font-medium text-center transition-colors"
                style={{
                  backgroundColor: buttonStyle?.primaryBg || primaryColor,
                  color: buttonStyle?.primaryText || secondaryColor,
                  borderRadius: buttonStyle?.borderRadius || '2px',
                }}
              >
                {item.label}
              </Link>
            ) : (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="text-sm tracking-wide transition-colors"
                style={{ color: `${secondaryColor}b3` }}
              >
                {item.label}
              </Link>
            )
          ))}
        </div>
      </div>
    </nav>
  );
}
