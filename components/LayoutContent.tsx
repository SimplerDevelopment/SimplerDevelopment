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

// Route prefixes that render their OWN shell (or are standalone public
// documents / embeddable widgets / auth screens) and must NOT get the app's
// marketing Navigation + Footer. A nested layout cannot remove the root chrome,
// so every such surface must be listed here. Add new standalone routes to this
// list rather than reintroducing per-route booleans.
const STANDALONE_PREFIXES = [
  '/admin',              // internal admin panel (own chrome)
  '/portal',             // tenant client portal (own chrome)
  '/pitch-deck',         // full-screen presentation
  '/book',               // public booking pages (incl. /book/quote)
  '/s/',                 // public surveys
  '/proposal',           // public signable proposal document
  '/contract',           // public e-sign contract document
  '/approve',            // token-gated approval reviewer
  '/widget',             // embeddable iframe widgets (e.g. chat)
  '/oauth',              // OAuth consent / authorize screens
  '/preview',            // block-editor live preview pane
  '/block-editor',       // detached block-editor popups
  '/gift-certificates',  // public gift-certificate purchase flow
  '/sites/',             // client-site routes multiplexed on an app host
  '/docs',               // developer docs ship their own chrome (DocsChrome)
];

export function LayoutContent({ children, isClientSite: isClientSiteProp = false }: { children: ReactNode; isClientSite?: boolean }) {
  const pathname = usePathname();

  if (isClientSiteProp || STANDALONE_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
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
