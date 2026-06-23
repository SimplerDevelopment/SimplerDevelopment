'use client';

import { BookingBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { BookingFormInline } from './BookingFormInline';

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
      <BookingFormInline
        slug={block.slug}
        showPageTitle={block.showPageTitle !== false}
        showDescription={block.showDescription !== false}
        showSteps={block.showSteps !== false}
        showLogo={block.showLogo !== false}
        styleOverrides={block.styleOverrides}
      />
    </div>
  );
}
