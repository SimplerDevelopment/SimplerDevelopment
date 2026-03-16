import { Variants } from 'framer-motion';

/**
 * Common animation variants for consistent motion across the app
 */

export const fadeInVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

export const slideInVariants: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

export const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

/**
 * Easing functions for custom animations
 */
export const easing = {
  easeInOut: [0.4, 0, 0.2, 1],
  easeOut: [0.0, 0, 0.2, 1],
  easeIn: [0.4, 0, 1, 1],
  sharp: [0.4, 0, 0.6, 1],
  bounce: [0.68, -0.55, 0.265, 1.55],
  smooth: [0.25, 0.1, 0.25, 1],
} as const;

/**
 * Duration presets for animations
 */
export const duration = {
  fast: 0.3,
  normal: 0.6,
  slow: 1,
  verySlow: 1.5,
} as const;

/**
 * Helper to create stagger animations
 */
export function createStaggerVariants(
  staggerDelay = 0.1,
  childDelay = 0
): { container: Variants; item: Variants } {
  return {
    container: {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: staggerDelay,
          delayChildren: childDelay,
        },
      },
    },
    item: {
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: {
          duration: duration.normal,
          ease: easing.smooth,
        },
      },
    },
  };
}

/**
 * Helper to create parallax scroll effects
 */
export function createParallaxTransform(
  scrollProgress: number,
  speed = 0.5
): number {
  return scrollProgress * speed * 100;
}

/**
 * Helper to get viewport animation config
 */
export function getViewportConfig(margin = '-100px', once = true) {
  return {
    once,
    margin,
    amount: 0.3,
  };
}
