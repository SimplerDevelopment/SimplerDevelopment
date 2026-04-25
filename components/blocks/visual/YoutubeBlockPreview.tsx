'use client';

import { YoutubeBlock } from '@/types/blocks';

interface YoutubeBlockPreviewProps {
  block: YoutubeBlock;
  isSelected: boolean;
  onChange: (updates: Partial<YoutubeBlock>) => void;
}

export function YoutubeBlockPreview({ block, isSelected, onChange }: YoutubeBlockPreviewProps) {
  const getYoutubeEmbedUrl = (url: string) => {
    if (url.includes('youtube.com/watch?v=')) {
      const videoId = url.split('v=')[1]?.split('&')[0];
      return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1]?.split('?')[0];
      return `https://www.youtube.com/embed/${videoId}`;
    }
    // If it's already an embed URL or video ID
    if (url.includes('youtube.com/embed/')) {
      return url;
    }
    // Assume it's a video ID
    return `https://www.youtube.com/embed/${url}`;
  };

  return (
    <div className="p-6">
      {!block.url ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <span className="material-icons text-7xl text-muted-foreground/20 mb-4">smart_display</span>
          <p className="text-muted-foreground mb-4">No YouTube URL provided</p>
          <p className="text-xs text-muted-foreground">Configure video settings in the right sidebar</p>
        </div>
      ) : (
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
  );
}
