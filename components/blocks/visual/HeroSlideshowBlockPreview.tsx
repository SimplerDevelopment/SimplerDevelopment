'use client';

import { useState } from 'react';
import { HeroSlideshowBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface HeroSlideshowBlockPreviewProps {
  block: HeroSlideshowBlock;
  isSelected: boolean;
  onChange: (updates: Partial<HeroSlideshowBlock>) => void;
}

export function HeroSlideshowBlockPreview({ block, isSelected, onChange }: HeroSlideshowBlockPreviewProps) {
  const slides = block.slides || [];
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = slides[activeSlide];

  if (!slide) {
    return (
      <div style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', borderRadius: '8px' }}>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>No slides. Add slides in the settings panel.</p>
      </div>
    );
  }

  const hasBg = !!slide.backgroundImage;
  const overlayColor = slide.overlayColor || 'rgba(0,0,0,0.45)';
  const overlayOpacity = slide.overlayOpacity ?? 1;

  // Editor preview is intentionally compact (canvas) and STATIC — no autoplay, no Ken Burns, no transitions.
  // Production HeroSlideshowBlockRender uses min-h: 90vh with autoplay/Ken Burns; preview swaps to a fixed canvas height
  // with a slide indicator + dot navigation so the user can review each slide individually.
  const bgStyles: React.CSSProperties = {
    minHeight: '400px',
    borderRadius: '8px',
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 32px',
    backgroundImage: hasBg
      ? `url(${slide.backgroundImage})`
      : `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)`,
    backgroundSize: slide.backgroundSize || 'cover',
    backgroundPosition: slide.backgroundPosition || 'center',
    backgroundRepeat: slide.backgroundRepeat || 'no-repeat',
    textAlign: (slide.textAlignment || 'center') as React.CSSProperties['textAlign'],
  };

  // Deck-level nav colors (dots/arrows/progress) — mirror renderer defaults
  const arrowColor = block.arrowColor || '#fff';
  const arrowBackground = block.arrowBackground || 'rgba(255,255,255,0.12)';
  const arrowBorderColor = block.arrowBorderColor || 'rgba(255,255,255,0.2)';
  const dotColor = block.dotColor || 'rgba(255,255,255,0.4)';
  const dotActiveColor = block.dotActiveColor || '#fff';

  const goPrev = (e: React.MouseEvent) => { e.stopPropagation(); setActiveSlide((activeSlide - 1 + slides.length) % slides.length); };
  const goNext = (e: React.MouseEvent) => { e.stopPropagation(); setActiveSlide((activeSlide + 1) % slides.length); };

  return (
    <div style={bgStyles}>
      {/* Persistent background video */}
      {block.backgroundVideo && (
        <video
          src={block.backgroundVideo}
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            opacity: block.backgroundVideoOpacity ?? 1,
          }}
        />
      )}
      {/* Color overlay (separated from bg image so overlayOpacity is honored — matches renderer's SlideLayer) */}
      {hasBg && (
        <div style={{ position: 'absolute', inset: 0, background: overlayColor, opacity: overlayOpacity, zIndex: 1 }} />
      )}
      {/* Content */}
      <div style={{ maxWidth: '700px', width: '100%', position: 'relative', zIndex: 2 }}>
        {slide.subtitle && (
          <p
            style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: '11px',
              letterSpacing: '0.3em',
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              marginBottom: '12px',
              ...getElementCSS(block.elementStyles, 'subtitle'),
            }}
            dangerouslySetInnerHTML={{ __html: slide.subtitle }}
          />
        )}
        <h2
          style={{
            fontSize: 'clamp(1.75rem, 4vw, 3rem)',
            lineHeight: 1.15,
            color: '#fff',
            fontWeight: 700,
            marginBottom: '12px',
            ...getElementCSS(block.elementStyles, 'title'),
          }}
          dangerouslySetInnerHTML={{ __html: slide.title }}
        />
        {slide.description && (
          <p
            style={{
              color: 'rgba(255,255,255,0.75)',
              fontSize: '14px',
              lineHeight: 1.7,
              marginBottom: '20px',
              ...getElementCSS(block.elementStyles, 'description'),
            }}
            dangerouslySetInnerHTML={{ __html: slide.description }}
          />
        )}
        {slide.ctaText && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: slide.textAlignment === 'left' ? 'flex-start' : slide.textAlignment === 'right' ? 'flex-end' : 'center' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '10px 24px',
                borderRadius: '24px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: '#296CFA',
                color: '#fff',
                ...getElementCSS(block.elementStyles, 'cta'),
              }}
            >
              {slide.ctaText}
            </span>
            {slide.secondaryCtaText && (
              <span
                style={{
                  display: 'inline-block',
                  padding: '10px 24px',
                  borderRadius: '24px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: '#fff',
                  ...getElementCSS(block.elementStyles, 'secondaryCta'),
                }}
              >
                {slide.secondaryCtaText}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Editor navigation arrows — let user click through slides for review (production also shows them when showArrows=true) */}
      {slides.length > 1 && (block.showArrows !== false) && (
        <>
          <button
            onClick={goPrev}
            aria-label="Previous slide (preview)"
            style={{
              position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 10,
              width: '36px', height: '36px', borderRadius: '50%',
              background: arrowBackground, color: arrowColor, border: `1px solid ${arrowBorderColor}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
            }}
          >
            <span className="material-icons" style={{ fontSize: '18px' }}>chevron_left</span>
          </button>
          <button
            onClick={goNext}
            aria-label="Next slide (preview)"
            style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 10,
              width: '36px', height: '36px', borderRadius: '50%',
              background: arrowBackground, color: arrowColor, border: `1px solid ${arrowBorderColor}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
            }}
          >
            <span className="material-icons" style={{ fontSize: '18px' }}>chevron_right</span>
          </button>
        </>
      )}

      {/* Slide navigation dots — honor deck-level dotColor / dotActiveColor */}
      {slides.length > 1 && (block.showDots !== false) && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
          borderRadius: '20px',
          padding: '6px 12px',
        }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setActiveSlide(i); }}
              style={{
                width: i === activeSlide ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: i === activeSlide ? dotActiveColor : dotColor,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Slide indicator (editor-only chrome — confirms autoplay won't fire in editor) */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 10,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        color: '#fff',
        fontSize: '11px',
        padding: '4px 10px',
        borderRadius: '12px',
      }}>
        Slide {activeSlide + 1}/{slides.length} (autoplay paused in editor)
      </div>

      {/* Stats bar at bottom of hero — mirrors renderer's stats row */}
      {block.stats && block.stats.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5,
          padding: '16px 24px', background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px',
        }}>
          {block.stats.map((stat, i) => (
            <div key={stat.id} style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              {i > 0 && <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.1)' }} />}
              <div>
                <p style={{ color: '#fff', fontSize: '20px', fontWeight: 700, margin: 0, ...getElementCSS(block.elementStyles, 'statValue') }}>{stat.value}</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', margin: '2px 0 0', ...getElementCSS(block.elementStyles, 'statLabel') }}>{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
