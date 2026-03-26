'use client';

import SessionProvider from '@/components/SessionProvider';
import PortalSidebar from '@/components/portal/PortalSidebar';
import AIChatWidget from '@/components/portal/AIChatWidget';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/portal/login';
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isEditorRoute = /\/portal\/websites\/\d+\/posts\//.test(pathname);

  useEffect(() => {
    if (isEditorRoute) {
      setIsCollapsed(true);
    } else {
      const saved = localStorage.getItem('portalSidebarCollapsed');
      if (saved !== null) setIsCollapsed(saved === 'true');
    }

    const handler = (e: CustomEvent<{ collapsed: boolean }>) => setIsCollapsed(e.detail.collapsed);
    window.addEventListener('portalSidebarToggle', handler as EventListener);
    return () => window.removeEventListener('portalSidebarToggle', handler as EventListener);
  }, [isEditorRoute]);

  if (isLoginPage) {
    return (
      <SessionProvider>
        <div className="min-h-screen flex items-center justify-center bg-background">
          {children}
        </div>
      </SessionProvider>
    );
  }

  // Remove padding on CMS editor pages so the visual editor shell goes edge-to-edge
  const isEditorPage = /\/portal\/websites\/\d+\/posts\//.test(pathname);

  return (
    <SessionProvider>
      <div className="min-h-screen bg-background">
        <PortalSidebar />
        <div className={`transition-all duration-300 ${isCollapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
          <main className={`min-h-screen ${isEditorPage ? '' : 'p-6'}`}>{children}</main>
        </div>
        <AIChatWidget />
      </div>
    </SessionProvider>
  );
}
