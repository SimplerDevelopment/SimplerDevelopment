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

  // Build background with image + overlay using gradient overlay trick
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
      ? `linear-gradient(${overlayColor}, ${overlayColor}), url(${slide.backgroundImage})`
      : `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)`,
    backgroundSize: slide.backgroundSize || 'cover',
    backgroundPosition: slide.backgroundPosition || 'center',
    backgroundRepeat: slide.backgroundRepeat || 'no-repeat',
    textAlign: (slide.textAlignment || 'center') as React.CSSProperties['textAlign'],
  };

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

      {/* Slide navigation dots */}
      {slides.length > 1 && (
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
                background: i === activeSlide ? '#fff' : 'rgba(255,255,255,0.4)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Slide indicator */}
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
        Slide {activeSlide + 1}/{slides.length}
      </div>
    </div>
  );
}
