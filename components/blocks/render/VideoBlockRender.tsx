'use client';

import { VideoBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface VideoBlockRenderProps {
  block: VideoBlock;
}

export function VideoBlockRender({ block }: VideoBlockRenderProps) {
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

  return (
    <div className={`py-8 my-8 ${responsiveClasses}`}>
      <div className="max-w-4xl mx-auto">
        {block.url && (
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            <video
              src={block.url}
              controls={block.controls !== false}
              autoPlay={block.autoplay || false}
              className="w-full h-full"
            />
          </div>
        )}
        {block.caption && (
          <p className="text-sm text-muted-foreground mt-2 text-center italic">
            {block.caption}
          </p>
        )}
      </div>
    </div>
  );
}
