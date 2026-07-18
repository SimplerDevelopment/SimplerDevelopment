'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getNavSections, type NavItem, type NavSection } from '@/lib/admin/nav';

export default function AdminSidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [approvalsCount, setApprovalsCount] = useState<number>(0);

  useEffect(() => {
    const saved = localStorage.getItem('adminSidebarCollapsed');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate collapse state from localStorage on mount
    if (saved !== null) setIsCollapsed(saved === 'true');
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile drawer when the route changes
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
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const sections = getNavSections();
  const badgeFor = (item: NavItem) => (item.badgeKey === 'approvals' ? approvalsCount : 0);

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(href + '/');
  };
  const isItemExpanded = (item: NavItem) =>
    isActive(item.href) || item.subItems?.some(sub => isActive(sub.href));

  const userInitials = (session?.user?.name ?? session?.user?.email ?? 'A')
    .split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 w-9 h-9 grid place-items-center rounded-md bg-card border border-border text-foreground"
        aria-label="Toggle navigation"
      >
        <span className="material-icons text-xl">{isMobileOpen ? 'close' : 'menu'}</span>
      </button>

      <aside
        className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 ${isCollapsed ? 'w-16' : 'w-64'} bg-card border-r border-border flex flex-col`}
      >
        {/* Header */}
        <div className={`flex items-center h-14 border-b border-border ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          {!isCollapsed && (
            <Link href="/admin" className="flex items-center gap-2.5 min-w-0">
              <span className="rounded-md bg-foreground text-background grid place-items-center font-mono font-bold text-[15px] leading-none shrink-0" style={{ width: 26, height: 26 }}>S</span>
              <span className="font-semibold text-foreground text-sm tracking-tight truncate">SimplerDev</span>
            </Link>
          )}
          <button
            onClick={toggleCollapsed}
            className="hidden lg:grid place-items-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="material-icons text-lg">{isCollapsed ? 'chevron_right' : 'chevron_left'}</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5">
          {sections.map((section: NavSection) => {
            const open = !collapsedSections.has(section.label);
            return (
              <div key={section.label} className="mb-3 last:mb-0">
                {!isCollapsed ? (
                  <button
                    onClick={() => toggleSection(section.label)}
                    className="w-full flex items-center justify-between px-2 pt-1.5 pb-1 text-[10.5px] font-semibold text-muted-foreground/80 uppercase tracking-[0.09em] hover:text-foreground transition-colors"
                  >
                    {section.label}
                    <span className="material-icons text-sm opacity-60">{open ? 'expand_less' : 'expand_more'}</span>
                  </button>
                ) : (
                  <div className="border-t border-border mx-1 my-2" />
                )}

                {(open || isCollapsed) && (
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      const badge = badgeFor(item);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            title={isCollapsed ? item.label : ''}
                            className={`group relative flex items-center gap-2.5 rounded-md text-[13.5px] font-medium transition-colors ${
                              isCollapsed ? 'justify-center px-2 py-2' : 'px-2 py-[7px]'
                            } ${
                              active
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            }`}
                          >
                            {active && !isCollapsed && (
                              <span className="absolute left-[-10px] top-[7px] bottom-[7px] w-0.5 rounded bg-foreground" />
                            )}
                            <span className="material-icons text-[18px] shrink-0">{item.icon}</span>
                            {!isCollapsed && <span className="truncate flex-1">{item.label}</span>}
                            {!isCollapsed && badge > 0 && (
                              <span className="text-[10.5px] font-mono leading-none px-1.5 h-[17px] min-w-[17px] grid place-items-center rounded-full text-white bg-[var(--admin-accent)]">
                                {badge}
                              </span>
                            )}
                            {isCollapsed && (
                              <>
                                {badge > 0 && (
                                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--admin-accent)]" />
                                )}
                                <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground border border-border text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-sm">
                                  {item.label}
                                </span>
                              </>
                            )}
                          </Link>

                          {/* Sub-items */}
                          {item.subItems && !isCollapsed && isItemExpanded(item) && (
                            <ul className="mt-0.5 ml-[15px] pl-3 border-l border-border space-y-0.5">
                              {item.subItems.map((sub) => {
                                const subActive = isActive(sub.href);
                                return (
                                  <li key={sub.href}>
                                    <Link
                                      href={sub.href}
                                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] transition-colors ${
                                        subActive
                                          ? 'text-foreground font-medium bg-accent'
                                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                      }`}
                                    >
                                      <span className="material-icons text-[15px]">{sub.icon}</span>
                                      <span className="truncate">{sub.label}</span>
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
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-2">
          {!isCollapsed ? (
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md">
              <span className="w-7 h-7 rounded-full shrink-0 grid place-items-center text-white text-[11px] font-semibold" style={{ background: 'linear-gradient(135deg,#0070f3,#7928ca)' }}>
                {userInitials}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-[12.5px] font-medium text-foreground truncate">{session?.user?.name ?? 'Staff'}</div>
                <div className="text-[11px] text-muted-foreground truncate">{session?.user?.email}</div>
              </div>
              <Link href="/" title="Back to site" className="grid place-items-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <span className="material-icons text-lg">logout</span>
              </Link>
            </div>
          ) : (
            <Link href="/" title="Back to site" className="group relative grid place-items-center w-full py-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <span className="material-icons text-lg">logout</span>
              <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground border border-border text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-sm">
                Back to site
              </span>
            </Link>
          )}
        </div>
      </aside>

      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setIsMobileOpen(false)} />
      )}
    </>
  );
}
