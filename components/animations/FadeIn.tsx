'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  /**
   * Play the animation on mount instead of waiting for the element to scroll
   * into view. Use for above-the-fold content (e.g. hero CTAs): the scroll
   * `whileInView` path uses a `-100px` viewport margin, so an element sitting
   * near the fold on load can fall outside the detection area and never reveal.
   */
  immediate?: boolean;
}

export function FadeIn({
  children,
  delay = 0,
  duration = 0.6,
  className = '',
  immediate = false,
}: FadeInProps) {
  const reveal = immediate
    ? { animate: { opacity: 1, y: 0 } }
    : {
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-100px' },
      };
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      {...reveal}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
