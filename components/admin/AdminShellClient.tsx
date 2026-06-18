'use client';

import AdminSidebar from '@/components/admin/AdminSidebar';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function AdminShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Check if we're on a post edit/new screen
  const isPostEditScreen = pathname.includes('/posts/new') ||
                          pathname.includes('/posts/edit') ||
                          (pathname.match(/\/posts\/\d+/) !== null);

  useEffect(() => {
    const saved = localStorage.getItem('adminSidebarCollapsed');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern: hydrate sidebar collapse from localStorage on mount
    if (saved !== null) setIsCollapsed(saved === 'true');

    const handleSidebarToggle = (event: CustomEvent<{ collapsed: boolean }>) => {
      setIsCollapsed(event.detail.collapsed);
    };

    window.addEventListener('sidebarToggle', handleSidebarToggle as EventListener);
    return () => {
      window.removeEventListener('sidebarToggle', handleSidebarToggle as EventListener);
    };
  }, []);

  return (
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
  );
}
