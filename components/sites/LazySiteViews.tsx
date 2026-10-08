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
// gate) were ~24 KB raw of JS on every ordinary content page; AbGoalTracker is
// only mounted for a page under an A/B experiment. `dynamic()` declared inside a
// client module is a true split point: the chunk is fetched only when the
// branch renders. ssr stays default-true so the storefront/gate still
// server-render for first paint.
export const ProductPage = dynamic(() =>
  import('@/components/storefront/ProductPage').then((m) => m.ProductPage));
export const ShopPage = dynamic(() =>
  import('@/components/storefront/ShopPage').then((m) => m.ShopPage));
export const AccessCodeForm = dynamic(() =>
  import('@/components/marketing/AccessCodeForm').then((m) => m.AccessCodeForm));
export const AbGoalTracker = dynamic(() =>
  import('@/components/blocks/AbGoalTracker').then((m) => m.AbGoalTracker));
