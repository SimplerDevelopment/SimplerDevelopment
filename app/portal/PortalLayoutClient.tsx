'use client';

import dynamic from 'next/dynamic';
// SessionProvider is mounted once at the app root in `app/layout.tsx`.
// We intentionally don't re-wrap here — every nested SessionProvider spins up
// its own /api/auth/session fetch + refetch interval, which previously caused
// 6× duplicate session calls per page load.
import PortalSidebar from '@/components/portal/PortalSidebar';
import PortalTopbar from '@/components/portal/PortalTopbar';
import PortalTitle from '@/components/portal/PortalTitle';
import CmdKLauncher from '@/components/CmdKLauncher';
import { AgencyChromeProvider } from '@/components/portal/AgencyChromeProvider';
import ImpersonationBanner from '@/components/portal/ImpersonationBanner';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { UserAppNavMeta } from '@/lib/plugins/load-user-apps';
import type { SerializableEntitlements } from './PortalShell';

// AI chat widget is purely on-demand — its FAB is the only first-paint
// surface and a ~50ms shimmer before it appears is fine. Dynamic import keeps
// `react-markdown` + the rest of the 441-LoC widget out of the initial
// portal bundle. See perf phase 3.
// Kept (unused) so the floating AI chat widget can be re-enabled by
// uncommenting its render below — see note near the bottom of the tree.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  /** Billing-domain entitlements resolved on the server. Drives nav gating
   *  in the sidebar and Cmd+K palette. */
  entitlements?: SerializableEntitlements;
}

export default function PortalLayoutClient({ children, apps, entitlements }: PortalLayoutClientProps) {
  const pathname = usePathname();
  // Pre-auth pages render without portal chrome (no sidebar/topbar). Onboarding
  // joins them: it renders its own full-bleed split-screen shell (stepper rail
  // + content), so the portal sidebar/topbar would only fight it.
  const isLoginPage =
    pathname === '/portal/login' ||
    pathname === '/portal/signup' ||
    pathname === '/portal/forgot-password' ||
    pathname === '/portal/reset-password' ||
    pathname === '/portal/onboarding';
  const isEditorRoute = /\/portal\/websites\/\d+\/(posts\/|navigation)|\/portal\/tools\/pitch-decks\/\d+/.test(pathname);
  const [previewMode, setPreviewMode] = useState(false);

  // Desktop icon-rail collapse (persisted) + mobile drawer open state. Lifted
  // here so the topbar's collapse/hamburger controls drive the sidebar and the
  // content offset stays in sync.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('portalSidebarCollapsed');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydrate of persisted UI pref
    if (saved === 'true') setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('portalSidebarCollapsed', String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dismissing a transient UI drawer on navigation
    setMobileOpen(false);
  }, [pathname]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern, predates this change
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
      <AgencyChromeProvider>
        <PortalTitle />
        {isIframePage ? children : (
          <div className="min-h-screen flex items-center justify-center bg-background">
            {children}
          </div>
        )}
      </AgencyChromeProvider>
    );
  }

  // Remove padding on full-screen editor pages
  const isEditorPage =
    /\/portal\/websites\/\d+\/(posts\/|navigation)/.test(pathname) ||
    /\/portal\/branding\/profiles\/\d+\/guide/.test(pathname);

  // The persistent rail + topbar apply to normal pages. Full-screen editors
  // (and preview mode) keep the sidebar as an overlay drawer so they retain
  // their full canvas width.
  const persistent = !isEditorPage && !previewMode;

  return (
    <AgencyChromeProvider>
      <PortalTitle />
      <ImpersonationBanner />
      <div className="portal-shell min-h-screen bg-background overflow-x-hidden">
        {!previewMode && (
          <PortalSidebar
            apps={apps}
            entitlements={entitlements}
            persistent={persistent}
            collapsed={collapsed}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
            onExpandRail={() => { setCollapsed(false); try { localStorage.setItem('portalSidebarCollapsed', 'false'); } catch { /* ignore */ } }}
          />
        )}

        {/* Full-screen editor pages have no topbar — give them a floating
            control to open the nav drawer so navigation stays reachable. */}
        {!previewMode && !persistent && !mobileOpen && (
          <button
            onClick={() => setMobileOpen(true)}
            className="fixed top-3 left-3 z-50 w-9 h-9 grid place-items-center rounded-md bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Menu"
            aria-label="Open navigation"
          >
            <span className="material-icons text-xl">menu</span>
          </button>
        )}

        <div className={`min-h-screen flex flex-col transition-[padding] duration-200 ${persistent ? (collapsed ? 'lg:pl-16' : 'lg:pl-64') : ''}`}>
          {persistent && (
            <PortalTopbar
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              onOpenMobile={() => setMobileOpen(true)}
            />
          )}
          <main className={`flex-1 ${isEditorPage || previewMode ? '' : 'p-4 sm:p-6'}`}>{children}</main>
        </div>
        {/* AIChatWidget (floating robot/chat toggle) temporarily hidden across
            the portal per request. Re-enable by uncommenting this line. */}
        {/* {!previewMode && <AIChatWidget />} */}
      </div>
      <CmdKLauncher apps={apps} entitlements={entitlements} />
    </AgencyChromeProvider>
  );
}
