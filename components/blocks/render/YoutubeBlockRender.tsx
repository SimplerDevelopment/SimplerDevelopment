'use client';

import { YoutubeBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface YoutubeBlockRenderProps {
  block: YoutubeBlock;
}

export function YoutubeBlockRender({ block }: YoutubeBlockRenderProps) {
  const getYoutubeEmbedUrl = (url: string) => {
    if (!url) return '';

    if (url.includes('youtube.com/watch?v=')) {
      const videoId = url.split('v=')[1]?.split('&')[0];
      return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1]?.split('?')[0];
      return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.includes('youtube.com/embed/')) {
      return url;
    }
    return `https://www.youtube.com/embed/${url}`;
  };

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
            <iframe
              src={getYoutubeEmbedUrl(block.url)}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
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
