'use client';

/**
 * Client gate for the WebGL starfield.
 *
 * `dynamic(..., { ssr: false })` is only legal inside a Client Component, and
 * the marketing pages are deliberately Server Components with near-zero
 * hydration (see the header of app/(pages)/HomeClient.tsx — making the whole
 * page a client component once pushed mobile LCP render-delay to ~5s). So the
 * canvas gets its own tiny client island instead of turning its host page into
 * one. Same pattern as HeroBackground / FeaturesBackgroundGate.
 */
import dynamic from 'next/dynamic';

const StarField = dynamic(() => import('./StarField'), { ssr: false });

export default function StarFieldGate({ className }: { className?: string }) {
  return <StarField className={className} />;
}
