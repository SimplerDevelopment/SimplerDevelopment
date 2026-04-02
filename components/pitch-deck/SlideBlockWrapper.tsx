'use client';

import type { PitchDeckTheme, PitchDeckSlideV2 } from '@/lib/db/schema';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';

interface SlideBlockWrapperProps {
  slide: PitchDeckSlideV2;
  theme: PitchDeckTheme;
  className?: string;
}

/**
 * Renders a pitch deck slide's blocks wrapped with the deck's theme styling.
 * Used in both the editor preview and the presentation viewer.
 */
export function SlideBlockWrapper({ slide, theme, className }: SlideBlockWrapperProps) {
  const content = JSON.stringify({
    blocks: slide.blocks,
    pageSettings: slide.pageSettings,
    version: '1.0',
  });

  return (
    <div
      className={`slide-themed ${className || ''}`}
      style={{
        backgroundColor: slide.pageSettings?.backgroundColor || theme.backgroundColor,
        color: theme.textColor,
        fontFamily: `"${theme.bodyFont}", sans-serif`,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.headingFont)}:wght@400;500;600;700;800;900&family=${encodeURIComponent(theme.bodyFont)}:wght@300;400;500;600;700&display=swap');
        .slide-themed h1, .slide-themed h2, .slide-themed h3,
        .slide-themed h4, .slide-themed h5, .slide-themed h6 {
          font-family: "${theme.headingFont}", sans-serif !important;
          color: ${theme.textColor} !important;
        }
        .slide-themed p, .slide-themed li, .slide-themed span {
          color: ${theme.textColor};
        }
        .slide-themed a, .slide-themed .text-primary {
          color: ${theme.primaryColor};
        }
      `}</style>
      <div
        className="w-full h-full flex flex-col justify-center"
        style={{
          ['--slide-primary' as string]: theme.primaryColor,
          ['--slide-accent' as string]: theme.accentColor,
          ['--slide-bg' as string]: theme.backgroundColor,
          ['--slide-text' as string]: theme.textColor,
          ['--slide-heading-font' as string]: theme.headingFont,
          ['--slide-body-font' as string]: theme.bodyFont,
        }}
      >
        <div className="w-full max-w-6xl mx-auto px-12 md:px-20 py-12">
          <BlockRenderer content={content} />
        </div>
      </div>
    </div>
  );
}
