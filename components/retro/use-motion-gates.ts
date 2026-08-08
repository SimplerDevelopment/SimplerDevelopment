'use client';

/**
 * The two questions every animated island on the marketing pages has to ask.
 *
 * WHY THE DESKTOP GATE EXISTS. A Lighthouse mobile run against production on
 * 2026-08-07 scored the homepage 28 with TBT 20,240ms, against 4,210ms for
 * /about — which carries no WebGL. The culprit was not bundle size: the same
 * shared chunk executed 3,140ms on /about and 34,767ms on the homepage, all of
 * it `scripting`. That is two react-three-fiber scenes driving useFrame at
 * 60fps through React's reconciler on a 4x-throttled CPU, for the length of the
 * trace.
 *
 * So WebGL is desktop-only now. `pointer: fine` is in the query as well as a
 * width floor because a 1024px-wide tablet is still a mobile-class CPU, and
 * width alone would let it through.
 *
 * Callers must render a real fallback rather than nothing — a hero that expects
 * a night sky should still get one, just made of CSS instead of a rAF loop.
 */
import { useSyncExternalStore } from 'react';

const DESKTOP_QUERY = '(min-width: 1024px) and (pointer: fine)';
const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(query: string) {
  return (onChange: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  };
}

const subscribeDesktop = subscribe(DESKTOP_QUERY);
const subscribeMotion = subscribe(MOTION_QUERY);

/**
 * True only where a continuous WebGL loop is affordable.
 *
 * Server snapshot is FALSE on purpose: the cheap path renders first and the
 * client upgrades on mount. Guessing true would ship a canvas to phones for a
 * frame, which is the exact cost this hook exists to avoid.
 */
export function useCanRunWebGL(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false, // server: assume motion is fine, the client corrects on mount
  );
}
