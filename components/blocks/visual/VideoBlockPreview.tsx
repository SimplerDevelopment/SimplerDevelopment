'use client';

import { VideoBlock } from '@/types/blocks';

interface VideoBlockPreviewProps {
  block: VideoBlock;
  isSelected: boolean;
  onChange: (updates: Partial<VideoBlock>) => void;
}

export function VideoBlockPreview({ block, isSelected, onChange }: VideoBlockPreviewProps) {
  return (
    <div className="p-6">
      {!block.url ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <span className="material-icons text-7xl text-muted-foreground/20 mb-4">movie</span>
          <p className="text-muted-foreground mb-4">No video URL provided</p>
          <p className="text-xs text-muted-foreground">Add a direct video file URL (.mp4, .webm, etc.)</p>
        </div>
      ) : (
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
  );
}
