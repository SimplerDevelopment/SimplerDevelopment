// Portal-only faces (PUX-142).
//
// Declared HERE rather than in `app/layout.tsx` on purpose. next/font emits
// its <link rel=preload> from the font manifest keyed by the DECLARING
// module, not by whether the className is applied — the root layout is in
// every route's graph, so a face declared there is preloaded on public client
// sites too, which resolve none of these. That mistake shipped once and cost
// 53KB on every tenant page; see the long note in app/layout.tsx.
//
// This module is only ever reached through `/portal/**`, so a client site
// never sees it. `preload: false` is belt-and-braces, matching the convention
// the root layout settled on for its own non-critical faces.
import { Bricolage_Grotesque } from 'next/font/google';

/** Titles across the Studio portal redesign. The work itself stays Geist. */
export const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});
