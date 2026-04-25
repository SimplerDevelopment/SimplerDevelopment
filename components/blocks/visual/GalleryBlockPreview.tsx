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
  const layout = block.layout || 'grid';
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

  // Match production renderer layout branching
  if (layout === 'masonry') {
    return (
      <div
        className={`${gapClasses[gap]} py-8`}
        style={{ columnCount: columns }}
      >
        {block.images.map((image) => (
          <div key={image.id} className="break-inside-avoid mb-4">
            <img
              src={image.url}
              alt={image.alt}
              className="w-full h-auto rounded-lg"
            />
            {image.caption && (
              <p className="text-sm text-muted-foreground mt-1" style={getElementCSS(block.elementStyles, 'caption')}>{image.caption}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Grid layout — responsive cols matching renderer
  const gridCols: Record<2 | 3 | 4, string> = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[columns]} ${gapClasses[gap]} py-8`}>
      {block.images.map((image) => (
        <div key={image.id}>
          <img
            src={image.url}
            alt={image.alt}
            className="w-full h-auto aspect-square object-cover rounded-lg"
          />
          {image.caption && (
            <p className="text-sm text-muted-foreground mt-1" style={getElementCSS(block.elementStyles, 'caption')}>{image.caption}</p>
          )}
        </div>
      ))}
    </div>
  );
}
