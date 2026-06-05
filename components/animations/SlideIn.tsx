import { CSSProperties, ReactNode } from 'react';

type Direction = 'left' | 'right' | 'up' | 'down';

interface SlideInProps {
  children: ReactNode;
  direction?: Direction;
  delay?: number;
  duration?: number;
  distance?: number;
  className?: string;
}

/**
 * Scroll-reveal slide-in. Pure CSS — no framer-motion, no client JS. Reveals via
 * a CSS scroll-driven animation where supported (Chromium) and otherwise plays
 * once on load. The travel distance/direction is driven by CSS custom properties
 * consumed by `.sd-slide` in app/globals.css.
 */
export function SlideIn({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.6,
  distance = 50,
  className = '',
}: SlideInProps) {
  const axis = direction === 'left' || direction === 'right' ? 'X' : 'Y';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;

  const style = {
    '--sd-slide-translate': `${sign * distance}px`,
  } as CSSProperties & Record<string, string>;
  if (delay) style.animationDelay = `${delay}s`;
  if (duration !== 0.6) style.animationDuration = `${duration}s`;

  return (
    <div className={`sd-slide sd-slide--${axis === 'X' ? 'x' : 'y'} ${className}`} style={style}>
      {children}
    </div>
  );
}
