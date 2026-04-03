'use client';

import { Navigation } from '@/components/ui/Navigation';
import { Footer } from '@/components/ui/Footer';
import { ReactNode, lazy, Suspense, useMemo } from 'react';
import { usePathname } from 'next/navigation';

const SelfDestruct = lazy(() => import('@/components/easter-eggs/SelfDestruct'));

const APP_HOSTS = ['localhost', '127.0.0.1', 'simplerdevelopment.com', 'www.simplerdevelopment.com'];

function useIsClientSite() {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    if (APP_HOSTS.includes(host)) return false;
    if (host.endsWith('.railway.app')) return false;
    return true;
  }, []);
}

export function LayoutContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isClientSiteByHost = useIsClientSite();
  const isPetersOutdoor = pathname.startsWith('/p/');
  const isAdminOrPortal = pathname.startsWith('/admin') || pathname.startsWith('/portal');
  const isPitchDeck = pathname.startsWith('/pitch-deck');
  const isBooking = pathname.startsWith('/book');
  const isSurvey = pathname.startsWith('/s/');
  const isClientSite = pathname.startsWith('/sites/') || isClientSiteByHost;

  if (isPetersOutdoor || isAdminOrPortal || isPitchDeck || isBooking || isSurvey || isClientSite) {
    return <>{children}</>;
  }

  return (
    <>
      <Navigation />
      <main className="flex-1">{children}</main>
      <Footer />
      <Suspense fallback={null}>
        <SelfDestruct />
      </Suspense>
    </>
  );
}
