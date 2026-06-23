'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HeroSlideshowBlock, HeroSlideshowSlide } from '@/types/blocks';
import { Button } from '@/components/ui/Button';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';

interface HeroSlideshowBlockRenderProps {
  block: HeroSlideshowBlock;
}

export function HeroSlideshowBlockRender({ block }: HeroSlideshowBlockRenderProps) {
  const {
    slides = [],
    autoplay = true,
    interval = 6000,
    transition = 'fade',
    transitionDuration = 800,
    showDots = true,
    showArrows = true,
    pauseOnHover = true,
    height = '90vh',
    kenBurns = true,
    backgroundVideo,
    backgroundVideoOpacity = 1,
    arrowColor = '#fff',
    arrowBackground = 'rgba(255,255,255,0.12)',
    arrowBorderColor = 'rgba(255,255,255,0.2)',
    dotColor = 'rgba(255,255,255,0.4)',
    dotActiveColor = '#fff',
    progressBarColor = 'rgba(255,255,255,0.5)',
  } = block;

  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideCount = slides.length;

  const goTo = useCallback((index: number) => {
    if (isTransitioning || slideCount <= 1) return;
    setIsTransitioning(true);
    setCurrent(index);
    setTimeout(() => setIsTransitioning(false), transitionDuration);
  }, [isTransitioning, slideCount, transitionDuration]);

  const next = useCallback(() => goTo((current + 1) % slideCount), [current, slideCount, goTo]);
  const prev = useCallback(() => goTo((current - 1 + slideCount) % slideCount), [current, slideCount, goTo]);

  // Autoplay
  useEffect(() => {
    if (!autoplay || isPaused || slideCount <= 1) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(next, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoplay, isPaused, interval, next, slideCount]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next]);

  if (slideCount === 0) return null;

  const transMs = transitionDuration;

  return (
    <div
      className="relative overflow-hidden"
      style={{ minHeight: height, height }}
      onMouseEnter={() => pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => pauseOnHover && setIsPaused(false)}
    >
      {/* Persistent background video — plays continuously behind all slide images */}
      {backgroundVideo && (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src={backgroundVideo}
          autoPlay
          muted
          loop
          playsInline
          style={{ opacity: backgroundVideoOpacity, zIndex: 1 }}
        />
      )}

      {/* Slides */}
      {slides.map((slide, i) => (
        <SlideLayer
          key={slide.id}
          slide={slide}
          isActive={i === current}
          transition={transition}
          transMs={transMs}
          kenBurns={kenBurns}
          elementStyles={block.elementStyles}
          hasBlockVideo={!!backgroundVideo}
        />
      ))}

      {/* Arrows */}
      {showArrows && slideCount > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
            style={{
              background: arrowBackground,
              backdropFilter: 'blur(8px)',
              border: `1px solid ${arrowBorderColor}`,
              color: arrowColor,
            }}
            aria-label="Previous slide"
          >
            <span className="material-icons text-xl">chevron_left</span>
          </button>
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
            style={{
              background: arrowBackground,
              backdropFilter: 'blur(8px)',
              border: `1px solid ${arrowBorderColor}`,
              color: arrowColor,
            }}
            aria-label="Next slide"
          >
            <span className="material-icons text-xl">chevron_right</span>
          </button>
        </>
      )}

      {/* Dots */}
      {showDots && slideCount > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="transition-all duration-500 rounded-full"
              style={{
                width: i === current ? '32px' : '10px',
                height: '10px',
                background: i === current ? dotActiveColor : dotColor,
                border: 'none',
                cursor: 'pointer',
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Progress bar */}
      {autoplay && slideCount > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-30 h-[3px]" style={{ background: `${dotColor}` }}>
          <div
            className="h-full"
            style={{
              background: progressBarColor,
              width: isPaused ? `${((current + 1) / slideCount) * 100}%` : '100%',
              transition: isPaused ? 'none' : `width ${interval}ms linear`,
              animation: isPaused ? 'none' : undefined,
            }}
            key={current}
          />
        </div>
      )}

      {/* Stats bar at bottom of hero */}
      {block.stats && block.stats.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-6 md:px-12 lg:px-20 pb-4 md:pb-8 lg:pb-12">
          <div className="max-w-7xl mx-auto">
            <div
              className="pt-4 md:pt-8 flex flex-wrap items-center gap-x-6 md:gap-x-12 gap-y-3 md:gap-y-4"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              {block.stats.map((stat, i) => (
                <React.Fragment key={stat.id}>
                  {i > 0 && (
                    <div className="w-px h-10 hidden md:block" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  )}
                  <div>
                    <p style={getElementCSS(block.elementStyles, 'statValue')}>
                      {stat.value}
                    </p>
                    <p className="mt-0.5 md:mt-1" style={getElementCSS(block.elementStyles, 'statLabel')}>
                      {stat.label}
                    </p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Individual Slide ──────────────────────────────────────────────────────

interface SlideLayerProps {
  slide: HeroSlideshowSlide;
  isActive: boolean;
  transition: 'fade' | 'slide' | 'zoom';
  transMs: number;
  kenBurns: boolean;
  elementStyles?: Record<string, Record<string, string | undefined>>;
  hasBlockVideo?: boolean;
}

function SlideLayer({ slide, isActive, transition, transMs, kenBurns, elementStyles, hasBlockVideo }: SlideLayerProps) {
  const overlayColor = slide.overlayColor || 'rgba(0,0,0,0.45)';
  const overlayOpacity = slide.overlayOpacity ?? 1;
  const textAlign = slide.textAlignment || 'center';

  // Transition styles per mode
  const baseTransition = `all ${transMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  let layerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: isActive ? 20 : 10,
    transition: baseTransition,
  };

  if (transition === 'fade') {
    layerStyle.opacity = isActive ? 1 : 0;
  } else if (transition === 'slide') {
    layerStyle.transform = isActive ? 'translateX(0)' : 'translateX(100%)';
    layerStyle.opacity = isActive ? 1 : 0;
  } else if (transition === 'zoom') {
    layerStyle.transform = isActive ? 'scale(1)' : 'scale(1.1)';
    layerStyle.opacity = isActive ? 1 : 0;
  }

  const alignClass = {
    left: 'text-left items-start',
    center: 'text-center items-center',
    right: 'text-right items-end',
  }[textAlign];

  return (
    <div style={layerStyle}>
      {/* Background video — renders behind the image */}
      {slide.backgroundVideo && (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src={slide.backgroundVideo}
          autoPlay
          muted
          loop
          playsInline
          style={{ zIndex: 0 }}
        />
      )}

      {/* Background image with Ken Burns — skipped when persistent block video is playing */}
      {slide.backgroundImage && !hasBlockVideo && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${slide.backgroundImage})`,
            backgroundSize: slide.backgroundSize || 'cover',
            backgroundPosition: slide.backgroundPosition || 'center',
            backgroundRepeat: slide.backgroundRepeat || 'no-repeat',
            transform: isActive && kenBurns ? 'scale(1.08)' : 'scale(1)',
            transition: kenBurns ? `transform ${8000}ms ease-out` : undefined,
            zIndex: 1,
          }}
        />
      )}

      {/* Color overlay */}
      <div
        className="absolute inset-0"
        style={{ background: overlayColor, opacity: overlayOpacity, zIndex: 2 }}
      />

      {/* Content */}
      <div className={`relative h-full flex flex-col justify-center ${alignClass} px-6 md:px-12 lg:px-20 pb-40 md:pb-32 lg:pb-28 pt-20 md:pt-12`} style={{ zIndex: 3 }}>
        <div className={`w-full ${textAlign === 'center' ? 'max-w-4xl mx-auto' : 'max-w-7xl mx-auto'}`} style={{ textAlign }}>
          {slide.subtitle && (
            <p
              className="font-semibold mb-4 uppercase tracking-widest"
              style={{
                color: 'rgba(255,255,255,0.8)',
                fontSize: '0.8125rem',
                letterSpacing: '0.3em',
                ...getElementCSS(elementStyles, 'subtitle'),
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(slide.subtitle) }}
            />
          )}

          <h2
            className="font-display font-bold mb-6"
            style={{
              fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
              lineHeight: '1.1',
              color: '#fff',
              ...getElementCSS(elementStyles, 'title'),
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(slide.title) }}
          />

          {slide.description && (
            <p
              className="mb-10 max-w-2xl"
              style={{
                fontSize: '1.125rem',
                lineHeight: '1.75',
                color: 'rgba(255,255,255,0.75)',
                margin: textAlign === 'center' ? '0 auto 2.5rem' : undefined,
                ...getElementCSS(elementStyles, 'description'),
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(slide.description) }}
            />
          )}

          <div className={`flex flex-col sm:flex-row gap-4 ${textAlign === 'center' ? 'justify-center' : textAlign === 'right' ? 'justify-end' : ''}`}>
            {slide.ctaText && slide.ctaLink && (
              <Button href={slide.ctaLink} size="lg" style={getElementCSS(elementStyles, 'cta')}>
                {slide.ctaText}
              </Button>
            )}
            {slide.secondaryCtaText && slide.secondaryCtaLink && (
              <Button href={slide.secondaryCtaLink} variant="outline" size="lg" style={getElementCSS(elementStyles, 'secondaryCta')}>
                {slide.secondaryCtaText}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
