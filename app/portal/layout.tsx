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

  const isEditorRoute = /\/portal\/websites\/\d+\/(posts\/|navigation)|\/portal\/tools\/pitch-decks\/\d+/.test(pathname);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (isEditorRoute) {
      setIsCollapsed(true);
    } else {
      setPreviewMode(false);
      const saved = localStorage.getItem('portalSidebarCollapsed');
      if (saved !== null) setIsCollapsed(saved === 'true');
    }

    const handler = (e: CustomEvent<{ collapsed: boolean }>) => setIsCollapsed(e.detail.collapsed);
    window.addEventListener('portalSidebarToggle', handler as EventListener);

    const previewHandler = (e: CustomEvent<{ active: boolean }>) => setPreviewMode(e.detail.active);
    window.addEventListener('portalPreviewMode', previewHandler as EventListener);

    return () => {
      window.removeEventListener('portalSidebarToggle', handler as EventListener);
      window.removeEventListener('portalPreviewMode', previewHandler as EventListener);
    };
  }, [isEditorRoute]);

  // Bare iframe pages — no sidebar, no chrome
  const isIframePage = pathname.includes('/slide-preview');

  if (isLoginPage || isIframePage) {
    return (
      <SessionProvider>
        {isIframePage ? children : (
          <div className="min-h-screen flex items-center justify-center bg-background">
            {children}
          </div>
        )}
      </SessionProvider>
    );
  }

  // Remove padding on full-screen editor pages
  const isEditorPage = /\/portal\/websites\/\d+\/(posts\/|navigation)/.test(pathname);

  return (
    <SessionProvider>
      <div className="min-h-screen bg-background">
        {!previewMode && <PortalSidebar />}
        <div className={`transition-all duration-300 ${previewMode ? '' : isCollapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
          <main className={`min-h-screen ${isEditorPage || previewMode ? '' : 'p-6'}`}>{children}</main>
        </div>
        {!previewMode && <AIChatWidget />}
      </div>
    </SessionProvider>
  );
}
