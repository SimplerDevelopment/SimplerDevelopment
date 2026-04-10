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
        <span className="material-icons animate-spin text-2xl" style={{ color: '#888' }}>refresh</span>
      </div>
    );
  }

  if (pages.length === 0) return null;

  // Use the first booking page's color as the accent (they all share the brand color)
  const accentColor = pages[0]?.color || '#2563eb';

  return (
    <div className="py-12 px-4">
      {block.title && (
        <h2
          className="text-3xl font-bold text-center mb-3"
          style={{ color: 'var(--foreground, #1b1b1b)', ...getElementCSS(block.elementStyles, 'title') }}
          data-editable-field="title"
        >
          {block.title}
        </h2>
      )}
      {block.description && (
        <p
          className="text-center mb-8 max-w-2xl mx-auto"
          style={{ color: 'var(--muted-foreground, #5e5e5e)', ...getElementCSS(block.elementStyles, 'description') }}
          data-editable-field="description"
        >
          {block.description}
        </p>
      )}
      <div
        className="grid gap-5 max-w-5xl mx-auto"
        style={{ gridTemplateColumns: `repeat(${Math.min(cols, pages.length)}, minmax(0, 1fr))` }}
      >
        {pages.map((page) => (
          <a
            key={page.id}
            href={`/book/${page.slug}`}
            className="group block rounded-lg overflow-hidden transition-all duration-200"
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e5e5',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              (e.currentTarget as HTMLElement).style.borderColor = accentColor;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
              (e.currentTarget as HTMLElement).style.borderColor = '#e5e5e5';
            }}
          >
            <div className="h-1" style={{ backgroundColor: accentColor }} />
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-base font-semibold transition-colors" style={{ color: '#1b1b1b' }}>
                  {page.title}
                </h3>
                <span
                  className="material-icons text-sm shrink-0 transition-colors"
                  style={{ color: '#ccc' }}
                >
                  arrow_forward
                </span>
              </div>
              {page.description && (
                <p className="text-sm mb-4" style={{ color: '#5e5e5e', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {page.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-xs" style={{ color: '#888' }}>
                <span className="flex items-center gap-1">
                  <span className="material-icons text-sm">schedule</span>
                  {page.duration} min
                </span>
                {page.maxGuests ? (
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">group</span>
                    Group (up to {page.maxGuests})
                  </span>
                ) : (
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
