'use client';

import { useEffect, useState } from 'react';
import { useScroll, useTransform, MotionValue } from 'framer-motion';

interface UseScrollAnimationOptions {
  offset?: [string, string];
  smooth?: boolean;
}

export function useScrollAnimation(options: UseScrollAnimationOptions = {}) {
  const { offset = ['start end', 'end start'], smooth = true } = options;

  const { scrollYProgress } = useScroll({
    offset: offset as any,
  });

  return {
    scrollYProgress,
    opacity: useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]),
    scale: useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1, 0.9]),
    y: useTransform(scrollYProgress, [0, 1], ['0%', '50%']),
  };
}

export function useScrollDirection() {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY) {
        setScrollDirection('down');
      } else if (currentScrollY < lastScrollY) {
        setScrollDirection('up');
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  return scrollDirection;
}

export function useScrollProgress(): MotionValue<number> {
  const { scrollYProgress } = useScroll();
  return scrollYProgress;
}

export function useInView(threshold = 0.1) {
  const [isInView, setIsInView] = useState(false);
  const [hasBeenInView, setHasBeenInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
        if (entry.isIntersecting && !hasBeenInView) {
          setHasBeenInView(true);
        }
      },
      { threshold }
    );

    const element = document.querySelector('[data-observe]');
    if (element) {
      observer.observe(element);
    }

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [threshold, hasBeenInView]);

  return { isInView, hasBeenInView };
}
