'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  subItems?: NavItem[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

export default function AdminSidebar() {
  const { status } = useSession();
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [approvalsCount, setApprovalsCount] = useState<number>(0);

  useEffect(() => {
    const saved = localStorage.getItem('adminSidebarCollapsed');
    if (saved !== null) setIsCollapsed(saved === 'true');
  }, []);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Poll the unified approvals inbox every 60s so the badge stays fresh.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch('/api/admin/approvals');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.success) setApprovalsCount(Array.isArray(data.data) ? data.data.length : 0);
      } catch {
        /* ignore — badge is best-effort */
      }
    }
    void tick();
    const id = setInterval(() => void tick(), 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [status, pathname]);

  if (status !== 'authenticated') return null;

  const toggleCollapsed = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('adminSidebarCollapsed', String(newState));
    window.dispatchEvent(new CustomEvent('sidebarToggle', { detail: { collapsed: newState } }));
  };

  const toggleSection = (label: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const sections: NavSection[] = [
    {
      label: 'Platform',
      items: [
        { href: '/admin', label: 'Dashboard', icon: 'space_dashboard' },
        { href: '/admin/clients', label: 'Clients', icon: 'business' },
        { href: '/admin/users', label: 'Staff', icon: 'badge' },
      ],
    },
    {
      label: 'Services',
      items: [
        {
          href: '/admin/portal-websites',
          label: 'Websites',
          icon: 'language',
          subItems: [
            { href: '/admin/branding', label: 'Branding', icon: 'palette' },
            { href: '/admin/portal-hosting', label: 'Hosting & DNS', icon: 'cloud' },
          ],
        },
        { href: '/admin/portal-ecommerce', label: 'eCommerce', icon: 'shopping_cart' },
        {
          href: '/admin/email',
          label: 'Email Marketing',
          icon: 'campaign',
          subItems: [
            { href: '/admin/email/campaigns', label: 'Campaigns', icon: 'send' },
            { href: '/admin/email/lists', label: 'Lists', icon: 'list' },
            { href: '/admin/email/domains', label: 'Domains', icon: 'dns' },
          ],
        },
        { href: '/admin/booking', label: 'Booking', icon: 'calendar_month' },
      ],
    },
    {
      label: 'Sales & CRM',
      items: [
        { href: '/admin/crm', label: 'CRM Dashboard', icon: 'monitoring' },
        { href: '/admin/crm/contacts', label: 'Contacts', icon: 'contacts' },
        { href: '/admin/crm/companies', label: 'Companies', icon: 'apartment' },
        { href: '/admin/crm/deals', label: 'Deals', icon: 'handshake' },
        { href: '/admin/crm/proposals', label: 'Proposals', icon: 'description' },
        { href: '/admin/crm/contracts', label: 'Contracts', icon: 'gavel' },
      ],
    },
    {
      label: 'Operations',
      items: [
        { href: '/admin/approvals', label: 'Approvals', icon: 'inbox', badge: approvalsCount },
        {
          href: '/admin/portal-projects',
          label: 'Projects',
          icon: 'view_kanban',
          subItems: [
            { href: '/admin/portal-suggested-projects', label: 'Project Market', icon: 'rocket_launch' },
            { href: '/admin/portal-project-requests', label: 'Requests', icon: 'assignment_add' },
          ],
        },
        { href: '/admin/portal-tickets', label: 'Support Tickets', icon: 'support_agent' },
        { href: '/admin/automations', label: 'Automations', icon: 'bolt' },
        { href: '/admin/system-health', label: 'System Health', icon: 'monitor_heart' },
        { href: '/admin/oauth-clients', label: 'OAuth Clients', icon: 'key' },
        // Agentic OS is a developer-only feature. NODE_ENV is statically
        // inlined by Next.js at build time, so the entry is stripped from
        // production bundles entirely (matches the server-side route gate).
        ...(process.env.NODE_ENV === 'development'
          ? [{ href: '/admin/agentic-os', label: 'Agentic OS', icon: 'auto_awesome' }]
          : []),
        { href: '/admin/portal-ai', label: 'AI Chat', icon: 'smart_toy' },
      ],
    },
    {
      label: 'Billing',
      items: [
        { href: '/admin/portal-invoices', label: 'Invoices', icon: 'receipt_long' },
        { href: '/admin/subscriptions', label: 'Subscriptions', icon: 'loyalty' },
        { href: '/admin/ai-credits', label: 'AI Credits', icon: 'token' },
        {
          href: '/admin/portal-services',
          label: 'Service Catalog',
          icon: 'storefront',
          subItems: [
            { href: '/admin/portal-service-requests', label: 'Service Requests', icon: 'assignment' },
          ],
        },
      ],
    },
    {
      label: 'Content',
      items: [
        {
          href: '/admin/posts',
          label: 'Posts',
          icon: 'article',
          subItems: [
            { href: '/admin/content-calendar', label: 'Calendar', icon: 'calendar_month' },
            { href: '/admin/post-types', label: 'Post Types', icon: 'category' },
            { href: '/admin/categories', label: 'Categories', icon: 'folder' },
            { href: '/admin/tags', label: 'Tags', icon: 'label' },
          ],
        },
        { href: '/admin/templates', label: 'Templates', icon: 'bookmark' },
        { href: '/admin/media', label: 'Media', icon: 'perm_media' },
      ],
    },
  ];

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(href + '/');
  };

  const isSectionActive = (section: NavSection) =>
    section.items.some(item =>
      isActive(item.href) || item.subItems?.some(sub => isActive(sub.href))
    );

  const isItemExpanded = (item: NavItem) =>
    isActive(item.href) || item.subItems?.some(sub => isActive(sub.href));

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-card border border-border"
      >
        <span className="material-icons text-xl">{isMobileOpen ? 'close' : 'menu'}</span>
      </button>

      <aside
        className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 ${
          isCollapsed ? 'w-16' : 'w-64'
        } bg-card border-r border-border flex flex-col`}
      >
        {/* Header */}
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} h-14 border-b border-border px-3`}>
          {!isCollapsed && (
            <Link href="/admin" className="flex items-center gap-2">
              <span className="material-icons text-primary text-xl">hub</span>
              <span className="font-bold text-foreground text-sm">SimplerDev</span>
            </Link>
          )}
          <button
            onClick={toggleCollapsed}
            className="hidden lg:flex p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <span className="material-icons text-lg">
              {isCollapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {sections.map((section) => (
            <div key={section.label} className="mb-1">
              {!isCollapsed ? (
                <button
                  onClick={() => toggleSection(section.label)}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                  {section.label}
                  <span className="material-icons text-xs">
                    {expandedSections.has(section.label) ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              ) : (
                <div className="border-t border-border mx-2 my-1" />
              )}

              {(!expandedSections.has(section.label) || isCollapsed) && (
                <ul className={`space-y-0.5 ${isCollapsed ? 'px-1.5' : 'px-2'}`}>
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2.5 ${
                          isCollapsed ? 'justify-center px-2' : 'px-3'
                        } py-2 rounded-md text-[13px] font-medium transition-colors relative group ${
                          isActive(item.href)
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                        title={isCollapsed ? item.label : ''}
                      >
                        <span className="material-icons text-lg">{item.icon}</span>
                        {!isCollapsed && <span className="truncate flex-1">{item.label}</span>}
                        {!isCollapsed && typeof item.badge === 'number' && item.badge > 0 && (
                          <span className={`text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded-full ${
                            isActive(item.href) ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                        {isCollapsed && (
                          <>
                            {typeof item.badge === 'number' && item.badge > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 text-[9px] font-semibold leading-none px-1 py-0.5 rounded-full bg-primary text-primary-foreground">
                                {item.badge}
                              </span>
                            )}
                            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                              {item.label}
                            </div>
                          </>
                        )}
                      </Link>

                      {/* Sub-items */}
                      {item.subItems && !isCollapsed && isItemExpanded(item) && (
                        <ul className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
                          {item.subItems.map((sub) => (
                            <li key={sub.href}>
                              <Link
                                href={sub.href}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors ${
                                  isActive(sub.href)
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                }`}
                              >
                                <span className="material-icons text-sm">{sub.icon}</span>
                                <span>{sub.label}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={`border-t border-border ${isCollapsed ? 'p-1.5' : 'p-2'}`}>
          <Link
            href="/"
            className={`flex items-center gap-2 ${
              isCollapsed ? 'justify-center px-2' : 'px-3'
            } py-2 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors relative group`}
            title={isCollapsed ? 'Back to Site' : ''}
          >
            <span className="material-icons text-lg">arrow_back</span>
            {!isCollapsed && <span>Back to Site</span>}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                Back to Site
              </div>
            )}
          </Link>
        </div>
      </aside>

      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
}
