'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef, type MouseEvent } from 'react';
import { signOut } from 'next-auth/react';
import CompanySwitcher from './CompanySwitcher';
import { buildPortalNavItems, type PortalNavChild, type PortalNavItem } from '@/lib/portal-nav';
import type { UserAppNavMeta } from '@/lib/plugins/load-user-apps';
import type { SerializableEntitlements } from '@/app/portal/PortalShell';
import { useAgencyChrome } from './AgencyChromeProvider';
import { getDomainByKey } from '@/lib/billing/domain-catalog';

type Theme = 'light' | 'dark' | 'system';
const themeOrder: Theme[] = ['system', 'light', 'dark'];
const themeIcon: Record<Theme, string> = { light: 'light_mode', dark: 'dark_mode', system: 'brightness_auto' };
const themeLabel: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' };

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  if (theme === 'system') {
    root.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } else {
    root.classList.add(theme);
  }
}

type NavChild = PortalNavChild;
type NavItem = PortalNavItem;

interface NavService {
  id: number;
  name: string;
  category: string;
  icon: string;
  href: string;
  subscribed: boolean;
}

const EXCLUDED_SERVICES = new Set([
  'Chat Bot', 'Project Management System', 'Pitch Decks',
  'Email Marketing', 'Monthly Maintenance', 'White Label Domain', 'All-In-One',
  'Websites', 'Surveys', 'Surveys & Forms', 'Hosting & DNS',
]);

function isItemActive(item: { href: string; exact?: boolean; alsoActiveOn?: string }, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  if (pathname === item.href || pathname.startsWith(item.href + '/')) return true;
  if (item.alsoActiveOn && pathname.startsWith(item.alsoActiveOn)) return true;
  return false;
}

function isChildActive(children: NavChild[] | undefined, pathname: string): boolean {
  if (!children) return false;
  return children.some(c => isItemActive(c, pathname) || isChildActive(c.children, pathname));
}

// Walk the nav tree to find the path from the root down to `targetHref`,
// returning the list of hrefs along that chain (inclusive). Powers accordion
// toggling — opening a node sets only its ancestor chain expanded.
function findAncestorChain(items: NavChild[], targetHref: string): string[] | null {
  for (const item of items) {
    if (item.href === targetHref) return [item.href];
    if (item.children) {
      const sub = findAncestorChain(item.children, targetHref);
      if (sub) return [item.href, ...sub];
    }
  }
  return null;
}

// Walk the nav tree following the active branch (parents whose children
// match the current pathname). Returns the chain of group hrefs that should
// be expanded for the active route.
function activeExpandChain(items: NavChild[], pathname: string): string[] {
  for (const item of items) {
    if (!item.children) continue;
    if (isItemActive(item, pathname) || isChildActive(item.children, pathname)) {
      return [item.href, ...activeExpandChain(item.children, pathname)];
    }
  }
  return [];
}

interface PortalSidebarProps {
  /** Plugin apps the active client is entitled to see. Threaded down from
   *  the server-component `PortalShell` wrapper so the sidebar can render
   *  the "Apps" group without an extra round-trip. */
  apps?: UserAppNavMeta[];
  /** Billing-domain entitlements used to gate nav items. Threaded down from
   *  `PortalShell`. When absent, all items are shown unlocked. */
  entitlements?: SerializableEntitlements;
  /** Persistent rail on `lg+` (normal pages). When false the sidebar only
   *  exists as a mobile/overlay drawer (full-screen editor pages keep their
   *  width). */
  persistent?: boolean;
  /** Desktop icon-rail collapse. Only takes visual effect on `lg+`; the mobile
   *  drawer always renders full-width with labels. */
  collapsed?: boolean;
  /** Mobile drawer open state (lifted to the layout so the topbar hamburger
   *  can open it). */
  mobileOpen?: boolean;
  /** Close the mobile drawer (called after navigating, on backdrop click). */
  onCloseMobile?: () => void;
  /** Expand the desktop rail (used when a collapsed group icon is clicked). */
  onExpandRail?: () => void;
}

export default function PortalSidebar({
  apps,
  entitlements,
  persistent = true,
  collapsed = false,
  mobileOpen = false,
  onCloseMobile,
  onExpandRail,
}: PortalSidebarProps = {}) {
  const pathname = usePathname();
  const { brandName, brandLogoUrl, agencyPrimaryColor, whiteLabelEnabled } = useAgencyChrome();

  // When an agency primary color is configured, override the active-nav
  // background with it so the sidebar accent matches the agency's brand.
  // Undefined/null means no override — the default accent-soft + stripe applies.
  const agencyActiveStyle = whiteLabelEnabled && agencyPrimaryColor
    ? { backgroundColor: agencyPrimaryColor, color: '#fff' }
    : undefined;
  const [theme, setTheme] = useState<Theme>('system');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [navServices, setNavServices] = useState<NavService[]>([]);
  const [activeSiteName, setActiveSiteName] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  // Hover popover for a locked nav item — teases the module's price + a CTA.
  // Fixed-positioned (anchored to the hovered row) so the sidebar's
  // overflow-y-auto doesn't clip it.
  const [lockPopover, setLockPopover] = useState<{ top: number; left: number; key: string } | null>(null);
  const [popVisible, setPopVisible] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openLockPopover = (e: MouseEvent<HTMLElement>, key: string) => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    const r = e.currentTarget.getBoundingClientRect();
    setLockPopover({
      top: Math.max(8, Math.min(r.top, window.innerHeight - 280)),
      left: r.right + 8,
      key,
    });
    // Mount hidden, then reveal next frame so the slide/fade transition fires.
    setPopVisible(false);
    requestAnimationFrame(() => setPopVisible(true));
  };
  const closeLockPopoverSoon = () => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => setLockPopover(null), 150);
  };
  const keepLockPopover = () => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
  };

  // Detect CMS context
  const cmsMatch = pathname.match(/^\/portal\/websites\/(\d+)(\/|$)/);
  const activeSiteId = cmsMatch ? cmsMatch[1] : null;

  // Fetch active site name
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern, predates this change
    if (!activeSiteId) { setActiveSiteName(null); return; }
    fetch('/api/portal/cms/websites')
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          const site = res.data.find((s: { id: number }) => String(s.id) === activeSiteId);
          setActiveSiteName(site?.name ?? null);
        }
      })
      .catch(() => {});
  }, [activeSiteId]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern, predates this change
    if (savedTheme && themeOrder.includes(savedTheme)) setTheme(savedTheme);
  }, []);

  // Fetch services for nav
  useEffect(() => {
    fetch('/api/portal/services/nav')
      .then(r => r.json())
      .then(res => { if (res.success) setNavServices(res.data); })
      .catch(() => {});
  }, [pathname]);

  // Poll pending MCP-approvals count (every 60s)
  useEffect(() => {
    let cancelled = false;
    const fetchCount = () => {
      fetch('/api/portal/approvals?count=true')
        .then(r => r.json())
        .then(res => { if (!cancelled && res.success) setPendingCount(res.data.count ?? 0); })
        .catch(() => {});
    };
    fetchCount();
    const t = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [pathname]);

  // Reconstruct Set<string> from the serializable prop so buildPortalNavItems
  // can do a fast O(1) domain lookup. Recomputed only when the prop changes.
  const entitlementSet = entitlements
    ? { domains: new Set(entitlements.domains), gatingBypassed: entitlements.gatingBypassed }
    : undefined;

  // Accordion auto-expand: on route change, expand only the active chain
  // and collapse every other branch. Manual toggles below stay accordion-y.
  useEffect(() => {
    const items = buildPortalNavItems(activeSiteId, activeSiteName, apps, entitlementSet);
    const chain = activeExpandChain(items, pathname);
    const next: Record<string, boolean> = {};
    for (const h of chain) next[h] = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern, predates this change
    setExpandedSections(next);
  // entitlementSet is a new object on every render; use the stable source prop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, activeSiteId, activeSiteName, apps, entitlements]);

  // Build final nav items with injected services
  const navItems: NavItem[] = (() => {
    const items = buildPortalNavItems(activeSiteId, activeSiteName, apps, entitlementSet);
    // Dedupe injected services against the base nav (and each other) by href —
    // some catalog services map to a route the base nav already owns (e.g.
    // Pitches & Proposals → /portal/tools/pitch-decks), which otherwise renders
    // the item twice and collides React keys. Collect hrefs recursively so a
    // service mapping to a now-NESTED route (e.g. /portal/email under Marketing)
    // is still deduped, not surfaced as a stray top-level item.
    const seenHrefs = new Set<string>();
    const collectHrefs = (nodes: NavChild[]) => {
      for (const n of nodes) {
        seenHrefs.add(n.href);
        if (n.children) collectHrefs(n.children);
      }
    };
    collectHrefs(items);
    const serviceItems: NavItem[] = [];
    for (const svc of navServices) {
      if (EXCLUDED_SERVICES.has(svc.name) || svc.name.startsWith('__')) continue;
      // Don't surface "request a service" links in the main nav — services are
      // bought self-serve from the plans page now, not requested from the
      // sidebar. (Services in a known category still link to their feature page,
      // e.g. Bookings → /portal/tools/booking; only the /request fallbacks drop.)
      if (svc.href.endsWith('/request')) continue;
      if (seenHrefs.has(svc.href)) continue;
      seenHrefs.add(svc.href);
      serviceItems.push({ href: svc.href, label: svc.name, icon: svc.icon });
    }
    const settingsIdx = items.findIndex(i => i.href === '/portal/settings');
    if (settingsIdx >= 0) {
      items.splice(settingsIdx, 0, ...serviceItems);
    } else {
      items.push(...serviceItems);
    }
    return items;
  })();

  const cycleTheme = () => {
    const next = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length];
    setTheme(next);
    localStorage.setItem('theme', next);
    applyTheme(next);
  };

  const toggleSection = (href: string) => {
    setExpandedSections(prev => {
      const wasExpanded = !!prev[href];
      const chain = findAncestorChain(navItems, href);
      if (!chain) {
        // Fallback if href isn't found in the tree (e.g. injected service).
        return { ...prev, [href]: !prev[href] };
      }
      if (wasExpanded) {
        // Collapse this group and any descendants. Keep ancestors open so
        // collapsing a sub-group doesn't also close its parent.
        const ancestors = new Set(chain.slice(0, -1));
        const next: Record<string, boolean> = {};
        for (const k of Object.keys(prev)) {
          if (prev[k] && ancestors.has(k)) next[k] = true;
        }
        return next;
      }
      // Expanding: keep only this node's chain. Every sibling branch and
      // unrelated open group collapses (accordion behavior).
      const next: Record<string, boolean> = {};
      for (const h of chain) next[h] = true;
      return next;
    });
  };

  // Renders a nav item link (or parent toggle)
  const renderNavLink = (
    item: { href: string; label: string; icon: string; exact?: boolean; alsoActiveOn?: string; children?: NavChild[]; locked?: boolean; requiredDomain?: string },
    depth: number,
  ) => {
    const hasChildren = item.children && item.children.length > 0;
    const isLocked = !!item.locked;
    const active = !isLocked && isItemActive(item, pathname);
    const childActive = !isLocked && isChildActive(item.children, pathname);
    const isExpanded = expandedSections[item.href];
    const depthPadding: Record<number, string> = {
      0: 'px-3',
      1: 'pl-8 pr-3',
      2: 'pl-11 pr-3',
      3: 'pl-14 pr-3',
    };
    const pl = depthPadding[depth] ?? 'pl-14 pr-3';

    // Active/hover appearance. White-label agencies keep their solid brand
    // fill; everyone else gets the stark-warm soft accent + left stripe.
    const stateClass = active && !childActive
      ? (agencyActiveStyle ? 'text-primary-foreground font-semibold' : 'bg-[var(--portal-accent-soft)] text-primary font-semibold')
      : childActive
      ? 'text-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground';

    const lockClass = isLocked ? ' opacity-60' : '';
    const linkClass = `flex items-center gap-3 ${pl} py-2 rounded-md text-[13.5px] font-medium transition-colors relative group/navrow w-full${lockClass} group-data-[collapsed=true]/sb:lg:justify-center group-data-[collapsed=true]/sb:lg:px-0 ${stateClass}`;

    const stripe = active && !childActive && (
      <span
        className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-primary group-data-[collapsed=true]/sb:lg:left-0"
        style={agencyActiveStyle ? { backgroundColor: agencyActiveStyle.backgroundColor } : undefined}
        aria-hidden
      />
    );

    const chevron = !isLocked && hasChildren && (
      <span className="material-icons text-base opacity-50 shrink-0 group-data-[collapsed=true]/sb:lg:hidden">
        {isExpanded ? 'expand_less' : 'expand_more'}
      </span>
    );

    // Locked items: render as a Link to the billing/plans page with lock icon.
    // Parents with children behave the same (no expand, just navigate to plans).
    // On hover the module price slides in and a teaser popover opens beside it.
    if (isLocked) {
      const billingHref = `/portal/settings/billing/plans${item.requiredDomain ? `?highlight=${item.requiredDomain}` : ''}`;
      const lockDomain = item.requiredDomain ? getDomainByKey(item.requiredDomain) : undefined;
      const priceLabel = lockDomain ? `$${Math.round(lockDomain.monthlyPriceCents / 100)}` : null;
      return (
        <Link
          href={billingHref}
          onClick={onCloseMobile}
          title={collapsed ? item.label : undefined}
          className={linkClass + ' cursor-pointer group/lock'}
          onMouseEnter={lockDomain ? (e) => openLockPopover(e, item.requiredDomain!) : undefined}
          onMouseLeave={lockDomain ? closeLockPopoverSoon : undefined}
        >
          <span className="material-icons text-xl shrink-0">{item.icon}</span>
          <span className="flex-1 truncate group-data-[collapsed=true]/sb:lg:hidden">{item.label}</span>
          {priceLabel && (
            <span className="text-xs font-semibold text-primary opacity-0 translate-x-2 group-hover/lock:opacity-100 group-hover/lock:translate-x-0 transition-all duration-200 shrink-0 group-data-[collapsed=true]/sb:lg:hidden">
              {priceLabel}
              <span className="font-normal text-[10px] text-muted-foreground">/mo</span>
            </span>
          )}
          <span className="material-icons text-base shrink-0">lock</span>
        </Link>
      );
    }

    if (hasChildren) {
      return (
        <div
          className={linkClass + ' cursor-pointer'}
          title={collapsed ? item.label : undefined}
          onClick={() => {
            // Collapsed rail: a group has no visible children, so first expand
            // the rail, then open the group.
            if (collapsed) onExpandRail?.();
            toggleSection(item.href);
          }}
        >
          {stripe}
          <span className="material-icons text-xl shrink-0">{item.icon}</span>
          <span className="flex-1 truncate group-data-[collapsed=true]/sb:lg:hidden">{item.label}</span>
          {chevron}
        </div>
      );
    }

    const badgeCount = item.href === '/portal/approvals' ? pendingCount : 0;

    return (
      <Link
        href={item.href}
        onClick={onCloseMobile}
        title={collapsed ? item.label : undefined}
        className={linkClass}
        style={active && !childActive ? agencyActiveStyle : undefined}
      >
        {stripe}
        <span className="material-icons text-xl shrink-0">{item.icon}</span>
        <span className="flex-1 truncate group-data-[collapsed=true]/sb:lg:hidden">{item.label}</span>
        {badgeCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0 group-data-[collapsed=true]/sb:lg:hidden">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </Link>
    );
  };

  // Recursive renderer for nav items with children
  const renderNavItem = (item: NavItem | NavChild, depth: number) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedSections[item.href];
    // Locked parents never expand — children are gated behind the billing page.
    const showChildren = hasChildren && isExpanded && !item.locked;

    return (
      <li
        key={`${depth}-${item.href}`}
        className={item.dividerBefore && depth === 0 ? 'mt-3 pt-3 border-t border-border' : undefined}
      >
        {renderNavLink(item, depth)}
        {showChildren && (
          <ul className="mt-0.5 space-y-0.5 group-data-[collapsed=true]/sb:lg:hidden">
            {item.children!.map(child => renderNavItem(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      {/* Sidebar — persistent rail on lg (normal pages) + mobile/overlay drawer.
          Collapse only takes visual effect on lg via the data-collapsed group;
          the mobile drawer always renders full-width with labels. */}
      <aside
        data-collapsed={collapsed ? 'true' : 'false'}
        className={`group/sb fixed top-0 left-0 z-40 h-screen w-64 flex flex-col bg-card border-r border-border transition-[transform,width] duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${persistent ? 'lg:translate-x-0' : ''} ${collapsed ? 'lg:data-[collapsed=true]:w-16' : ''}`}
      >
        {/* Header: company switcher (full) / brand mark (collapsed) + close (mobile) */}
        <div className="flex items-center gap-1 h-14 border-b border-border px-3 shrink-0">
          <div className="flex-1 min-w-0 group-data-[collapsed=true]/sb:lg:hidden">
            <CompanySwitcher />
          </div>
          <Link
            href="/portal"
            className="hidden group-data-[collapsed=true]/sb:lg:grid place-items-center w-9 h-9 rounded-md mx-auto overflow-hidden bg-muted"
            title={brandName}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandLogoUrl} alt="" className="w-6 h-6 object-contain" />
          </Link>
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            title="Close"
            aria-label="Close navigation"
          >
            <span className="material-icons text-lg">close</span>
          </button>
        </div>

        {/* Unified Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          <ul className="space-y-0.5 px-2.5">
            {navItems.map(item => renderNavItem(item, 0))}
          </ul>
        </nav>

        {/* Footer: theme cycle + sign out */}
        <div className="border-t border-border p-2.5 space-y-0.5 shrink-0">
          <button
            onClick={cycleTheme}
            title={collapsed ? `${themeLabel[theme]} mode` : undefined}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-[13.5px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors group-data-[collapsed=true]/sb:lg:justify-center group-data-[collapsed=true]/sb:lg:px-0"
          >
            <span className="material-icons text-xl shrink-0">{themeIcon[theme]}</span>
            <span className="flex-1 text-left group-data-[collapsed=true]/sb:lg:hidden">{themeLabel[theme]} Mode</span>
            <span className="material-icons text-sm opacity-40 group-data-[collapsed=true]/sb:lg:hidden">swap_horiz</span>
          </button>

          <button
            onClick={async () => {
              await fetch('/api/portal/sign-out', { method: 'POST' });
              await signOut({ callbackUrl: '/portal/login' });
            }}
            title={collapsed ? 'Sign out' : undefined}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-[13.5px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors group-data-[collapsed=true]/sb:lg:justify-center group-data-[collapsed=true]/sb:lg:px-0"
          >
            <span className="material-icons text-xl shrink-0">logout</span>
            <span className="group-data-[collapsed=true]/sb:lg:hidden">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Locked-item hover teaser: price + details + CTA, anchored beside the row */}
      {lockPopover && (() => {
        const d = getDomainByKey(lockPopover.key);
        if (!d) return null;
        return (
          <div
            className={`fixed z-50 w-64 rounded-xl border border-border bg-card shadow-xl p-4 transition-all duration-200 ${
              popVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
            }`}
            style={{ top: lockPopover.top, left: lockPopover.left }}
            onMouseEnter={keepLockPopover}
            onMouseLeave={closeLockPopoverSoon}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="material-icons text-xl text-primary">{d.icon}</span>
              <span className="font-semibold text-sm flex-1 truncate">{d.name}</span>
              <span className="material-icons text-sm text-muted-foreground shrink-0">lock</span>
            </div>
            <div className="mb-1.5">
              <span className="text-xl font-bold text-foreground">${Math.round(d.monthlyPriceCents / 100)}</span>
              <span className="text-xs font-normal text-muted-foreground">/mo</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{d.tagline}</p>
            {d.features.length > 0 && (
              <ul className="space-y-1 mb-3">
                {d.features.slice(0, 3).map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                    <span className="material-icons text-sm text-primary mt-px shrink-0">check_circle</span>
                    <span className="leading-snug">{f}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/portal/settings/billing/plans?highlight=${lockPopover.key}`}
              onClick={() => { setLockPopover(null); onCloseMobile?.(); }}
              className="flex items-center justify-center gap-1 w-full rounded-md bg-primary text-primary-foreground text-sm font-medium py-2 hover:bg-primary/90 transition-colors"
              style={agencyActiveStyle}
            >
              Add to plan
              <span className="material-icons text-sm">arrow_forward</span>
            </Link>
          </div>
        );
      })()}
    </>
  );
}
