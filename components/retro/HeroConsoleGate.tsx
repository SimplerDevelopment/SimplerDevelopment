'use client';

/**
 * Client gate for the animated hero console.
 *
 * Same pattern and same reason as StarFieldGate: `dynamic(..., { ssr: false })`
 * is only legal inside a Client Component, and the marketing pages are
 * deliberately Server Components with near-zero hydration (see the header of
 * app/(pages)/HomeClient.tsx). Giving the video its own tiny island keeps the
 * rest of the hero — headline, copy, CTAs — out of the hydration path.
 *
 * `loading` renders the poster server-side so the hero's LCP candidate is in
 * the HTML immediately and does not wait on the island to hydrate.
 */
import dynamic from 'next/dynamic';
import Image from 'next/image';

const HeroConsole = dynamic(() => import('./HeroConsole'), {
  ssr: false,
  loading: () => (
    <div className="relative w-full self-center">
      <Image
        src="/retro/hero-console-poster.webp"
        alt=""
        width={1128}
        height={334}
        priority
        className="h-auto w-full object-contain"
      />
    </div>
  ),
});

export default function HeroConsoleGate({ className }: { className?: string }) {
  return <HeroConsole className={className} />;
}
