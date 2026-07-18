'use client';

import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminTopbar from '@/components/admin/AdminTopbar';
import CommandPalette from '@/components/admin/CommandPalette';
import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

type Theme = 'light' | 'dark';

export default function AdminShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');

  // /admin/login renders a bare centered card, no sidebar/topbar chrome. This
  // branch lives here (inside the one persistent client component the parent
  // server layout always mounts) rather than in app/admin/layout.tsx itself,
  // so the layout's rendered shape never differs by route — see the
  // HYDRATION-SAFETY note in app/admin/layout.tsx.
  const isLoginPage = pathname === '/admin/login';

  // Full-screen post editor renders its own chrome — suppress shell + topbar.
  const isPostEditScreen = pathname.includes('/posts/new') ||
                          pathname.includes('/posts/edit') ||
                          (pathname.match(/\/posts\/\d+/) !== null);

  useEffect(() => {
    const saved = localStorage.getItem('adminSidebarCollapsed');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate sidebar collapse from localStorage on mount
    if (saved !== null) setIsCollapsed(saved === 'true');

    const savedTheme = localStorage.getItem('admin-theme') as Theme | null;
    const resolved: Theme = savedTheme
      ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(resolved);

    const handleSidebarToggle = (event: CustomEvent<{ collapsed: boolean }>) => {
      setIsCollapsed(event.detail.collapsed);
    };
    window.addEventListener('sidebarToggle', handleSidebarToggle as EventListener);
    return () => window.removeEventListener('sidebarToggle', handleSidebarToggle as EventListener);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('admin-theme', next);
      return next;
    });
  }, []);

  if (isLoginPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {children}
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-background text-foreground" data-theme={theme}>
      {!isPostEditScreen && <AdminSidebar />}
      <div className={`transition-all duration-300 ${isPostEditScreen ? '' : (isCollapsed ? 'lg:pl-16' : 'lg:pl-64')}`}>
        {!isPostEditScreen && <AdminTopbar theme={theme} onToggleTheme={toggleTheme} />}
        <main className="min-h-screen">{children}</main>
      </div>
      {!isPostEditScreen && <CommandPalette onToggleTheme={toggleTheme} />}
    </div>
  );
}
