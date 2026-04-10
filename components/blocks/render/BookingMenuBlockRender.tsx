'use client';

import { useEffect, useState } from 'react';
import { BookingMenuBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface BookingPageInfo {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  duration: number;
  price: number;
  priceLabel: string | null;
  color: string;
  maxGuests: number | null;
}

export function BookingMenuBlockRender({ block, siteId }: { block: BookingMenuBlock; siteId?: number }) {
  const [pages, setPages] = useState<BookingPageInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) { setLoading(false); return; }
    fetch(`/api/public/booking/by-site/${siteId}`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setPages(d.data || []))
      .finally(() => setLoading(false));
  }, [siteId]);

  const cols = block.columns || 3;

  if (loading) {
    return (
      <div className="py-12 text-center">
        <span className="material-icons animate-spin text-2xl text-muted-foreground">refresh</span>
      </div>
    );
  }

  if (pages.length === 0) {
    return null;
  }

  return (
    <div className="py-12">
      {block.title && (
        <h2
          className="text-3xl font-bold text-center mb-3"
          style={getElementCSS(block.elementStyles, 'title')}
          data-editable-field="title"
        >
          {block.title}
        </h2>
      )}
      {block.description && (
        <p
          className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto"
          style={getElementCSS(block.elementStyles, 'description')}
          data-editable-field="description"
        >
          {block.description}
        </p>
      )}
      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: `repeat(${Math.min(cols, pages.length)}, minmax(0, 1fr))` }}
      >
        {pages.map((page) => (
          <a
            key={page.id}
            href={`/book/${page.slug}`}
            className="group block bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all"
          >
            <div className="h-1.5" style={{ backgroundColor: page.color }} />
            <div className="p-6">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                  {page.title}
                </h3>
                <span className="material-icons text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0">
                  arrow_forward
                </span>
              </div>
              {page.description && (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{page.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="material-icons text-sm">schedule</span>
                  {page.duration} min
                </span>
                {page.maxGuests && (
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">group</span>
                    Group (up to {page.maxGuests})
                  </span>
                )}
                {!page.maxGuests && (
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">person</span>
                    Individual
                  </span>
                )}
                {page.price > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">payments</span>
                    ${(page.price / 100).toFixed(0)} {page.priceLabel || ''}
                  </span>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
