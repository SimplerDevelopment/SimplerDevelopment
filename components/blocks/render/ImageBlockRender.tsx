'use client';

import { ImageBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

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

  if (!block.url) return null;

  return (
    <div className={responsiveClasses}>
      <figure className={`${widthClass} ${alignmentClass} my-6`}>
        <img
          src={block.url}
          alt={block.alt}
          className="w-full h-auto rounded-lg"
        />
        {block.caption && (
          <figcaption className="text-center text-sm text-muted-foreground mt-2">
            {block.caption}
          </figcaption>
        )}
      </figure>
    </div>
  );
}
