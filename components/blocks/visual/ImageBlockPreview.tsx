'use client';

import { ImageBlock } from '@/types/blocks';
import { useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';

interface ImageBlockPreviewProps {
  block: ImageBlock;
  isSelected: boolean;
  onChange: (updates: Partial<ImageBlock>) => void;
}

export function ImageBlockPreview({ block, isSelected, onChange }: ImageBlockPreviewProps) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  const widthClasses = {
    small: 'max-w-sm',
    medium: 'max-w-2xl',
    large: 'max-w-4xl',
    full: 'w-full',
  };

  const alignmentClasses = {
    left: 'mr-auto',
    center: 'mx-auto',
    right: 'ml-auto',
  };

  return (
    <div className="p-6">
      {!block.url ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <div className="text-6xl mb-4">🖼️</div>
          <p className="text-muted-foreground mb-4">No image selected</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMediaPicker(true);
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Choose Image
          </button>
        </div>
      ) : (
        <figure className={`${widthClasses[block.width || 'full']} ${alignmentClasses[block.alignment || 'center']} my-6`}>
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
      )}


      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.url}
              onChange={(url) => {
                onChange({ url });
                setShowMediaPicker(false);
              }}
              label="Select Image"
            />
          </div>
        </div>
      )}
    </div>
  );
}
