'use client';

import { useRef, useEffect } from 'react';
import type { PitchDeckTheme, PitchDeckSlideV2 } from '@/lib/db/schema';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';

interface SlideBlockWrapperProps {
  slide: PitchDeckSlideV2;
  theme: PitchDeckTheme;
  className?: string;
  /** When true (live viewer / presenter), drop the vertical padding around block content. */
  presentation?: boolean;
}

/**
 * Renders a pitch deck slide's blocks wrapped with the deck's theme styling.
 * Used in both the editor preview and the presentation viewer.
 */
export function SlideBlockWrapper({ slide, theme, className, presentation = false }: SlideBlockWrapperProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const content = JSON.stringify({
    blocks: slide.blocks,
    pageSettings: slide.pageSettings,
    version: '1.0',
  });

  // Set CSS custom properties imperatively — React's style object
  // inconsistently handles custom properties during SSR
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const vars: Record<string, string> = {
      '--foreground': theme.textColor,
      '--card-foreground': theme.textColor,
      '--background': theme.backgroundColor,
      '--card': theme.backgroundColor,
      '--primary': theme.primaryColor,
      '--primary-foreground': theme.backgroundColor,
      '--muted': `color-mix(in srgb, ${theme.textColor} 10%, ${theme.backgroundColor})`,
      '--muted-foreground': `color-mix(in srgb, ${theme.textColor} 70%, transparent)`,
      '--accent': `color-mix(in srgb, ${theme.textColor} 10%, ${theme.backgroundColor})`,
      '--accent-foreground': theme.textColor,
      '--border': `color-mix(in srgb, ${theme.textColor} 20%, transparent)`,
    };
    for (const [k, v] of Object.entries(vars)) {
      el.style.setProperty(k, v);
    }
  }, [theme]);

  return (
    <div
      ref={rootRef}
      className={`slide-themed ${className || ''} relative`}
      style={{
        backgroundColor: slide.pageSettings?.backgroundColor || theme.backgroundColor,
        color: theme.textColor,
        fontFamily: `"${theme.bodyFont}", sans-serif`,
        width: '100%',
        minHeight: '100%',
      }}
    >
      {/* Background image overlay (separate div for opacity control) */}
      {slide.pageSettings?.backgroundImage && (
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${slide.pageSettings.backgroundImage})`,
            backgroundSize: slide.pageSettings.backgroundSize || 'cover',
            backgroundPosition: slide.pageSettings.backgroundPosition || 'center',
            backgroundRepeat: slide.pageSettings.backgroundRepeat || 'no-repeat',
            opacity: slide.pageSettings.backgroundOpacity ?? 1,
          }}
        />
      )}
      {/* Background video */}
      {slide.pageSettings?.backgroundVideo && (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
          style={{ opacity: slide.pageSettings.backgroundOpacity ?? 1 }}
          src={slide.pageSettings.backgroundVideo}
        />
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.headingFont)}:wght@400;500;600;700;800;900&family=${encodeURIComponent(theme.bodyFont)}:wght@300;400;500;600;700&display=swap');
        .slide-themed h1, .slide-themed h2, .slide-themed h3,
        .slide-themed h4, .slide-themed h5, .slide-themed h6 {
          font-family: "${theme.headingFont}", sans-serif !important;
        }
        .slide-themed a {
          color: ${theme.accentColor};
        }
      `}</style>
      <div
        className="w-full min-h-full flex flex-col relative z-10"
        style={{
          ['--slide-primary' as string]: theme.primaryColor,
          ['--slide-accent' as string]: theme.accentColor,
          ['--slide-bg' as string]: theme.backgroundColor,
          ['--slide-text' as string]: theme.textColor,
          ['--slide-heading-font' as string]: theme.headingFont,
          ['--slide-body-font' as string]: theme.bodyFont,
        }}
      >
        <div
          className={`w-full max-w-6xl mx-auto px-12 md:px-20 ${presentation ? 'py-0' : 'py-12'}`}
          style={{ marginTop: 'auto', marginBottom: 'auto' }}
        >
          <BlockRenderer content={content} />
        </div>
      </div>
    </div>
  );
}
