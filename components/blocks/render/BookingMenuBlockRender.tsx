'use client';

import { useEffect, useRef, useState } from 'react';
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
  thumbnail: string | null;
}

export function BookingMenuBlockRender({ block, siteId: siteIdProp }: { block: BookingMenuBlock; siteId?: number }) {
  const [pages, setPages] = useState<BookingPageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Resolve siteId from prop, parent data attribute, or URL path
    let resolvedSiteId = siteIdProp;
    if (!resolvedSiteId && ref.current) {
      const parent = ref.current.closest('[data-site-id]');
      const val = parent?.getAttribute('data-site-id');
      if (val) resolvedSiteId = parseInt(val, 10);
    }
    if (!resolvedSiteId) {
      // Try to extract domain from URL path (e.g. /sites/[domain]/...)
      const match = window.location.pathname.match(/^\/sites\/([^/]+)/);
      if (match) {
        fetch(`/api/public/booking/by-domain/${encodeURIComponent(match[1])}`)
          .then(r => r.ok ? r.json() : { data: [] })
          .then(d => setPages(d.data || []))
          .finally(() => setLoading(false));
        return;
      }
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    fetch(`/api/public/booking/by-site/${resolvedSiteId}`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setPages(d.data || []))
      .finally(() => setLoading(false));
  }, [siteIdProp]);

  const cols = block.columns || 3;

  if (loading) {
    return (
      <div ref={ref} className="py-12 text-center">
        <span className="material-icons animate-spin text-2xl" style={{ color: '#888' }}>refresh</span>
      </div>
    );
  }

  if (pages.length === 0) return <div ref={ref} />;

  // Use the first booking page's color as the accent (they all share the brand color)
  const accentColor = pages[0]?.color || '#2563eb';

  return (
    <div ref={ref} className="py-8 sm:py-12 px-4">
      {block.title && (
        <h2
          className="text-2xl sm:text-3xl font-bold text-center mb-3"
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
        className={`grid gap-4 sm:gap-5 max-w-5xl mx-auto grid-cols-1 ${
          cols >= 2 ? 'sm:grid-cols-2' : ''
        } ${
          cols >= 3 ? 'lg:grid-cols-3' : ''
        }`}
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
              ...getElementCSS(block.elementStyles, 'card'),
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
            {page.thumbnail ? (
              <div className="relative overflow-hidden h-36 sm:h-40">
                <img
                  src={page.thumbnail}
                  alt={page.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: accentColor }} />
              </div>
            ) : (
              <div className="h-1" style={{ backgroundColor: accentColor }} />
            )}
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-base font-semibold transition-colors" style={{ color: '#1b1b1b', ...getElementCSS(block.elementStyles, 'cardTitle') }}>
                  {page.title}
                </h3>
                <span
                  className="material-icons text-sm shrink-0 transition-colors"
                  style={{ color: '#ccc', ...getElementCSS(block.elementStyles, 'button') }}
                >
                  arrow_forward
                </span>
              </div>
              {page.description && (
                <p className="text-sm mb-4" style={{ color: '#5e5e5e', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', ...getElementCSS(block.elementStyles, 'cardDescription') }}>
                  {page.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs" style={{ color: '#888' }}>
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
