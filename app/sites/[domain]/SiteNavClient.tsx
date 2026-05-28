'use client';

import { useState, useEffect, useRef } from 'react';
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
  bodyFont?: string;
  /** 'classic' (default), 'transparent', 'bold', 'mega'. 'mega' uses bold rest-state styling and shows mega-menu panels on hover. */
  navTemplate?: string;
  /** Prefix applied to every internal href. Empty when the site is served at
   *  the root of its own host (production); set to "/sites/{domain}" when
   *  accessed via the main app host (local dev / portal preview). */
  basePath?: string;
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
  bodyFont,
  navTemplate,
  basePath = '',
}: SiteNavClientProps) {
  // Resolve font stacks once (matches what the live Post Captain site uses:
  // Poppins for display/headings, DM Sans for body copy).
  const headingFontStack = headingFont ? `"${headingFont}", sans-serif` : 'system-ui, sans-serif';
  const bodyFontStack = bodyFont ? `"${bodyFont}", sans-serif` : 'system-ui, sans-serif';
  // Prepend basePath to internal absolute paths. External URLs, hash-only
  // anchors, and already-prefixed paths pass through unchanged.
  const resolveHref = (href: string): string => {
    if (!basePath) return href;
    if (!href || /^https?:\/\//.test(href) || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return href;
    if (!href.startsWith('/')) return href;
    if (href === basePath || href.startsWith(`${basePath}/`)) return href;
    return `${basePath}${href}`;
  };
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<number | null>(null);
  // Debounced close so the cursor can travel from trigger → bridge → panel
  // without losing the hover state. Any incoming open cancels the pending close.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openDropdownNow = (id: number) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpenDropdown(id);
  };
  const closeDropdownSoon = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpenDropdown(null), 180);
  };
  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

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

  const isMega = navTemplate === 'mega';
  // 'bold' / 'mega' templates share the centered uppercase + pill CTA layout.
  const isBoldLayout = navTemplate === 'bold' || isMega;
  const linkClass = isBoldLayout
    ? 'transition-colors duration-300'
    : 'transition-colors duration-300';
  // Inline styles for the trigger text — Poppins 500 / 16px / uppercase / 0.16px
  // tracking — match the live Post Captain top nav.
  const linkInlineStyle = isBoldLayout
    ? {
        fontFamily: headingFontStack,
        fontSize: '16px',
        fontWeight: 500,
        letterSpacing: '0.16px',
        textTransform: 'uppercase' as const,
      }
    : { fontSize: '14px', fontWeight: 500, letterSpacing: '0.02em' };
  // Classic template: bump muted link color from b3 (70%) → e6 (90%) so links
  // stay legible against dark nav backgrounds (e.g. Cardiff's #1c3370). The
  // previous 70% alpha was borderline-AA on dark blues. Hex `e6` ≈ 0.9 alpha.
  const linkColor = isBoldLayout ? currentText : `${currentText}e6`;
  const containerClass = isBoldLayout
    ? 'mx-auto flex items-center'
    : 'mx-auto max-w-7xl px-6 py-4 flex items-center justify-between';
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const containerStyle = isBoldLayout
    ? {
        maxWidth: '1440px',
        paddingLeft: isMobile ? '16px' : '32px',
        paddingRight: isMobile ? '16px' : '32px',
        paddingTop: isMobile ? '14px' : '20px',
        paddingBottom: isMobile ? '14px' : '20px',
        gap: isMobile ? '8px' : '24px',
      } as const
    : undefined;
  const logoClass = isBoldLayout
    ? 'object-contain transition-all duration-300 shrink-0'
    : 'h-10 w-auto transition-all duration-300';
  const logoStyle = isBoldLayout
    ? {
        height: isMobile ? '28px' : '36px',
        width: 'auto',
        maxWidth: isMobile ? '140px' : '220px',
        objectFit: 'contain' as const,
      }
    : undefined;
  // Visibility for the desktop link group is driven by inline `display` (via
  // isMobile) rather than `hidden lg:flex` because some embedded forms
  // (Slate Reach in particular) inject an inline `<style>` tag with
  // `.hidden { display: none }` that loads AFTER the Tailwind bundle and
  // thereby beats `.lg\:flex`. Inline styles trump the external rule.
  const regularGroupClass = isBoldLayout
    ? 'flex-1 items-center justify-center whitespace-nowrap'
    : 'items-center gap-8';
  const regularGroupStyle = {
    display: isMobile ? 'none' : 'flex',
    ...(isBoldLayout ? { gap: '32px' as const } : {}),
  };
  const ctaClass = isBoldLayout
    ? 'inline-block uppercase transition-colors duration-300 shrink-0'
    : 'ml-2 inline-block transition-all duration-300 shrink-0 whitespace-nowrap';
  const ctaStyle = isBoldLayout
    ? {
        paddingLeft: '28px',
        paddingRight: '28px',
        paddingTop: '12px',
        paddingBottom: '12px',
        fontFamily: headingFontStack,
        fontSize: '14px',
        fontWeight: 600,
        letterSpacing: '0.16px',
        borderRadius: '9999px',
        borderWidth: '2px',
        borderStyle: 'solid',
      }
    : {
        // Classic CTA: bump prominence so the button reads as a real call to
        // action and not just another nav link. Matches Cardiff/Slate-style
        // chunky pill buttons (~16px / 700 / 12-15px vertical padding).
        paddingLeft: '26px',
        paddingRight: '26px',
        paddingTop: '12px',
        paddingBottom: '12px',
        fontFamily: headingFontStack,
        fontSize: '15px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        lineHeight: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      };

  // The active mega panel is rendered ONCE outside the link group so it can
  // be horizontally centered relative to the nav, not the trigger link.
  const activeMegaParent = isMega
    ? regularItems.find(i => i.id === openDropdown && (i.children?.length ?? 0) > 0) ?? null
    : null;

  const renderMegaPanel = (parent: NavItem) => {
    const columns = parent.children ?? [];
    if (columns.length === 0) return null;

    const colCount = Math.min(columns.length, 5);
    const colWidth = colCount <= 3 ? 240 : 210;
    const panelWidth = Math.min(colCount * colWidth, 1200);

    return (
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
          border: '1px solid rgba(0,0,0,0.06)',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: `repeat(${colCount}, 1fr)`,
          width: `${panelWidth}px`,
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
          {columns.map((column, idx) => {
            const items = column.children ?? [];
            return (
              <div
                key={column.id}
                style={{
                  padding: '24px 24px',
                  borderLeft: idx > 0 ? `1px solid ${primaryColor}1f` : 'none',
                  minWidth: 0,
                }}
              >
                {column.icon && (
                  <span
                    className="material-icons"
                    style={{ display: 'block', color: primaryColor, fontSize: '28px', marginBottom: '12px' }}
                  >
                    {column.icon}
                  </span>
                )}
                <Link
                  href={resolveHref(column.href)}
                  style={{ display: 'block', textDecoration: 'none' }}
                  {...(column.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {/* Heading: Poppins 600 / 20px / uppercase / 0.5px tracking — matches live PC */}
                  <div
                    style={{
                      fontFamily: headingFontStack,
                      color: primaryColor,
                      fontSize: '20px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      lineHeight: '23px',
                    }}
                  >
                    {column.label}
                  </div>
                  {column.description && (
                    /* Description: DM Sans 400 / 16px / #555 — matches live PC */
                    <div
                      style={{
                        fontFamily: bodyFontStack,
                        color: '#555555',
                        fontSize: '16px',
                        fontWeight: 400,
                        marginTop: '8px',
                        lineHeight: 1.4,
                      }}
                    >
                      {column.description}
                    </div>
                  )}
                </Link>
                {column.featuredImage && (
                  <Link
                    href={resolveHref(column.href)}
                    style={{ display: 'block', marginTop: '12px', borderRadius: '6px', overflow: 'hidden' }}
                    {...(column.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    <img
                      src={column.featuredImage}
                      alt={column.label}
                      style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
                    />
                  </Link>
                )}
                {items.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {items.map((leaf) => (
                      <li key={leaf.id}>
                        <Link
                          href={resolveHref(leaf.href)}
                          style={{
                            display: 'block',
                            fontFamily: bodyFontStack,
                            color: primaryColor,
                            fontSize: '16px',
                            fontWeight: 500,
                            letterSpacing: '0.16px',
                            lineHeight: 1.3,
                            textDecoration: 'none',
                            transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                          {...(leaf.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        >
                          {leaf.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    );
  };

  const renderClassicDropdown = (item: NavItem) => (
    <div className="absolute top-full left-0 pt-2">
      <div
        className="rounded-sm min-w-[240px] py-2"
        style={{
          backgroundColor: '#ffffff',
          boxShadow: `0 10px 40px ${secondaryColor}15`,
          border: '1px solid #e8f0fe',
        }}
      >
        {(item.children ?? []).map((child) => (
          <Link
            key={child.id}
            href={resolveHref(child.href)}
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
  );

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
      style={{
        backgroundColor: currentBg,
        borderBottom: currentBorder,
        ...(showScrolled && isTransparent ? { backdropFilter: 'blur(12px)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' } : {}),
      }}
    >
      <div className={containerClass} style={containerStyle}>
        {/* Logo / Site Name */}
        <Link href={resolveHref('/')} className="flex items-center gap-3 group">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={logoAlt}
              className={logoClass}
              style={{
                ...logoStyle,
                filter: isTransparent && showScrolled ? 'brightness(0)' : 'none',
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

        {/* Desktop nav: regular links */}
        <div className={regularGroupClass} style={regularGroupStyle}>
          {regularItems.map((item) => {
            const hasChildren = !!item.children && item.children.length > 0;
            const isOpen = openDropdown === item.id;

            if (!hasChildren) {
              return (
                <Link
                  key={item.id}
                  href={resolveHref(item.href)}
                  className={linkClass}
                  style={{ ...linkInlineStyle, color: linkColor }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = primaryColor; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = linkColor; }}
                  {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {item.label}
                </Link>
              );
            }

            // In mega mode the panel is rendered once at nav level (below),
            // so per-link dropdowns are skipped to avoid duplicate panels.
            return (
              <div
                key={item.id}
                style={{ position: 'relative' }}
                onMouseEnter={() => openDropdownNow(item.id)}
                onMouseLeave={closeDropdownSoon}
              >
                <Link
                  href={resolveHref(item.href)}
                  className={linkClass}
                  // Use a slightly muted variant of the link color on open instead of
                  // primaryColor — primary blue against a dark-blue navBg is invisible.
                  style={{
                    ...linkInlineStyle,
                    color: isOpen ? `${currentText}b3` : linkColor,
                    opacity: isOpen ? 0.85 : 1,
                  }}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                >
                  {item.label}
                </Link>
                {isOpen && !isMega && renderClassicDropdown(item)}
              </div>
            );
          })}
        </div>

        {/* CTA button items — visible on both desktop and mobile (mobile shows
            a slightly smaller variant). On mobile the first button sits between
            the logo and the hamburger, matching the live Post Captain header.
            Inline display avoids the Slate-form `.hidden { display: none }` clash. */}
        <div
          className="items-center"
          style={{
            display: isMobile ? 'none' : 'flex',
            ...(isBoldLayout ? { marginLeft: 'auto' } : {}),
          }}
        >
          {buttonItems.map((item) => (
            <Link
              key={item.id}
              href={resolveHref(item.href)}
              className={ctaClass}
              style={{
                ...ctaStyle,
                backgroundColor: buttonStyle?.primaryBg || '#ffffff',
                color: buttonStyle?.primaryText || primaryColor,
                ...(isBoldLayout
                  ? { borderColor: buttonStyle?.primaryBg || '#ffffff' }
                  : { borderRadius: buttonStyle?.borderRadius || '6px' }),
              }}
              onMouseEnter={(e) => {
                // Classic CTA: subtle hover lift to telegraph interactivity
                // (bold/mega already has a fully styled outline-pill that
                // doesn't need this).
                if (!isBoldLayout) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                  e.currentTarget.style.filter = 'brightness(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isBoldLayout) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
                  e.currentTarget.style.filter = 'none';
                }
              }}
              {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Mobile-only right-side group: shrunken CTA + hamburger.
            Wrapping them keeps the hamburger from being pushed off-screen by
            the CTA's auto-margin. Inline display avoids the Slate-form
            `.hidden { display: none }` clash. */}
        <div
          className="items-center"
          style={{ display: isMobile ? 'flex' : 'none', marginLeft: 'auto', gap: '8px' }}
        >
          {isBoldLayout && buttonItems.length > 0 && (
            <Link
              href={resolveHref(buttonItems[0].href)}
              className="inline-block uppercase transition-colors duration-300 shrink-0 whitespace-nowrap"
              style={{
                paddingLeft: '14px',
                paddingRight: '14px',
                paddingTop: '8px',
                paddingBottom: '8px',
                fontFamily: headingFontStack,
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.1px',
                borderRadius: '9999px',
                borderWidth: '2px',
                borderStyle: 'solid',
                backgroundColor: buttonStyle?.primaryBg || '#ffffff',
                color: buttonStyle?.primaryText || primaryColor,
                borderColor: buttonStyle?.primaryBg || '#ffffff',
              }}
              onClick={() => setMenuOpen(false)}
              {...(buttonItems[0].openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {buttonItems[0].label}
            </Link>
          )}

          {/* Hamburger / close */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex flex-col"
            style={{ gap: '5px', padding: '6px' }}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="block transition-all duration-300"
                style={{
                  width: '22px',
                  height: '2px',
                  backgroundColor: currentText,
                  ...(menuOpen && i === 0 ? { transform: 'translateY(7px) rotate(45deg)' } : {}),
                  ...(menuOpen && i === 1 ? { opacity: 0 } : {}),
                  ...(menuOpen && i === 2 ? { transform: 'translateY(-7px) rotate(-45deg)' } : {}),
                }}
              />
            ))}
          </button>
        </div>
      </div>

      {/* Shared mega-menu panel — rendered at nav level so it can be horizontally
          centered relative to the nav (not the trigger link). The hover-able
          inner div has paddingTop so the cursor can travel through that bridge
          between trigger and panel without losing hover. Combined with the
          debounced close (closeDropdownSoon), this prevents flicker dismissals. */}
      {activeMegaParent && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{ pointerEvents: 'auto', paddingTop: '12px' }}
            onMouseEnter={() => openDropdownNow(activeMegaParent.id)}
            onMouseLeave={closeDropdownSoon}
          >
            {renderMegaPanel(activeMegaParent)}
          </div>
        </div>
      )}

      {/* Mobile menu — full-screen white panel with accordion top-level items
          and column cards inside, mirroring the postcaptain.com mobile pattern.
          Visibility driven by inline display so external CSS (e.g. Slate forms)
          can't override it. */}
      <div
        style={{
          display: isMobile ? 'block' : 'none',
          position: 'fixed',
          top: '64px',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#ffffff',
          overflowY: 'auto',
          transform: menuOpen ? 'translateY(0)' : 'translateY(-100%)',
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? 'auto' : 'none',
          transition: 'transform 0.3s ease, opacity 0.2s ease',
          zIndex: 40,
        }}
      >
        <div style={{ padding: '8px 24px 32px' }}>
          {regularItems.map((item) => {
            const hasChildren = !!item.children && item.children.length > 0;
            const expanded = mobileExpanded === item.id;

            if (!hasChildren) {
              return (
                <Link
                  key={item.id}
                  href={resolveHref(item.href)}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: '20px 0',
                    fontFamily: headingFontStack,
                    fontSize: '22px',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    color: primaryColor,
                    borderBottom: `1px solid ${primaryColor}1f`,
                    textDecoration: 'none',
                  }}
                  {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {item.label}
                </Link>
              );
            }

            return (
              <div
                key={item.id}
                style={{ borderBottom: `1px solid ${primaryColor}1f` }}
              >
                <button
                  type="button"
                  onClick={() => setMobileExpanded(expanded ? null : item.id)}
                  aria-expanded={expanded}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '20px 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: headingFontStack,
                    fontSize: '22px',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    color: primaryColor,
                    textAlign: 'left',
                  }}
                >
                  <span>{item.label}</span>
                  <span
                    className="material-icons"
                    style={{
                      fontSize: '24px',
                      color: primaryColor,
                      transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform 0.2s',
                    }}
                  >
                    expand_more
                  </span>
                </button>
                {expanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '16px' }}>
                    {(item.children ?? []).map((column) => {
                      const leafs = column.children ?? [];
                      return (
                        <div
                          key={column.id}
                          style={{
                            backgroundColor: `${primaryColor}14`,
                            borderRadius: '8px',
                            padding: '20px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            {column.icon && (
                              <span
                                className="material-icons"
                                style={{ color: primaryColor, fontSize: '28px' }}
                              >
                                {column.icon}
                              </span>
                            )}
                            <Link
                              href={resolveHref(column.href)}
                              onClick={() => setMenuOpen(false)}
                              style={{
                                fontFamily: headingFontStack,
                                fontSize: '18px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                color: primaryColor,
                                textDecoration: 'none',
                              }}
                              {...(column.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            >
                              {column.label}
                            </Link>
                          </div>
                          {column.description && (
                            <div
                              style={{
                                fontFamily: bodyFontStack,
                                fontSize: '15px',
                                fontWeight: 400,
                                color: '#555555',
                                lineHeight: 1.4,
                                marginBottom: leafs.length > 0 || column.featuredImage ? '12px' : 0,
                              }}
                            >
                              {column.description}
                            </div>
                          )}
                          {column.featuredImage && (
                            <Link
                              href={resolveHref(column.href)}
                              onClick={() => setMenuOpen(false)}
                              style={{ display: 'block', borderRadius: '6px', overflow: 'hidden', marginBottom: leafs.length > 0 ? '12px' : 0 }}
                              {...(column.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            >
                              <img
                                src={column.featuredImage}
                                alt={column.label}
                                style={{ width: '100%', height: 'auto', objectFit: 'cover', display: 'block' }}
                              />
                            </Link>
                          )}
                          {leafs.length > 0 && (
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {leafs.map((leaf) => (
                                <li key={leaf.id}>
                                  <Link
                                    href={resolveHref(leaf.href)}
                                    onClick={() => setMenuOpen(false)}
                                    style={{
                                      display: 'block',
                                      fontFamily: bodyFontStack,
                                      fontSize: '16px',
                                      fontWeight: 500,
                                      letterSpacing: '0.16px',
                                      color: primaryColor,
                                      textDecoration: 'none',
                                    }}
                                    {...(leaf.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                  >
                                    {leaf.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer CTA — outline pill button matching live "BOOK A FREE DISCOVERY SESSION" */}
          {buttonItems.length > 0 && (
            <div style={{ marginTop: '32px', textAlign: 'center' }}>
              <p style={{ fontFamily: bodyFontStack, color: '#555555', fontSize: '15px', marginBottom: '16px' }}>
                Talk to a Slate Expert to help launch your next project.
              </p>
              {buttonItems.map((item) => (
                <Link
                  key={item.id}
                  href={resolveHref(item.href)}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'inline-block',
                    padding: '16px 40px',
                    fontFamily: headingFontStack,
                    fontSize: '14px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.16px',
                    color: primaryColor,
                    backgroundColor: '#ffffff',
                    border: `2px solid ${primaryColor}`,
                    borderRadius: '9999px',
                    textDecoration: 'none',
                  }}
                  {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
