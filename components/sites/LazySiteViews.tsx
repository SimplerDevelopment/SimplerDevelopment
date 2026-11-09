'use client';

import dynamic from 'next/dynamic';

// Conditionally-rendered client views of the public tenant page route
// (app/sites/[domain]/[[...slug]]/page.tsx), behind real async split points.
//
// WHY A CLIENT FILE (PUX-241): the page is a server component. A static import
// of a 'use client' module there — or a `dynamic()` declared there — makes it a
// client reference of the page, and a page's client references are listed in
// its `entryJSFiles` and loaded on every request whether or not the branch
// renders. ProductPage/ShopPage (storefront) and AccessCodeForm (access-code
// gate) were ~24 KB raw of JS on every ordinary content page. `dynamic()`
// declared inside a client module is a true split point: the chunk is fetched
// only when the branch renders. ssr stays default-true so the storefront/gate
// still server-render for first paint.
//
// Only 'use client' modules belong here. A server component (e.g. AbGoalTracker)
// imported statically by the page already ships zero client JS — wrapping it in
// dynamic() here would turn it INTO a client chunk (PUX-251).
export const ProductPage = dynamic(() =>
  import('@/components/storefront/ProductPage').then((m) => m.ProductPage));
export const ShopPage = dynamic(() =>
  import('@/components/storefront/ShopPage').then((m) => m.ShopPage));
export const AccessCodeForm = dynamic(() =>
  import('@/components/marketing/AccessCodeForm').then((m) => m.AccessCodeForm));
