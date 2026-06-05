'use client';

import { Navigation } from '@/components/ui/Navigation';
import { Footer } from '@/components/ui/Footer';
import { ReactNode, lazy, Suspense } from 'react';
import { usePathname } from 'next/navigation';
// Generic dependency-free top-of-page route-transition bar (also used by public
// client sites). Mounted here so it covers the full marketing surface — the
// homepage plus every /(pages) route — and nothing else, since the excluded
// surfaces below return early before it renders.
import { SiteRouteProgress } from '@/components/sites/SiteRouteProgress';

const SelfDestruct = lazy(() => import('@/components/easter-eggs/SelfDestruct'));

export function LayoutContent({ children, isClientSite: isClientSiteProp = false }: { children: ReactNode; isClientSite?: boolean }) {
  const pathname = usePathname();
  const isPetersOutdoor = pathname.startsWith('/p/');
  const isAdminOrPortal = pathname.startsWith('/admin') || pathname.startsWith('/portal');
  const isPitchDeck = pathname.startsWith('/pitch-deck');
  const isBooking = pathname.startsWith('/book');
  const isSurvey = pathname.startsWith('/s/');
  const isSitesRoute = pathname.startsWith('/sites/');

  if (isPetersOutdoor || isAdminOrPortal || isPitchDeck || isBooking || isSurvey || isClientSiteProp || isSitesRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <SiteRouteProgress color="var(--primary)" />
      <Navigation />
      <main className="flex-1">{children}</main>
      <Footer />
      <Suspense fallback={null}>
        <SelfDestruct />
      </Suspense>
    </>
  );
}
