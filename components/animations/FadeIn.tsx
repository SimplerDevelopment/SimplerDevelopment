import { CSSProperties, ReactNode } from 'react';

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  /**
   * Render the content fully visible on first paint instead of revealing it on
   * scroll. Use for above-the-fold content (e.g. the hero H1/CTAs): the element
   * must NOT be hidden behind an animation, or it blocks Largest Contentful
   * Paint until JS/animation runs. (This used to be a framer-motion
   * `motion.div` starting at opacity 0, which pushed the hero LCP to ~7s on
   * throttled mobile.)
   */
  immediate?: boolean;
}

/**
 * Scroll-reveal fade-up. Pure CSS — no framer-motion, no client JS — so it adds
 * nothing to hydration/Total Blocking Time. Below-the-fold content reveals via a
 * CSS scroll-driven animation in browsers that support it (Chromium), and
 * gracefully plays once on load elsewhere. See `.sd-reveal` in app/globals.css.
 */
export function FadeIn({
  children,
  delay = 0,
  duration = 0.6,
  className = '',
  immediate = false,
}: FadeInProps) {
  if (immediate) {
    return <div className={className}>{children}</div>;
  }

  const style: CSSProperties = {};
  if (delay) style.animationDelay = `${delay}s`;
  if (duration !== 0.6) style.animationDuration = `${duration}s`;

  return (
    <div className={`sd-reveal ${className}`} style={Object.keys(style).length ? style : undefined}>
      {children}
    </div>
  );
}
