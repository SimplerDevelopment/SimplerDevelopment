'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

// App chrome (NextAuth SessionProvider + LayoutContent → marketing
// Navigation/Footer/UserDropdown/lib/data/solutions) for the NON-tenant
// surfaces: marketing, portal, admin.
//
// WHY THIS IS A CLIENT FILE (PUX-241): these two `dynamic()` calls used to sit
// in app/layout.tsx, a SERVER component. There, `dynamic(() => import(client))`
// compiles to a client reference — and every client reference of a layout is
// listed in that layout's `entryJSFiles`, which Next emits as <script> tags on
// EVERY route that uses the layout, rendered or not. Measured on a one-paragraph
// tenant page: 26 KB of next-auth + 50 KB of marketing Navigation/Footer/
// solutions data shipped to (and were evaluated by) every tenant site visitor,
// despite the isClientSite branch never rendering them.
//
// Declared HERE, inside a client module, the import() is a true async split
// point: the chunks load only when <AppChromeShell> actually renders, and the
// layout's client entry is just this tiny shell. SSR output for the app
// surfaces is unchanged (ssr stays default-true).
const SessionProvider = dynamic(() => import('@/components/SessionProvider'));
const LayoutContent = dynamic(() =>
  import('@/components/LayoutContent').then((m) => m.LayoutContent),
);

export function AppChromeShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <LayoutContent isClientSite={false}>{children}</LayoutContent>
    </SessionProvider>
  );
}
