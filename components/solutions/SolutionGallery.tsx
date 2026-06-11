'use client';

import { useCallback, useEffect, useState } from 'react';

interface SolutionGalleryProps {
  /** Web paths under /public, e.g. /screenshots/solutions/crm/01-contacts.png */
  images: string[];
  /** Accent color (hex) from the solution, used for active states + glow. */
  color: string;
  /** Solution title, used for alt text. */
  label: string;
}

/** "02-deals-board.png" -> "Deals board" */
function captionFor(path: string): string {
  const file = path.split('/').pop() ?? '';
  const stem = file.replace(/\.[a-z]+$/i, '').replace(/^\d+[-_]?/, '');
  const words = stem.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function SolutionGallery({ images, color, label }: SolutionGalleryProps) {
  const [idx, setIdx] = useState(0);
  const n = images.length;

  const go = useCallback(
    (delta: number) => setIdx((i) => (i + delta + n) % n),
    [n],
  );

  useEffect(() => {
    if (n <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, n]);

  if (n === 0) return null;
  const active = Math.min(idx, n - 1);

  return (
    <div className="w-full" aria-roledescription="carousel" aria-label={`${label} product screenshots`}>
      {/* Framed viewport with a faux browser chrome bar */}
      <div
        className="relative rounded-2xl overflow-hidden border bg-card shadow-2xl"
        style={{ borderColor: `${color}33` }}
      >
        {/* glow */}
        <div
          className="pointer-events-none absolute -inset-8 rounded-3xl blur-3xl opacity-10"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />

        {/* chrome bar */}
        <div className="relative z-10 flex items-center gap-2 px-4 h-9 border-b border-border/60 bg-muted/40">
          <span className="w-3 h-3 rounded-full bg-red-400/70" />
          <span className="w-3 h-3 rounded-full bg-amber-400/70" />
          <span className="w-3 h-3 rounded-full bg-green-400/70" />
          <span className="ml-3 text-xs font-mono text-muted-foreground truncate">
            {captionFor(images[active])}
          </span>
        </div>

        {/* image */}
        <div className="relative z-10 bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={images[active]}
            src={images[active]}
            alt={`${label} — ${captionFor(images[active])}`}
            className="block w-full h-auto"
            loading="lazy"
          />

          {n > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous screenshot"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background transition-colors shadow-md"
              >
                <span className="material-icons">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next screenshot"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background transition-colors shadow-md"
              >
                <span className="material-icons">chevron_right</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Thumbnail strip */}
      {n > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              type="button"
              key={src}
              onClick={() => setIdx(i)}
              aria-label={`Show ${captionFor(src)}`}
              aria-current={i === active}
              className="shrink-0 rounded-lg overflow-hidden border-2 transition-all"
              style={{
                borderColor: i === active ? color : 'transparent',
                opacity: i === active ? 1 : 0.6,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="block h-14 w-auto" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
