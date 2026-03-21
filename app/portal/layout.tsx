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

  useEffect(() => {
    const saved = localStorage.getItem('portalSidebarCollapsed');
    if (saved !== null) setIsCollapsed(saved === 'true');

    const handler = (e: CustomEvent<{ collapsed: boolean }>) => setIsCollapsed(e.detail.collapsed);
    window.addEventListener('portalSidebarToggle', handler as EventListener);
    return () => window.removeEventListener('portalSidebarToggle', handler as EventListener);
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
        <PortalSidebar />
        <div className={`transition-all duration-300 ${isCollapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
          <main className="min-h-screen p-6">{children}</main>
        </div>
        <AIChatWidget />
      </div>
    </SessionProvider>
  );
}
