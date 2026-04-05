'use client';

import { BookingBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface BookingBlockRenderProps {
  block: BookingBlock;
}

export function BookingBlockRender({ block }: BookingBlockRenderProps) {
  if (!block.slug) {
    return (
      <div className="p-8 text-center text-muted-foreground border border-dashed rounded-lg">
        <span className="material-icons text-4xl mb-2 block">calendar_month</span>
        <p>No booking page selected</p>
      </div>
    );
  }

  const height = block.height || '700px';

  return (
    <div>
      {block.title && (
        <h2
          className="text-2xl font-bold mb-2"
          style={getElementCSS(block.elementStyles, 'title')}
          data-editable-field="title"
        >
          {block.title}
        </h2>
      )}
      {block.description && (
        <p
          className="text-muted-foreground mb-4"
          style={getElementCSS(block.elementStyles, 'description')}
          data-editable-field="description"
        >
          {block.description}
        </p>
      )}
      <iframe
        src={`/book/${block.slug}?embed=1${block.showPageTitle === false ? '&hideTitle=1' : ''}${block.showDescription === false ? '&hideDescription=1' : ''}${block.showSteps === false ? '&hideSteps=1' : ''}`}
        width="100%"
        height={height}
        style={{ border: 'none', borderRadius: '0.5rem' }}
        title={block.title || 'Schedule a Booking'}
        loading="lazy"
      />
    </div>
  );
}
