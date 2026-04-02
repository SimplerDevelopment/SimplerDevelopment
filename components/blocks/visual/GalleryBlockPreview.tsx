'use client';

import { GalleryBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface GalleryBlockPreviewProps {
  block: GalleryBlock;
  isSelected: boolean;
  onChange: (updates: Partial<GalleryBlock>) => void;
}

export function GalleryBlockPreview({ block, isSelected, onChange }: GalleryBlockPreviewProps) {
  const columns = block.columns || 3;
  const gap = block.gap || 'md';
  const gapClasses = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };

  if (block.images.length === 0) {
    return (
      <div className="py-8 px-4 border-2 border-dashed border-border rounded-lg text-center text-muted-foreground">
        <span className="material-icons text-3xl mb-2 block">photo_library</span>
        <p className="text-sm">Gallery block - add images in settings panel</p>
      </div>
    );
  }

  const gridCols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };

  return (
    <div className={`grid ${gridCols[columns]} ${gapClasses[gap]} py-4`}>
      {block.images.map((image) => (
        <div key={image.id} className="relative">
          <img
            src={image.url}
            alt={image.alt}
            className="w-full h-auto aspect-square object-cover rounded-lg"
          />
          {image.caption && (
            <p className="text-xs text-muted-foreground mt-1 truncate" style={getElementCSS(block.elementStyles, 'caption')}>{image.caption}</p>
          )}
        </div>
      ))}
    </div>
  );
}
