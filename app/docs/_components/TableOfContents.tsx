'use client';

import { useEffect, useState } from 'react';
import type { TocEntry } from '../_lib/nav';

/** Right-rail "On this page" with scroll-spy highlighting. */
export function TableOfContents({ toc }: { toc: TocEntry[] }) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (toc.length === 0) return;
    const headings = toc
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Trigger when a heading enters the top third of the viewport.
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [toc]);

  if (toc.length === 0) return null;

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        On this page
      </p>
      <ul className="space-y-1.5 border-l border-border">
        {toc.map((t) => (
          <li key={t.id} style={{ paddingLeft: t.depth === 3 ? '1.5rem' : '0.75rem' }}>
            <a
              href={`#${t.id}`}
              data-active={activeId === t.id}
              className="docs-toc-link -ml-px block border-l border-transparent py-0.5 text-muted-foreground transition-colors hover:text-foreground"
              style={{ marginLeft: '-1px', paddingLeft: '0.75rem' }}
            >
              {t.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
