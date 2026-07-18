'use client';

import { BookingMenuBlock } from '@/types/blocks';

interface BookingMenuBlockPreviewProps {
  block: BookingMenuBlock;
  isSelected: boolean;
  onChange: (updates: Partial<BookingMenuBlock>) => void;
}

/**
 * Booking menu pulls live data from the site's booking pages, so the preview
 * shows a placeholder grid with the configured columns count + lets the user
 * see the section header inline. Real data appears in production.
 */
export function BookingMenuBlockPreview({ block, isSelected, onChange }: BookingMenuBlockPreviewProps) {
  const columns = block.columns ?? 3;
  const columnsClass: Record<number, string> = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <section className="py-16 px-6">
      {(block.title || isSelected) && (
        <div className="text-center mb-12 max-w-3xl mx-auto">
          <input
            type="text"
            value={block.title || ''}
            onChange={(e) => onChange({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Section title (optional)"
            className="font-heading text-3xl md:text-4xl font-bold w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
          />
          {(block.description || isSelected) && (
            <input
              type="text"
              value={block.description || ''}
              onChange={(e) => onChange({ description: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="Description (optional)"
              className="text-lg mt-3 w-full bg-transparent border-none focus:outline-none focus:border-b border-border text-center text-muted-foreground"
            />
          )}
        </div>
      )}
      <div className={`grid grid-cols-1 ${columnsClass[columns]} gap-6`}>
        {Array.from({ length: columns * 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-dashed border-border p-6">
            <div className="h-6 w-2/3 bg-muted/30 rounded mb-3" />
            <div className="h-4 w-full bg-muted/20 rounded mb-2" />
            <div className="h-4 w-1/2 bg-muted/20 rounded mb-4" />
            <div className="h-9 w-32 bg-muted/30 rounded" />
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-6 italic">
        Preview: Showing placeholders. Live booking pages load in production.
      </p>
    </section>
  );
}
