'use client';

import { GalleryBlock } from '@/types/blocks';
import { useState } from 'react';

interface GalleryBlockRenderProps {
  block: GalleryBlock;
}

export function GalleryBlockRender({ block }: GalleryBlockRenderProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const columns = block.columns || 3;
  const layout = block.layout || 'grid';
  const gap = block.gap || 'md';
  const lightbox = block.lightbox !== false;

  const gapClasses = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };

  if (layout === 'masonry') {
    return (
      <>
        <div
          className={`columns-${columns} ${gapClasses[gap]} py-8`}
          style={{ columnCount: columns }}
        >
          {block.images.map((image, index) => (
            <div key={image.id} className="break-inside-avoid mb-4">
              <button
                type="button"
                onClick={() => lightbox && setLightboxIndex(index)}
                className={`block w-full ${lightbox ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <img
                  src={image.url}
                  alt={image.alt}
                  className="w-full h-auto rounded-lg hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              </button>
              {image.caption && (
                <p className="text-sm text-muted-foreground mt-1">{image.caption}</p>
              )}
            </div>
          ))}
        </div>

        {lightbox && lightboxIndex !== null && (
          <Lightbox
            images={block.images}
            currentIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onNavigate={setLightboxIndex}
          />
        )}
      </>
    );
  }

  // Grid layout
  const gridCols = { 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' };

  return (
    <>
      <div className={`grid ${gridCols[columns]} ${gapClasses[gap]} py-8`}>
        {block.images.map((image, index) => (
          <div key={image.id}>
            <button
              type="button"
              onClick={() => lightbox && setLightboxIndex(index)}
              className={`block w-full ${lightbox ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <img
                src={image.url}
                alt={image.alt}
                className="w-full h-auto aspect-square object-cover rounded-lg hover:opacity-90 transition-opacity"
                loading="lazy"
              />
            </button>
            {image.caption && (
              <p className="text-sm text-muted-foreground mt-1">{image.caption}</p>
            )}
          </div>
        ))}
      </div>

      {lightbox && lightboxIndex !== null && (
        <Lightbox
          images={block.images}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  );
}

function Lightbox({
  images,
  currentIndex,
  onClose,
  onNavigate,
}: {
  images: GalleryBlock['images'];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const image = images[currentIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {currentIndex > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1); }}
          className="absolute left-4 text-white/80 hover:text-white z-10"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {currentIndex < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1); }}
          className="absolute right-4 text-white/80 hover:text-white z-10"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={image.url}
          alt={image.alt}
          className="max-w-full max-h-[85vh] object-contain rounded"
        />
        {image.caption && (
          <p className="text-white/80 text-center mt-3 text-sm">{image.caption}</p>
        )}
      </div>
    </div>
  );
}
