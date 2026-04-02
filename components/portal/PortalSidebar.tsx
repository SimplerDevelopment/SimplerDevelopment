'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';
import CompanySwitcher from './CompanySwitcher';

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

interface NavChild {
  href: string;
  label: string;
  icon: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  menuOnly?: boolean; // renders as a toggle button, not a link
  children?: NavChild[];
  dynamic?: boolean; // children are fetched at runtime
}

const staticNavItems: NavItem[] = [
  { href: '/portal/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/portal/projects', label: 'Projects', icon: 'view_kanban' },
  { href: '/portal/crm', label: 'CRM', icon: 'contacts' },
  { href: '/portal/email', label: 'Email', icon: 'email' },
  { href: '/portal/surveys', label: 'Surveys', icon: 'poll' },
  { href: '/portal/branding', label: 'Branding', icon: 'palette' },
  // Dynamic services are injected here as top-level items (see navItems below)
  { href: '/portal/automations', label: 'Automations', icon: 'bolt' },
  { href: '/portal/settings', label: 'Settings', icon: 'settings' },
];

// CMS nav item with optional children
interface CmsNavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  alsoActiveOn?: string;
  children?: { href: string; label: string; icon: string }[];
}

// CMS nav items — shown when inside /portal/websites/[siteId]
const cmsNavItems = (siteId: string): CmsNavItem[] => [
  {
    href: `/portal/websites/${siteId}`,
    label: 'Content',
    icon: 'article',
    exact: true,
    alsoActiveOn: `/portal/websites/${siteId}/posts`,
    children: [
      { href: `/portal/websites/${siteId}/taxonomy`, label: 'Taxonomy', icon: 'account_tree' },
      { href: `/portal/websites/${siteId}/content-types`, label: 'Content Types', icon: 'description' },
    ],
  },
  { href: `/portal/websites/${siteId}/media`, label: 'Media', icon: 'perm_media' },
  { href: `/portal/websites/${siteId}/navigation`, label: 'Navigation', icon: 'menu' },
  { href: `/portal/websites/${siteId}/store`, label: 'Store', icon: 'shopping_cart', exact: true },
  { href: `/portal/websites/${siteId}/automations`, label: 'Automations', icon: 'bolt' },
  { href: `/portal/websites/${siteId}/settings`, label: 'Settings', icon: 'settings' },
];

// CRM nav items — shown when inside /portal/crm
const crmNavItemsList = [
  { href: '/portal/crm', label: 'Dashboard', icon: 'dashboard', exact: true },
  { href: '/portal/crm/contacts', label: 'Contacts', icon: 'people' },
  { href: '/portal/crm/companies', label: 'Companies', icon: 'business' },
  { href: '/portal/crm/deals', label: 'Deals', icon: 'handshake' },
  { href: '/portal/crm/proposals', label: 'Proposals & Decks', icon: 'description' },
  { href: '/portal/crm/settings', label: 'Settings', icon: 'settings' },
];

// Email nav items — shown when inside /portal/email
const emailNavItemsList = [
  { href: '/portal/email', label: 'Dashboard', icon: 'dashboard', exact: true },
  { href: '/portal/email/campaigns', label: 'Campaigns', icon: 'campaign' },
  { href: '/portal/email/templates', label: 'Templates', icon: 'dynamic_feed' },
  { href: '/portal/email/lists', label: 'Lists', icon: 'list_alt' },
  { href: '/portal/email/segments', label: 'Segments', icon: 'filter_alt' },
  { href: '/portal/email/analytics', label: 'Analytics', icon: 'analytics' },
  { href: '/portal/email/automations', label: 'Automations', icon: 'bolt' },
  { href: '/portal/email/settings', label: 'Settings', icon: 'settings' },
];

// Surveys nav items — shown when inside /portal/surveys
const surveysNavItemsList = [
  { href: '/portal/surveys', label: 'All Surveys', icon: 'poll', exact: true },
  { href: '/portal/surveys/new', label: 'New Survey', icon: 'add_circle' },
];

// Store nav items — shown when inside /portal/websites/[siteId]/store
const storeNavItems = (siteId: string) => [
  { href: `/portal/websites/${siteId}/store`, label: 'Overview', icon: 'dashboard', exact: true, alsoActiveOn: undefined },
  { href: `/portal/websites/${siteId}/store/products`, label: 'Products', icon: 'inventory_2', exact: false, alsoActiveOn: undefined },
  { href: `/portal/websites/${siteId}/store/orders`, label: 'Orders', icon: 'receipt_long', exact: false, alsoActiveOn: undefined },
  { href: `/portal/websites/${siteId}/store/categories`, label: 'Categories', icon: 'category', exact: false, alsoActiveOn: undefined },
  { href: `/portal/websites/${siteId}/store/discounts`, label: 'Discounts', icon: 'sell', exact: false, alsoActiveOn: undefined },
  { href: `/portal/websites/${siteId}/store/shipping`, label: 'Shipping', icon: 'local_shipping', exact: false, alsoActiveOn: undefined },
  { href: `/portal/websites/${siteId}/store/settings`, label: 'Settings', icon: 'settings', exact: false, alsoActiveOn: undefined },
];

interface NavService {
  id: number;
  name: string;
  category: string;
  icon: string;
  href: string;
  subscribed: boolean;
}

export default function PortalSidebar() {
  const { status } = useSession();
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [cmsTitle, setCmsTitle] = useState('');
  const [navServices, setNavServices] = useState<NavService[]>([]);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const prevSiteIdRef = useRef<string | null>(null);

  // Detect CMS context: /portal/websites/[numeric-siteId]/...
  const cmsMatch = pathname.match(/^\/portal\/websites\/(\d+)(\/|$)/);
  const activeSiteId = cmsMatch ? cmsMatch[1] : null;

  // Detect store context: /portal/websites/[siteId]/store/...
  const isStoreContext = activeSiteId && pathname.startsWith(`/portal/websites/${activeSiteId}/store`);

  // Detect product contexts
  const isCrmContext = pathname.startsWith('/portal/crm') || pathname.startsWith('/portal/tools/pitch-decks');
  const isEmailContext = pathname.startsWith('/portal/email');
  const isProjectsContext = pathname.startsWith('/portal/projects');
  const isSurveysContext = pathname.startsWith('/portal/surveys');
  const isBookingContext = pathname.startsWith('/portal/tools/booking');
  const isAutomationsContext = pathname === '/portal/automations' || pathname.startsWith('/portal/automations/');
  const isBrandingContext = pathname === '/portal/branding' || pathname.startsWith('/portal/branding/');
  const isWebsitesListContext = pathname === '/portal/websites' || pathname === '/portal/websites/new';
  const isHostingContext = false; // hosting handled within website/email services
  const isSettingsContext = pathname.startsWith('/portal/settings');
  const isDashboard = pathname === '/portal/dashboard';

  // Auto-collapse on CMS content editor pages to maximize editing space
  const isEditorPage = /\/portal\/websites\/\d+\/posts\//.test(pathname);

  useEffect(() => {
    if (isEditorPage) {
      setIsCollapsed(true);
    } else {
      const saved = localStorage.getItem('portalSidebarCollapsed');
      if (saved !== null) setIsCollapsed(saved === 'true');
    }
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme && themeOrder.includes(savedTheme)) setTheme(savedTheme);
  }, [isEditorPage]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenuOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenuOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [contextMenuOpen]);

  // Close context menu on route change
  useEffect(() => { setContextMenuOpen(false); }, [pathname]);

  // Fetch services for nav — re-fetch on route change (e.g. after login redirect)
  useEffect(() => {
    fetch('/api/portal/services/nav')
      .then(r => r.json())
      .then(res => { if (res.success) setNavServices(res.data); })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (!activeSiteId || activeSiteId === prevSiteIdRef.current) return;
    prevSiteIdRef.current = activeSiteId;
    fetch(`/api/portal/cms/websites`)
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          const site = res.data?.find((s: { id: number; name: string }) => String(s.id) === activeSiteId);
          if (site) setCmsTitle(site.name);
        }
      })
      .catch(() => {});
  }, [activeSiteId]);

  // Build nav items: inject dynamic services as top-level items before Settings
  const navItems: NavItem[] = (() => {
    const serviceItems: NavItem[] = navServices
      .filter(svc => svc.name !== 'Chat Bot' && svc.name !== 'Project Management System' && svc.name !== 'Pitch Decks' && svc.name !== 'Email Marketing' && svc.name !== 'Monthly Maintenance' && svc.name !== 'White Label Domain' && svc.name !== 'All-In-One')
      .map(svc => ({
        href: svc.href,
        label: svc.name,
        icon: svc.icon,
      }));
    // Insert services before the last item (Settings)
    const items = [...staticNavItems];
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

  if (status !== 'authenticated') return null;

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('portalSidebarCollapsed', String(next));
    window.dispatchEvent(new CustomEvent('portalSidebarToggle', { detail: { collapsed: next } }));
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-card border border-border"
      >
        <span className="material-icons text-xl">
          {isMobileOpen ? 'close' : 'menu'}
        </span>
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 ${
          isCollapsed ? 'w-16' : 'w-64'
        } bg-card border-r border-border`}
      >
        <div className="h-full flex flex-col">
          {/* Company Switcher — always visible, top-left like Slack */}
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} h-14 border-b border-border px-3`}>
            <CompanySwitcher collapsed={isCollapsed} />
            {!isCollapsed && (
              <button
                onClick={toggleCollapsed}
                className="hidden lg:flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                title="Collapse"
              >
                <span className="material-icons text-lg">chevron_left</span>
              </button>
            )}
            {isCollapsed && (
              <button
                onClick={toggleCollapsed}
                className="hidden lg:flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 absolute right-1"
                title="Expand"
              >
                <span className="material-icons text-lg">chevron_right</span>
              </button>
            )}
          </div>

          {/* Context switcher — dropdown to navigate between services */}
          {(() => {
            // Show context switcher on any product page (not dashboard)
            if (isDashboard) return null;

            // Determine current context
            const ctx = isStoreContext ? { label: 'Store', name: 'Store', icon: 'shopping_cart', key: 'store' }
              : activeSiteId ? { label: 'Simpler CMS', name: cmsTitle || 'Loading...', icon: 'language', key: 'websites' }
              : isCrmContext ? { label: 'CRM', name: 'Customer Management', icon: 'contacts', key: 'crm' }
              : isEmailContext ? { label: 'Email', name: 'Email Marketing', icon: 'email', key: 'email' }
              : isSurveysContext ? { label: 'Surveys', name: 'Surveys', icon: 'poll', key: 'surveys' }
              : isProjectsContext ? { label: 'Projects', name: 'Project Management', icon: 'view_kanban', key: 'projects' }
              : isBookingContext ? { label: 'Booking', name: 'Booking System', icon: 'calendar_month', key: 'booking' }
              : isAutomationsContext ? { label: 'Automations', name: 'Automations', icon: 'bolt', key: 'automations' }
              : isBrandingContext ? { label: 'Branding', name: 'Brand Identity', icon: 'palette', key: 'branding' }
              : isWebsitesListContext ? { label: 'Websites', name: 'Websites', icon: 'language', key: 'websites' }
              : isSettingsContext ? { label: 'Settings', name: 'Settings', icon: 'settings', key: 'settings' }
              : null;

            if (!ctx) return null;

            const currentLabel = ctx.label;
            const currentName = ctx.name;
            const currentIcon = ctx.icon;

            const allOptions = [
              { label: 'Dashboard', icon: 'dashboard', href: '/portal/dashboard', key: 'dashboard' },
              { label: 'Projects', icon: 'view_kanban', href: '/portal/projects', key: 'projects' },
              { label: 'CRM', icon: 'contacts', href: '/portal/crm', key: 'crm' },
              { label: 'Email Marketing', icon: 'email', href: '/portal/email', key: 'email' },
              { label: 'Surveys', icon: 'poll', href: '/portal/surveys', key: 'surveys' },
              { label: 'Websites', icon: 'language', href: '/portal/websites', key: 'websites' },
              { label: 'Booking', icon: 'calendar_month', href: '/portal/tools/booking', key: 'booking' },
              { label: 'Branding', icon: 'palette', href: '/portal/branding', key: 'branding' },
              { label: 'Automations', icon: 'bolt', href: '/portal/automations', key: 'automations' },
              { label: 'Settings', icon: 'settings', href: '/portal/settings', key: 'settings' },
            ];

            const contextOptions = allOptions.filter(opt => opt.key !== ctx.key);

            if (isCollapsed) {
              return (
                <div className="flex justify-center py-2 border-b border-border bg-muted/30 relative" ref={contextMenuRef}>
                  <button
                    onClick={() => setContextMenuOpen(!contextMenuOpen)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors relative group"
                    title={currentName}
                  >
                    <span className="material-icons text-lg">{currentIcon}</span>
                    {!contextMenuOpen && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                        {currentName}
                      </div>
                    )}
                  </button>
                  {contextMenuOpen && (
                    <div className="absolute top-0 left-full ml-2 w-52 bg-card border border-border rounded-lg shadow-xl z-[60] overflow-hidden py-1">
                      {contextOptions.map(opt => (
                        <Link
                          key={opt.href}
                          href={opt.href}
                          onClick={() => { setContextMenuOpen(false); setIsMobileOpen(false); }}
                          className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <span className="material-icons text-lg">{opt.icon}</span>
                          {opt.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="relative border-b border-border bg-muted/30" ref={contextMenuRef}>
                <button
                  onClick={() => setContextMenuOpen(!contextMenuOpen)}
                  className="flex items-center gap-2 min-w-0 w-full px-3 py-2 text-left hover:bg-accent/50 transition-colors"
                >
                  <span className="material-icons text-lg text-primary">{currentIcon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">{currentLabel}</p>
                    <p className="text-xs font-semibold text-foreground truncate leading-tight">{currentName}</p>
                  </div>
                  <span className="material-icons text-muted-foreground text-sm shrink-0">
                    {contextMenuOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                {contextMenuOpen && (
                  <div className="absolute top-full left-0 right-0 mt-0 bg-card border border-border rounded-b-lg shadow-xl z-[60] overflow-hidden py-1">
                    {contextOptions.map(opt => (
                      <Link
                        key={opt.href}
                        href={opt.href}
                        onClick={() => { setContextMenuOpen(false); setIsMobileOpen(false); }}
                        className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <span className="material-icons text-lg">{opt.icon}</span>
                        {opt.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-4">
            {isStoreContext && activeSiteId ? (
              // ── Store context nav ───────────────────────────────────
              <ul className={`space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
                {storeNavItems(activeSiteId).map(item => {
                  const isActive = (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/'));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center gap-3 ${
                          isCollapsed ? 'justify-center px-3' : 'px-4'
                        } py-3 rounded-md text-sm font-medium transition-colors relative group w-full ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                        title={isCollapsed ? item.label : ''}
                      >
                        <span className="material-icons text-xl">{item.icon}</span>
                        {!isCollapsed && <span className="flex-1">{item.label}</span>}
                        {isCollapsed && (
                          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                            {item.label}
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : activeSiteId ? (
              // ── CMS context nav ────────────────────────────────────
              <ul className={`space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
                {cmsNavItems(activeSiteId).map(item => {
                  const isActive = (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/'))
                    || (item.alsoActiveOn !== undefined && pathname.startsWith(item.alsoActiveOn));
                  const hasChildren = item.children && item.children.length > 0;
                  const hasActiveChild = hasChildren && item.children!.some(
                    c => pathname === c.href || pathname.startsWith(c.href + '/')
                  );
                  const showChildren = isActive || hasActiveChild;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center gap-3 ${
                          isCollapsed ? 'justify-center px-3' : 'px-4'
                        } py-3 rounded-md text-sm font-medium transition-colors relative group w-full ${
                          isActive || hasActiveChild
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                        title={isCollapsed ? item.label : ''}
                      >
                        <span className="material-icons text-xl">{item.icon}</span>
                        {!isCollapsed && <span className="flex-1">{item.label}</span>}
                        {!isCollapsed && hasChildren && (
                          <span className="material-icons text-base opacity-60">{showChildren ? 'expand_less' : 'expand_more'}</span>
                        )}
                        {isCollapsed && (
                          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                            {item.label}
                          </div>
                        )}
                      </Link>
                      {/* Children */}
                      {hasChildren && showChildren && !isCollapsed && (
                        <ul className="mt-0.5 space-y-0.5">
                          {item.children!.map(child => {
                            const childActive = pathname === child.href || pathname.startsWith(child.href + '/');
                            return (
                              <li key={child.href}>
                                <Link
                                  href={child.href}
                                  onClick={() => setIsMobileOpen(false)}
                                  className={`flex items-center gap-3 pl-11 pr-4 py-2 rounded-md text-sm transition-colors ${
                                    childActive
                                      ? 'text-primary font-medium bg-primary/10'
                                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                  }`}
                                >
                                  <span className="material-icons text-lg">{child.icon}</span>
                                  <span>{child.label}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : isCrmContext ? (
              // ── CRM context nav ─────────────────────────────────────
              <ul className={`space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
                {crmNavItemsList.map(item => {
                  const isActive = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center gap-3 ${
                          isCollapsed ? 'justify-center px-3' : 'px-4'
                        } py-3 rounded-md text-sm font-medium transition-colors relative group w-full ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                        title={isCollapsed ? item.label : ''}
                      >
                        <span className="material-icons text-xl">{item.icon}</span>
                        {!isCollapsed && <span className="flex-1">{item.label}</span>}
                        {isCollapsed && (
                          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                            {item.label}
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : isSurveysContext ? (
              // ── Surveys context nav ─────────────────────────────────
              <ul className={`space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
                {surveysNavItemsList.map(item => {
                  const isActive = (item as { exact?: boolean }).exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center gap-3 ${
                          isCollapsed ? 'justify-center px-3' : 'px-4'
                        } py-3 rounded-md text-sm font-medium transition-colors relative group w-full ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                        title={isCollapsed ? item.label : ''}
                      >
                        <span className="material-icons text-xl">{item.icon}</span>
                        {!isCollapsed && <span className="flex-1">{item.label}</span>}
                        {isCollapsed && (
                          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                            {item.label}
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : isEmailContext ? (
              // ── Email context nav ──────────────────────────────────
              <ul className={`space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
                {emailNavItemsList.map(item => {
                  const isActive = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center gap-3 ${
                          isCollapsed ? 'justify-center px-3' : 'px-4'
                        } py-3 rounded-md text-sm font-medium transition-colors relative group w-full ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                        title={isCollapsed ? item.label : ''}
                      >
                        <span className="material-icons text-xl">{item.icon}</span>
                        {!isCollapsed && <span className="flex-1">{item.label}</span>}
                        {isCollapsed && (
                          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                            {item.label}
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              // ── Main portal nav ────────────────────────────────────
              <ul className={`space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
                {navItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  const hasActiveChild = item.children?.some(
                    (c) => pathname === c.href || pathname.startsWith(c.href + '/')
                  );
                  const isMenuOpen = item.menuOnly
                    ? (openMenus[item.href] ?? hasActiveChild ?? false)
                    : undefined;

                  const sharedClass = `flex items-center gap-3 ${
                    isCollapsed ? 'justify-center px-3' : 'px-4'
                  } py-3 rounded-md text-sm font-medium transition-colors relative group w-full ${
                    !item.menuOnly && isActive && !hasActiveChild
                      ? 'bg-primary text-primary-foreground'
                      : hasActiveChild
                      ? 'text-foreground bg-accent/50'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`;

                  return (
                    <li key={item.href}>
                      {item.menuOnly ? (
                        <button
                          onClick={() => setOpenMenus(prev => ({ ...prev, [item.href]: !isMenuOpen }))}
                          className={sharedClass}
                          title={isCollapsed ? item.label : ''}
                        >
                          <span className="material-icons text-xl">{item.icon}</span>
                          {!isCollapsed && (
                            <>
                              <span className="flex-1 text-left">{item.label}</span>
                              <span className="material-icons text-base opacity-50">
                                {isMenuOpen ? 'expand_less' : 'expand_more'}
                              </span>
                            </>
                          )}
                          {isCollapsed && (
                            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                              {item.label}
                            </div>
                          )}
                        </button>
                      ) : (
                        <Link
                          href={item.href}
                          className={sharedClass}
                          title={isCollapsed ? item.label : ''}
                          onClick={() => setIsMobileOpen(false)}
                        >
                          <span className="material-icons text-xl">{item.icon}</span>
                          {!isCollapsed && <span className="flex-1">{item.label}</span>}
                          {isCollapsed && (
                            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                              {item.label}
                            </div>
                          )}
                        </Link>
                      )}

                      {/* Sub-items */}
                      {!isCollapsed && item.children && (item.menuOnly ? isMenuOpen : hasActiveChild) && item.children.map((child) => {
                        const childActive = pathname === child.href || pathname.startsWith(child.href + '/');
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setIsMobileOpen(false)}
                            className={`flex items-center gap-2 ml-4 pl-4 pr-3 py-2 mt-0.5 rounded-md text-sm transition-colors relative border-l-2 ${
                              childActive
                                ? 'border-primary text-primary font-medium bg-primary/5'
                                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent hover:border-primary/40'
                            }`}
                          >
                            <span className="material-icons text-base">{child.icon}</span>
                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          {/* Footer */}
          <div className={`border-t border-border ${isCollapsed ? 'p-2' : 'p-4'} space-y-1`}>
            {/* Theme toggle */}
            <button
              onClick={cycleTheme}
              className={`flex items-center gap-2 w-full ${
                isCollapsed ? 'justify-center px-3' : 'px-4'
              } py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors relative group`}
              title={isCollapsed ? `Theme: ${themeLabel[theme]}` : ''}
            >
              <span className="material-icons text-xl">{themeIcon[theme]}</span>
              {!isCollapsed && (
                <span className="flex-1 text-left">{themeLabel[theme]} Mode</span>
              )}
              {!isCollapsed && (
                <span className="material-icons text-sm opacity-40">swap_horiz</span>
              )}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                  Theme: {themeLabel[theme]}
                </div>
              )}
            </button>

            <button
              onClick={() => signOut({ callbackUrl: '/portal/login' })}
              className={`flex items-center gap-2 w-full ${
                isCollapsed ? 'justify-center px-3' : 'px-4'
              } py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors relative group`}
              title={isCollapsed ? 'Sign Out' : ''}
            >
              <span className="material-icons text-xl">logout</span>
              {!isCollapsed && <span>Sign Out</span>}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                  Sign Out
                </div>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
}
