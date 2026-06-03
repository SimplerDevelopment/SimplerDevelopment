'use client';

import dynamic from 'next/dynamic';
import SessionProvider from '@/components/SessionProvider';
import PortalSidebar from '@/components/portal/PortalSidebar';
import CrmNotificationBell from '@/components/portal/CrmNotificationBell';
import PmNotificationBell from '@/components/portal/PmNotificationBell';
import PortalTitle from '@/components/portal/PortalTitle';
import CmdKLauncher from '@/components/CmdKLauncher';
import { AgencyChromeProvider } from '@/components/portal/AgencyChromeProvider';
import ImpersonationBanner from '@/components/portal/ImpersonationBanner';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { UserAppNavMeta } from '@/lib/plugins/load-user-apps';

// AI chat widget is purely on-demand — its FAB is the only first-paint
// surface and a ~50ms shimmer before it appears is fine. Dynamic import keeps
// `react-markdown` + the rest of the 441-LoC widget out of the initial
// portal bundle. See perf phase 3.
const AIChatWidget = dynamic(() => import('@/components/portal/AIChatWidget'), {
  ssr: false,
  loading: () => null,
});

interface PortalLayoutClientProps {
  children: React.ReactNode;
  /** Plugin apps the active client is entitled to see. Resolved on the
   *  server in `PortalShell` and passed through so the sidebar + cmd-K
   *  palette can render the "Apps" group without an extra round-trip. */
  apps?: UserAppNavMeta[];
}

export default function PortalLayoutClient({ children, apps }: PortalLayoutClientProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/portal/login';
  const isEditorRoute = /\/portal\/websites\/\d+\/(posts\/|navigation)|\/portal\/tools\/pitch-decks\/\d+/.test(pathname);
  const [previewMode, setPreviewMode] = useState(false);

  // Auto-resolve subdomain portal: e.g. acme.simplerdevelopment.com/portal
  useEffect(() => {
    const hostname = window.location.hostname;
    if (hostname.endsWith('.simplerdevelopment.com') && hostname !== 'simplerdevelopment.com' && hostname !== 'www.simplerdevelopment.com') {
      const subdomain = hostname.replace('.simplerdevelopment.com', '');
      if (subdomain && !subdomain.includes('.')) {
        fetch(`/api/portal/resolve-subdomain?subdomain=${encodeURIComponent(subdomain)}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.success) {
              // Reload to pick up the new active client cookie (only if not already resolved)
              const resolved = sessionStorage.getItem('sd-subdomain-resolved');
              if (resolved !== subdomain) {
                sessionStorage.setItem('sd-subdomain-resolved', subdomain);
                window.location.reload();
              }
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (!isEditorRoute) {
      setPreviewMode(false);
    }

    const previewHandler = (e: CustomEvent<{ active: boolean }>) => setPreviewMode(e.detail.active);
    window.addEventListener('portalPreviewMode', previewHandler as EventListener);

    return () => {
      window.removeEventListener('portalPreviewMode', previewHandler as EventListener);
    };
  }, [isEditorRoute]);

  // Bare iframe pages — no sidebar, no chrome
  const isIframePage = pathname.includes('/slide-preview');

  if (isLoginPage || isIframePage) {
    return (
      <SessionProvider>
        <AgencyChromeProvider>
          <PortalTitle />
          {isIframePage ? children : (
            <div className="min-h-screen flex items-center justify-center bg-background">
              {children}
            </div>
          )}
        </AgencyChromeProvider>
      </SessionProvider>
    );
  }

  // Remove padding on full-screen editor pages
  const isEditorPage =
    /\/portal\/websites\/\d+\/(posts\/|navigation)/.test(pathname) ||
    /\/portal\/branding\/profiles\/\d+\/guide/.test(pathname);

  return (
    <SessionProvider>
      <AgencyChromeProvider>
        <PortalTitle />
        <ImpersonationBanner />
        <div className="min-h-screen bg-background overflow-x-hidden">
          {!previewMode && <PortalSidebar apps={apps} />}
          <div>
            {!previewMode && (
              <div className="flex justify-end items-center gap-1 px-4 sm:px-6 pt-4 pb-0">
                <PmNotificationBell />
                <CrmNotificationBell />
              </div>
            )}
            <main className={`min-h-screen ${isEditorPage || previewMode ? '' : 'p-4 sm:p-6'}`}>{children}</main>
          </div>
          {/* AIChatWidget (floating robot/chat toggle) temporarily hidden across
              the portal per request. Re-enable by uncommenting this line. */}
          {/* {!previewMode && <AIChatWidget />} */}
        </div>
        <CmdKLauncher apps={apps} />
      </AgencyChromeProvider>
    </SessionProvider>
  );
}
