'use client';

import SessionProvider from '@/components/SessionProvider';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isLoginPage = pathname === '/admin/login';

  // Check if we're on a post edit/new screen
  const isPostEditScreen = pathname.includes('/posts/new') ||
                          pathname.includes('/posts/edit') ||
                          (pathname.match(/\/posts\/\d+/) !== null);

  useEffect(() => {
    // Load initial state from localStorage
    const saved = localStorage.getItem('adminSidebarCollapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }

    // Listen for sidebar toggle events
    const handleSidebarToggle = (event: CustomEvent<{ collapsed: boolean }>) => {
      setIsCollapsed(event.detail.collapsed);
    };

    window.addEventListener('sidebarToggle', handleSidebarToggle as EventListener);

    return () => {
      window.removeEventListener('sidebarToggle', handleSidebarToggle as EventListener);
    };
  }, []);

  if (isLoginPage) {
    return (
      <SessionProvider>
        <div className="min-h-screen flex items-center justify-center bg-background">
          {children}
        </div>
      </SessionProvider>
    );
  }

  return (
    <SessionProvider>
      <div className="min-h-screen bg-background">
        {!isPostEditScreen && <AdminSidebar />}
        <div
          className={`transition-all duration-300 ${
            isPostEditScreen ? '' : (isCollapsed ? 'lg:pl-16' : 'lg:pl-64')
          }`}
        >
          <main className="min-h-screen">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
