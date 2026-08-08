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
 *
 * The desktop check sits HERE rather than inside StarField on purpose: a
 * `dynamic` import only fires when its component actually renders, so gating at
 * this level means a phone never downloads, parses, or executes the three.js
 * chunk at all. Gating inside the component would pay the whole bundle cost to
 * then render nothing. See use-motion-gates.ts for the measurement behind it.
 */
import dynamic from 'next/dynamic';

import { useCanRunWebGL } from './use-motion-gates';

const StarField = dynamic(() => import('./StarField'), { ssr: false });

/**
 * The mobile night sky: same job, zero JavaScript.
 *
 * Two tiled layers of `radial-gradient` dots at different tile sizes, which
 * reads as depth for the same reason the WebGL version splits into bands. The
 * mask cuts an ellipse out of the middle so the hero copy sits on clean ink —
 * the same clear centre the canvas builds by spawning stars on screen radius.
 */
const NEAR = '96px 96px, 96px 96px, 96px 96px, 96px 96px';
const FAR = '61px 61px, 61px 61px, 61px 61px';

function CssStarField({ className = '' }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className}`}
      aria-hidden
      style={{
        backgroundImage: [
          'radial-gradient(1.4px 1.4px at 18px 26px, var(--retro-gold), transparent)',
          'radial-gradient(1px 1px at 71px 12px, var(--retro-cream), transparent)',
          'radial-gradient(1px 1px at 42px 63px, var(--retro-cream), transparent)',
          'radial-gradient(1.2px 1.2px at 88px 81px, var(--retro-cream), transparent)',
          'radial-gradient(1px 1px at 9px 44px, var(--retro-cream), transparent)',
          'radial-gradient(1px 1px at 53px 7px, var(--retro-cream), transparent)',
          'radial-gradient(1px 1px at 31px 38px, var(--retro-cream), transparent)',
        ].join(','),
        backgroundSize: `${NEAR}, ${FAR}`,
        opacity: 0.7,
        maskImage: 'radial-gradient(ellipse 60% 44% at 50% 40%, transparent 35%, #000 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 60% 44% at 50% 40%, transparent 35%, #000 100%)',
      }}
    />
  );
}

export default function StarFieldGate({ className }: { className?: string }) {
  return useCanRunWebGL() ? <StarField className={className} /> : <CssStarField className={className} />;
}
