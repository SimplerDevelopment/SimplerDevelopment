'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  subItems?: NavItem[];
}

export default function AdminSidebar() {
  const { status } = useSession();
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('adminSidebarCollapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  if (status !== 'authenticated') return null;

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('adminSidebarCollapsed', String(newState));

    // Dispatch event for layout to listen to
    window.dispatchEvent(new CustomEvent('sidebarToggle', { detail: { collapsed: newState } }));
  };

  const navItems: NavItem[] = [
    { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
    {
      href: '/admin/posts',
      label: 'Posts',
      icon: 'article',
      subItems: [
        { href: '/admin/post-types', label: 'Post Types', icon: 'category' },
        { href: '/admin/categories', label: 'Categories', icon: 'folder' },
        { href: '/admin/tags', label: 'Tags', icon: 'label' },
      ],
    },
    { href: '/admin/templates', label: 'Templates', icon: 'bookmark' },
    { href: '/admin/media', label: 'Media', icon: 'perm_media' },
    { href: '/admin/users', label: 'Users', icon: 'group' },
  ];

  const portalNavItems: NavItem[] = [
    { href: '/admin/clients', label: 'Clients', icon: 'business' },
    { href: '/admin/portal-projects', label: 'Projects', icon: 'view_kanban' },
    { href: '/admin/portal-suggested-projects', label: 'Suggested Projects', icon: 'rocket_launch' },
    { href: '/admin/portal-tickets', label: 'Support Tickets', icon: 'support_agent' },
    { href: '/admin/portal-invoices', label: 'Invoices', icon: 'receipt_long' },
    { href: '/admin/portal-services', label: 'Services', icon: 'storefront' },
    { href: '/admin/portal-service-requests', label: 'Service Requests', icon: 'assignment' },
    { href: '/admin/portal-project-requests', label: 'Project Requests', icon: 'rocket_launch' },
    { href: '/admin/portal-ai', label: 'AI Chat', icon: 'smart_toy' },
  ];

  const isPostsActive = pathname.startsWith('/admin/posts') ||
    pathname.startsWith('/admin/post-types') ||
    pathname.startsWith('/admin/categories') ||
    pathname.startsWith('/admin/tags');

  const isPortalActive = pathname.startsWith('/admin/clients') ||
    pathname.startsWith('/admin/portal-');

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-card border border-border"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isMobileOpen ? (
            <path d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
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
          {/* Logo & Collapse Button */}
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} h-16 border-b border-border px-4`}>
            {!isCollapsed && (
              <Link href="/admin" className="text-xl font-bold text-foreground">
                CMS
              </Link>
            )}
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex p-2 rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="material-icons text-xl">
                {isCollapsed ? 'chevron_right' : 'chevron_left'}
              </span>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className={`space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
              {/* CMS section */}
              {!isCollapsed && (
                <li className="px-4 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">CMS</li>
              )}
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 ${
                      isCollapsed ? 'justify-center px-3' : 'px-4'
                    } py-3 rounded-md text-sm font-medium transition-colors relative group ${
                      pathname === item.href
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                    title={isCollapsed ? item.label : ''}
                  >
                    <span className="material-icons text-xl">{item.icon}</span>
                    {!isCollapsed && <span>{item.label}</span>}

                    {/* Tooltip for collapsed mode */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                        {item.label}
                      </div>
                    )}
                  </Link>

                  {/* Sub-items - only show when expanded */}
                  {item.subItems && isPostsActive && !isCollapsed && (
                    <ul className="mt-1 ml-4 space-y-1">
                      {item.subItems.map((subItem) => (
                        <li key={subItem.href}>
                          <Link
                            href={subItem.href}
                            className={`flex items-center gap-3 px-4 py-2 rounded-md text-sm transition-colors ${
                              pathname === subItem.href || pathname.startsWith(subItem.href + '/')
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            }`}
                          >
                            <span className="material-icons text-base">{subItem.icon}</span>
                            <span>{subItem.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {/* Client Portal section */}
              {!isCollapsed && (
                <li className="px-4 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-t border-border mt-2">
                  Client Portal
                </li>
              )}
              {isCollapsed && <li className="border-t border-border mt-2 pt-2" />}
              {portalNavItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 ${
                      isCollapsed ? 'justify-center px-3' : 'px-4'
                    } py-3 rounded-md text-sm font-medium transition-colors relative group ${
                      pathname.startsWith(item.href)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                    title={isCollapsed ? item.label : ''}
                  >
                    <span className="material-icons text-xl">{item.icon}</span>
                    {!isCollapsed && <span>{item.label}</span>}
                    {isCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                        {item.label}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer */}
          <div className={`border-t border-border ${isCollapsed ? 'p-2' : 'p-4'}`}>
            {/* Collapse Toggle Button - Always visible */}
            <button
              onClick={toggleCollapsed}
              className={`hidden lg:flex items-center gap-2 w-full ${
                isCollapsed ? 'justify-center px-3' : 'px-4'
              } py-3 mb-2 rounded-md text-sm font-medium bg-accent/50 hover:bg-accent text-foreground transition-colors relative group`}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="material-icons text-xl">
                {isCollapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'}
              </span>
              {!isCollapsed && <span>Collapse Menu</span>}

              {/* Tooltip for collapsed mode */}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                  Expand Menu
                </div>
              )}
            </button>

            <Link
              href="/"
              className={`flex items-center gap-2 ${
                isCollapsed ? 'justify-center px-3' : 'px-4'
              } py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors relative group`}
              title={isCollapsed ? 'Back to Site' : ''}
            >
              <span className="material-icons text-xl">arrow_back</span>
              {!isCollapsed && <span>Back to Site</span>}

              {/* Tooltip for collapsed mode */}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                  Back to Site
                </div>
              )}
            </Link>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
}
