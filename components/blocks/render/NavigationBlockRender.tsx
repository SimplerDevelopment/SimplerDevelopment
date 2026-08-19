'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { NavigationBlock } from '@/types/blocks';
import { getClientSiteNavItems, type NavItem } from '@/lib/actions/client-sites';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface NavigationBlockRenderProps {
  block: NavigationBlock;
  siteId?: number;
}

/**
 * Block-placeable site navigation.
 *
 * Unlike every other block this one carries no authored content — it fetches
 * the live nav tree for `siteId` from `site_navigation` (via the same
 * `getClientSiteNavItems` server action the legacy `SiteNavClient` chrome and
 * the portal nav manager both read) so menu edits propagate to every page
 * using the block without a republish. Mirrors the client-fetch-via-server-
 * action shape of `BlogPostsBlockRender` — the block system's other
 * data-driven renderer.
 *
 * `siteId` is undefined inside the block-tree editor iframe (see
 * `EditableBlockRenderer`, which doesn't thread a siteId through — the same
 * gap `ProductGridBlockRender` already has), so we render an empty shell
 * rather than fetch there.
 *
 * On real site renders, `app/sites/[domain]/[[...slug]]/page.tsx` walks the
 * block tree server-side via `lib/blocks/prefetch-navigation.ts` and attaches
 * the nav tree as `block.initialItems` before this component ever mounts —
 * so the SSR HTML already has the links and no skeleton/client fetch is
 * needed (this used to be the dominant CLS source on every page, ITM-016).
 * Content saved before this shipped, and the editor iframe, have no
 * `initialItems` and fall through to the client fetch below unchanged.
 */
export function NavigationBlockRender({ block, siteId }: NavigationBlockRenderProps) {
  const hasPrefetchedItems = !!block.initialItems;
  const [navItems, setNavItems] = useState<NavItem[]>(block.initialItems ?? []);
  // Lazy-initialized on `siteId`'s presence at mount so the "no siteId" path
  // (the block-tree editor iframe — see the class doc above) never needs a
  // synchronous setState inside the effect below. Server-prefetched content
  // never needs the loading state at all.
  const [loading, setLoading] = useState(() => !!siteId && !hasPrefetchedItems);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!siteId || hasPrefetchedItems) return;
    async function fetchNav() {
      try {
        setLoading(true);
        const items = await getClientSiteNavItems(siteId as number);
        if (!cancelled) setNavItems(items);
      } catch (error) {
        console.error('Error fetching site navigation:', error);
        if (!cancelled) setNavItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchNav();
    return () => {
      cancelled = true;
    };
  }, [siteId, hasPrefetchedItems]);

  // Close the mobile panel on Escape from anywhere in the nav.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  // ── Presentational defaults — neutral, no brand/client specifics. ─────────
  const backgroundColor = block.backgroundColor || '#ffffff';
  const backgroundImage = block.backgroundImage || undefined;
  const linkColor = block.linkColor || '#1e293b';
  const linkHoverColor = block.linkHoverColor || '#2563eb';
  const linkFontSize = block.linkFontSize || undefined;
  const linkFontStyle = block.linkFontStyle || undefined;
  const linkLetterSpacing = block.linkLetterSpacing || undefined;
  const ctaBackgroundColor = block.ctaBackgroundColor || '#111827';
  const ctaTextColor = block.ctaTextColor || '#ffffff';
  const ctaHoverBackgroundColor = block.ctaHoverBackgroundColor || '#1e293b';
  const ctaBorderRadius = block.ctaBorderRadius || '9999px';
  const dropdownBackgroundColor = block.dropdownBackgroundColor || '#ffffff';
  const dropdownLinkColor = block.dropdownLinkColor || '#1e293b';
  const sticky = block.sticky !== false;
  const containerMaxWidth = block.containerMaxWidth || '1280px';
  const logoHeight = block.logoHeight || '32px';

  const regularItems = navItems.filter((item) => !item.isButton);
  const buttonItems = navItems.filter((item) => item.isButton);

  return (
    <nav
      className={sticky ? 'sticky top-0 z-50' : 'relative'}
      style={{ backgroundColor, backgroundImage, fontFamily: block.fontFamily || undefined }}
      aria-label="Primary"
    >
      <div
        className="mx-auto flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"
        style={{ maxWidth: containerMaxWidth }}
      >
        <Link href="/" className="flex shrink-0 items-center" aria-label="Home" style={getElementCSS(block.elementStyles, 'logo')}>
          {block.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- cross-tenant asset URLs, not part of the Next image pipeline
            <img src={block.logoUrl} alt={block.logoAlt || ''} style={{ height: logoHeight, width: 'auto' }} />
          ) : (
            <span style={{ color: linkColor, fontWeight: 700, fontSize: '1.125rem' }}>{block.logoAlt || 'Site'}</span>
          )}
        </Link>

        <ul className="hidden items-center gap-8 lg:flex" role="menubar">
          {loading
            ? [0, 1, 2].map((i) => (
                <li key={i} className="h-4 w-14 animate-pulse rounded bg-black/10" aria-hidden="true" />
              ))
            : regularItems.map((item) => (
                <DesktopNavItem
                  key={item.id}
                  item={item}
                  linkColor={linkColor}
                  linkHoverColor={linkHoverColor}
                  linkFontSize={linkFontSize}
                  linkFontStyle={linkFontStyle}
                  linkLetterSpacing={linkLetterSpacing}
                  dropdownBackgroundColor={dropdownBackgroundColor}
                  dropdownLinkColor={dropdownLinkColor}
                />
              ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          {buttonItems.map((item) => (
            <CtaLink
              key={item.id}
              item={item}
              backgroundColor={ctaBackgroundColor}
              textColor={ctaTextColor}
              hoverBackgroundColor={ctaHoverBackgroundColor}
              borderRadius={ctaBorderRadius}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          {buttonItems[0] && (
            <CtaLink
              item={buttonItems[0]}
              backgroundColor={ctaBackgroundColor}
              textColor={ctaTextColor}
              hoverBackgroundColor={ctaHoverBackgroundColor}
              borderRadius={ctaBorderRadius}
              compact
            />
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="nav-block-mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="-mr-2 rounded p-2"
            style={{ color: linkColor }}
          >
            <span className="material-icons" aria-hidden="true">{menuOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </div>

      <div
        id="nav-block-mobile-menu"
        className={`overflow-hidden transition-[max-height] duration-300 ease-in-out lg:hidden ${
          menuOpen ? 'max-h-[80vh] overflow-y-auto border-t' : 'max-h-0'
        }`}
        style={{ backgroundColor, borderColor: `${linkColor}1a` }}
      >
        <ul className="px-4 py-2 sm:px-6">
          {regularItems.map((item) => (
            <MobileNavItem
              key={item.id}
              item={item}
              linkColor={linkColor}
              linkFontSize={linkFontSize}
              linkFontStyle={linkFontStyle}
              linkLetterSpacing={linkLetterSpacing}
              onNavigate={() => setMenuOpen(false)}
            />
          ))}
        </ul>
      </div>
    </nav>
  );
}

// ─── Desktop dropdown item ──────────────────────────────────────────────────
// Hover-open with a debounced close (so the cursor can travel from trigger to
// panel), plus focus/blur so keyboard tabbing opens/closes the same panel —
// the debounce only matters for the mouse path, focus is immediate.
function DesktopNavItem({
  item,
  linkColor,
  linkHoverColor,
  linkFontSize,
  linkFontStyle,
  linkLetterSpacing,
  dropdownBackgroundColor,
  dropdownLinkColor,
}: {
  item: NavItem;
  linkColor: string;
  linkHoverColor: string;
  linkFontSize?: string;
  linkFontStyle?: string;
  linkLetterSpacing?: string;
  dropdownBackgroundColor: string;
  dropdownLinkColor: string;
}) {
  const linkTypeStyle = { fontSize: linkFontSize, fontStyle: linkFontStyle, letterSpacing: linkLetterSpacing };
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLLIElement>(null);
  const hasChildren = !!item.children && item.children.length > 0;

  const openNow = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  if (!hasChildren) {
    return (
      <li>
        <Link
          href={item.href}
          className="text-sm font-medium transition-colors"
          style={{ color: linkColor, ...linkTypeStyle }}
          onMouseEnter={(e) => { e.currentTarget.style.color = linkHoverColor; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = linkColor; }}
          {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {item.label}
        </Link>
      </li>
    );
  }

  return (
    <li
      ref={rootRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onFocus={openNow}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          (rootRef.current?.querySelector('a') as HTMLAnchorElement | null)?.focus();
        }
      }}
    >
      <Link
        href={item.href}
        className="flex items-center gap-1 text-sm font-medium transition-colors"
        style={{ color: linkColor, ...linkTypeStyle }}
        aria-haspopup="true"
        aria-expanded={open}
        {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {item.label}
        <span className="material-icons" style={{ fontSize: '18px', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} aria-hidden="true">
          expand_more
        </span>
      </Link>
      {open && (
        <ul
          role="menu"
          className="absolute left-0 top-full min-w-[220px] rounded-md py-2 shadow-lg"
          style={{ backgroundColor: dropdownBackgroundColor, marginTop: '4px' }}
        >
          {item.children!.map((child) => (
            <li key={child.id} role="none">
              <Link
                href={child.href}
                role="menuitem"
                className="block px-4 py-2 text-sm transition-colors"
                style={{ color: dropdownLinkColor }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${dropdownLinkColor}0d`; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                {...(child.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── Mobile accordion item ──────────────────────────────────────────────────
function MobileNavItem({
  item,
  linkColor,
  linkFontSize,
  linkFontStyle,
  linkLetterSpacing,
  onNavigate,
}: {
  item: NavItem;
  linkColor: string;
  linkFontSize?: string;
  linkFontStyle?: string;
  linkLetterSpacing?: string;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = !!item.children && item.children.length > 0;
  const linkTypeStyle = { fontSize: linkFontSize, fontStyle: linkFontStyle, letterSpacing: linkLetterSpacing };

  if (!hasChildren) {
    return (
      <li className="border-b" style={{ borderColor: `${linkColor}1a` }}>
        <Link
          href={item.href}
          onClick={onNavigate}
          className="block py-3 text-base font-medium"
          style={{ color: linkColor, ...linkTypeStyle }}
          {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {item.label}
        </Link>
      </li>
    );
  }

  return (
    <li className="border-b" style={{ borderColor: `${linkColor}1a` }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between py-3 text-left text-base font-medium"
        style={{ color: linkColor, ...linkTypeStyle }}
      >
        <span>{item.label}</span>
        <span className="material-icons" style={{ fontSize: '20px', transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} aria-hidden="true">
          expand_more
        </span>
      </button>
      {expanded && (
        <ul className="pb-2 pl-4">
          {item.children!.map((child) => (
            <li key={child.id}>
              <Link
                href={child.href}
                onClick={onNavigate}
                className="block py-2 text-sm opacity-80"
                style={{ color: linkColor }}
                {...(child.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── CTA button ─────────────────────────────────────────────────────────────
function CtaLink({
  item,
  backgroundColor,
  textColor,
  hoverBackgroundColor,
  borderRadius,
  compact,
}: {
  item: NavItem;
  backgroundColor: string;
  textColor: string;
  hoverBackgroundColor: string;
  borderRadius: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`inline-flex items-center font-medium transition-colors ${compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}`}
      style={{ backgroundColor, color: textColor, borderRadius }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = hoverBackgroundColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = backgroundColor; }}
      {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {item.label}
    </Link>
  );
}
