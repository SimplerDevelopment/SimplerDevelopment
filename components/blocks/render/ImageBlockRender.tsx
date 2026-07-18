'use client';

import { ImageBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface ImageBlockRenderProps {
  block: ImageBlock;
}

export function ImageBlockRender({ block }: ImageBlockRenderProps) {
  const widthClass = {
    small: 'max-w-sm',
    medium: 'max-w-2xl',
    large: 'max-w-4xl',
    full: 'w-full',
  }[block.width || 'full'];

  const alignmentClass = {
    left: 'mr-auto',
    center: 'mx-auto',
    right: 'ml-auto',
  }[block.alignment || 'center'];

  // Generate responsive classes from block settings
  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility
      )
    : '';

  const style = typeof block.style === 'object' ? block.style : {};

  // No image selected yet: render a placeholder box instead of collapsing to
  // nothing (`return null`), which left the block zero-height and unselectable
  // in the editor. Inline colors keep it theme-independent on any client site.
  if (!block.url) {
    return (
      <div className={responsiveClasses}>
        <figure className={`${widthClass} ${alignmentClass} my-6`}>
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              aspectRatio: '16 / 9',
              minHeight: 160,
              background: 'linear-gradient(180deg,#f1f5f9,#e2e8f0)',
              color: '#94a3b8',
            }}
            aria-hidden="true"
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </div>
        </figure>
      </div>
    );
  }

  return (
    <div className={responsiveClasses}>
      <figure className={`${widthClass} ${alignmentClass} my-6`}>
        <img
          src={block.url}
          alt={block.alt}
          className={`w-full h-auto ${style.borderRadius ? '' : 'rounded-lg'}`}
        />
        {block.caption && (
          <figcaption
            className="text-center text-sm text-muted-foreground mt-2"
            style={getElementCSS(block.elementStyles, 'caption')}
          >
            {block.caption}
          </figcaption>
        )}
      </figure>
    </div>
  );
}
