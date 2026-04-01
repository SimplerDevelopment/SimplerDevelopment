'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { SlideBlockWrapper } from '@/components/pitch-deck/SlideBlockWrapper';

interface Props {
  slides: PitchDeckSlideV2[];
  theme: PitchDeckTheme;
  title: string;
  isDraft?: boolean;
}

export default function PitchDeckPresentation({ slides, theme, title, isDraft }: Props) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [isAnimating, setIsAnimating] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const goTo = useCallback((idx: number, dir?: 'next' | 'prev') => {
    if (idx < 0 || idx >= slides.length || isAnimating) return;
    setDirection(dir || (idx > current ? 'next' : 'prev'));
    setIsAnimating(true);
    setCurrent(idx);
    setTimeout(() => setIsAnimating(false), 400);
  }, [current, slides.length, isAnimating]);

  const next = useCallback(() => goTo(current + 1, 'next'), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1, 'prev'), [current, goTo]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        prev();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [next, prev]);

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStart(e.touches[0].clientX);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
    setTouchStart(null);
  }

  if (slides.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}>
        <p style={{ fontFamily: theme.bodyFont }}>No slides in this presentation.</p>
      </div>
    );
  }

  const slide = slides[current];
  const fontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.headingFont)}:wght@300;400;500;600;700;800&family=${encodeURIComponent(theme.bodyFont)}:wght@300;400;500;600&display=swap`;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href={fontsUrl} rel="stylesheet" />
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />

      <div
        className="min-h-screen w-full overflow-hidden relative select-none"
        style={{ backgroundColor: theme.backgroundColor, color: theme.textColor, fontFamily: theme.bodyFont }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Draft banner */}
        {isDraft && (
          <div className="absolute top-0 left-0 right-0 z-30 bg-yellow-500/90 text-black text-center text-xs font-medium py-1 tracking-wide">
            DRAFT PREVIEW — This deck is not published
          </div>
        )}

        {/* Slide counter */}
        <div className="absolute top-6 left-8 z-20 text-sm opacity-40 tracking-widest font-light" style={{ fontFamily: theme.bodyFont }}>
          {String(current + 1).padStart(2, '0')}/{String(slides.length).padStart(2, '0')}
        </div>

        {/* SimplerDevelopment branding */}
        <div className="absolute top-5 right-8 z-20 flex items-center gap-2 opacity-30 hover:opacity-60 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/iconLogo.png" alt="" className="h-6 w-6 brightness-0 invert" />
          <span className="text-xs tracking-wide font-light" style={{ color: theme.textColor, fontFamily: theme.bodyFont }}>
            <b className="font-semibold">Simpler</b> Development
          </span>
        </div>

        {/* Navigation hint - only on first slide */}
        {current === 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 text-xs opacity-20 tracking-wide" style={{ fontFamily: theme.bodyFont }}>
            Press arrow keys or spacebar &middot; Swipe on mobile
          </div>
        )}

        {/* Prev/Next buttons */}
        {current > 0 && (
          <button onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full transition-all opacity-0 hover:opacity-60"
            style={{ color: theme.textColor }}>
            <span className="material-icons text-3xl">chevron_left</span>
          </button>
        )}
        {current < slides.length - 1 && (
          <button onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full transition-all opacity-0 hover:opacity-60"
            style={{ color: theme.textColor }}>
            <span className="material-icons text-3xl">chevron_right</span>
          </button>
        )}

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] z-20" style={{ backgroundColor: theme.textColor + '10' }}>
          <div className="h-full transition-all duration-500 ease-out" style={{
            width: `${((current + 1) / slides.length) * 100}%`,
            backgroundColor: theme.accentColor,
          }} />
        </div>

        {/* Slide content rendered via BlockRenderer */}
        <div
          className="min-h-screen flex items-center justify-center"
          style={{
            animation: isAnimating
              ? `slideIn${direction === 'next' ? 'Left' : 'Right'} 0.4s ease-out`
              : undefined,
          }}
        >
          <SlideBlockWrapper
            slide={slide}
            theme={theme}
            className="min-h-screen w-full flex items-center justify-center"
          />
        </div>
      </div>

      <style>{`
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(60px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(-60px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
