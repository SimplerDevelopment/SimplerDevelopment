'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
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
  exact?: boolean;
  alsoActiveOn?: string;
  children?: NavChild[];
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  children?: NavChild[];
}

interface NavService {
  id: number;
  name: string;
  category: string;
  icon: string;
  href: string;
  subscribed: boolean;
}

// Static nav structure with collapsible children
const buildNavItems = (activeSiteId: string | null, activeSiteName: string | null): NavItem[] => [
  { href: '/portal/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/portal/projects', label: 'Projects', icon: 'view_kanban' },
  {
    href: '/portal/crm',
    label: 'CRM',
    icon: 'contacts',
    exact: true,
    children: [
      { href: '/portal/crm', label: 'Dashboard', icon: 'dashboard', exact: true },
      { href: '/portal/crm/contacts', label: 'Contacts', icon: 'people' },
      { href: '/portal/crm/companies', label: 'Companies', icon: 'business' },
      { href: '/portal/crm/deals', label: 'Deals', icon: 'handshake' },
      { href: '/portal/crm/proposals', label: 'Proposals & Decks', icon: 'description' },
      { href: '/portal/crm/settings', label: 'Settings', icon: 'settings' },
    ],
  },
  {
    href: '/portal/email',
    label: 'Email',
    icon: 'email',
    exact: true,
    children: [
      { href: '/portal/email', label: 'Dashboard', icon: 'dashboard', exact: true },
      { href: '/portal/email/campaigns', label: 'Campaigns', icon: 'campaign' },
      { href: '/portal/email/templates', label: 'Templates', icon: 'dynamic_feed' },
      { href: '/portal/email/lists', label: 'Lists', icon: 'list_alt' },
      { href: '/portal/email/segments', label: 'Segments', icon: 'filter_alt' },
      { href: '/portal/email/analytics', label: 'Analytics', icon: 'analytics' },
      { href: '/portal/email/automations', label: 'Automations', icon: 'bolt' },
      { href: '/portal/email/settings', label: 'Settings', icon: 'settings' },
    ],
  },
  {
    href: '/portal/surveys',
    label: 'Surveys',
    icon: 'poll',
    exact: true,
    children: [
      { href: '/portal/surveys', label: 'All Surveys', icon: 'poll', exact: true },
      { href: '/portal/surveys/new', label: 'New Survey', icon: 'add_circle' },
    ],
  },
  { href: '/portal/websites', label: 'Websites', icon: 'language', exact: true },
  ...(activeSiteId
    ? [{
        href: `/portal/websites/${activeSiteId}`,
        label: activeSiteName || 'Website',
        icon: 'web',
        exact: true,
        children: [
          {
            href: `/portal/websites/${activeSiteId}/entries`,
            label: 'Content',
            icon: 'article',
            alsoActiveOn: `/portal/websites/${activeSiteId}/posts`,
            children: [
              { href: `/portal/websites/${activeSiteId}/entries`, label: 'Entries', icon: 'edit_note', alsoActiveOn: `/portal/websites/${activeSiteId}/posts` },
              { href: `/portal/websites/${activeSiteId}/taxonomy`, label: 'Taxonomies', icon: 'account_tree' },
              { href: `/portal/websites/${activeSiteId}/content-types`, label: 'Content Types', icon: 'description' },
            ],
          },
          {
            href: `/portal/websites/${activeSiteId}/store`,
            label: 'Store',
            icon: 'shopping_cart',
            exact: true,
            children: [
              { href: `/portal/websites/${activeSiteId}/store/products`, label: 'Products', icon: 'inventory_2' },
              { href: `/portal/websites/${activeSiteId}/store/orders`, label: 'Orders', icon: 'receipt_long' },
              { href: `/portal/websites/${activeSiteId}/store/categories`, label: 'Categories', icon: 'category' },
              { href: `/portal/websites/${activeSiteId}/store/discounts`, label: 'Discounts', icon: 'sell' },
              { href: `/portal/websites/${activeSiteId}/store/shipping`, label: 'Shipping', icon: 'local_shipping' },
              { href: `/portal/websites/${activeSiteId}/store/settings`, label: 'Store Settings', icon: 'settings' },
            ],
          },
          { href: `/portal/websites/${activeSiteId}/email`, label: 'Website Emails', icon: 'email' },
          { href: `/portal/websites/${activeSiteId}/navigation`, label: 'Navigation', icon: 'menu' },
          { href: `/portal/websites/${activeSiteId}/settings`, label: 'Website Settings', icon: 'settings' },
        ],
      }]
    : []
  ),
  { href: '/portal/branding', label: 'Branding', icon: 'palette' },
  { href: '/portal/automations', label: 'Automations', icon: 'bolt' },
  { href: '/portal/settings', label: 'Settings', icon: 'settings' },
];

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

export default function PortalSidebar() {
  const { status } = useSession();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [navServices, setNavServices] = useState<NavService[]>([]);
  const [activeSiteName, setActiveSiteName] = useState<string | null>(null);

  // Detect CMS context
  const cmsMatch = pathname.match(/^\/portal\/websites\/(\d+)(\/|$)/);
  const activeSiteId = cmsMatch ? cmsMatch[1] : null;

  // Fetch active site name
  useEffect(() => {
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

  // Auto-collapse on editor pages
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

  // Fetch services for nav
  useEffect(() => {
    fetch('/api/portal/services/nav')
      .then(r => r.json())
      .then(res => { if (res.success) setNavServices(res.data); })
      .catch(() => {});
  }, [pathname]);

  // Auto-expand sections based on active route
  useEffect(() => {
    const items = buildNavItems(activeSiteId, activeSiteName);
    const newExpanded: Record<string, boolean> = { ...expandedSections };
    const autoExpand = (list: NavChild[]) => {
      for (const item of list) {
        if (item.children && (isItemActive(item, pathname) || isChildActive(item.children, pathname))) {
          newExpanded[item.href] = true;
          autoExpand(item.children);
        }
      }
    };
    for (const item of items) {
      if (item.children && (isItemActive(item, pathname) || isChildActive(item.children, pathname))) {
        newExpanded[item.href] = true;
        autoExpand(item.children);
      }
    }
    setExpandedSections(newExpanded);
    // Only auto-expand on route change, not on every expandedSections change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, activeSiteId]);

  // Build final nav items with injected services
  const navItems: NavItem[] = (() => {
    const items = buildNavItems(activeSiteId, activeSiteName);
    const serviceItems: NavItem[] = navServices
      .filter(svc => !EXCLUDED_SERVICES.has(svc.name) && !svc.name.startsWith('__'))
      .map(svc => ({ href: svc.href, label: svc.name, icon: svc.icon }));
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
    setExpandedSections(prev => ({ ...prev, [href]: !prev[href] }));
  };

  if (status !== 'authenticated') return null;

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    window.dispatchEvent(new CustomEvent('portalSidebarToggle', { detail: { open: next, collapsed: isCollapsed } }));
  };

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('portalSidebarCollapsed', String(next));
    window.dispatchEvent(new CustomEvent('portalSidebarToggle', { detail: { open: isOpen, collapsed: next } }));
  };

  // Renders a nav item link (or parent toggle)
  const renderNavLink = (
    item: { href: string; label: string; icon: string; exact?: boolean; alsoActiveOn?: string; children?: NavChild[] },
    depth: number,
  ) => {
    const hasChildren = item.children && item.children.length > 0;
    const active = isItemActive(item, pathname);
    const childActive = isChildActive(item.children, pathname);
    const isExpanded = expandedSections[item.href];
    const depthPadding: Record<number, string> = {
      0: 'px-4',
      1: 'pl-8 pr-4',
      2: 'pl-12 pr-4',
      3: 'pl-16 pr-4',
    };
    const pl = isCollapsed ? 'px-3 justify-center' : (depthPadding[depth] ?? 'pl-16 pr-4');

    const linkClass = `flex items-center gap-3 ${pl} py-2.5 rounded-md text-sm font-medium transition-colors relative group w-full ${
      active && !childActive
        ? 'bg-primary text-primary-foreground'
        : childActive
        ? 'text-foreground bg-accent/50'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    }`;

    const tooltip = isCollapsed && (
      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
        {item.label}
      </div>
    );

    const chevron = !isCollapsed && hasChildren && (
      <span className="material-icons text-base opacity-50 shrink-0">
        {isExpanded ? 'expand_less' : 'expand_more'}
      </span>
    );

    if (hasChildren) {
      return (
        <div
          className={linkClass + ' cursor-pointer'}
          onClick={() => toggleSection(item.href)}
          title={isCollapsed ? item.label : ''}
        >
          <span className="material-icons text-xl shrink-0">{item.icon}</span>
          {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
          {chevron}
          {tooltip}
        </div>
      );
    }

    return (
      <Link
        href={item.href}
        onClick={toggleOpen}
        className={linkClass}
        title={isCollapsed ? item.label : ''}
      >
        <span className="material-icons text-xl shrink-0">{item.icon}</span>
        {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
        {tooltip}
      </Link>
    );
  };

  // Recursive renderer for nav items with children
  const renderNavItem = (item: NavItem | NavChild, depth: number) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedSections[item.href];

    return (
      <li key={`${depth}-${item.href}`}>
        {renderNavLink(item, depth)}
        {hasChildren && isExpanded && !isCollapsed && (
          <ul className="mt-0.5 space-y-0.5">
            {item.children!.map(child => renderNavItem(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      {/* Hamburger toggle — always visible when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={toggleOpen}
          className="fixed top-4 left-4 z-50 p-2 rounded-md bg-card border border-border hover:bg-accent transition-colors"
        >
          <span className="material-icons text-xl">menu</span>
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          isCollapsed ? 'w-16' : 'w-64'
        } bg-card border-r border-border`}
      >
        <div className="h-full flex flex-col">
          {/* Header with close button */}
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} h-14 border-b border-border px-3`}>
            <CompanySwitcher collapsed={isCollapsed} />
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggleOpen}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Close sidebar"
              >
                <span className="material-icons text-lg">close</span>
              </button>
            </div>
          </div>

          {/* Unified Nav */}
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className={`space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
              {navItems.map(item => renderNavItem(item, 0))}
            </ul>
          </nav>

          {/* Footer */}
          <div className={`border-t border-border ${isCollapsed ? 'p-2' : 'p-4'} space-y-1`}>
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

      {/* Overlay when sidebar is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={toggleOpen}
        />
      )}
    </>
  );
}
