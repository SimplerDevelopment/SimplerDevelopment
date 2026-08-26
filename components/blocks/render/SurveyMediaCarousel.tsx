'use client';

/**
 * PUX-028: `media-carousel` field renderer — steps through an ordered list of
 * images/videos one at a time inside a styled frame. Display-only (see
 * DISPLAY_ONLY_TYPES in SurveyFormInline.types.ts): no answer is collected,
 * so this component never touches `answers`/`setAnswer`.
 *
 * Use cases from the card (PUX-028): QA-ticket evidence review across
 * multiple screenshots, before/after series, walkthrough/portfolio approval.
 *
 * Design decisions (stated explicitly per the task brief):
 *  - NO autoplay, ever. This is evidence a reviewer steps through at their
 *    own pace — forced auto-advance is the exact pattern WCAG 2.2.2
 *    ("Pause, Stop, Hide") exists to prevent, and there is no legitimate
 *    "auto-play QA screenshots" use case here. Because there is no autoplay,
 *    there is nothing that needs "pausing on scroll" either.
 *  - Only the ACTIVE slide's <video> is mounted (keyed by item.id). Moving to
 *    another slide unmounts the previous <video>, which stops playback for
 *    free — no manual pause wiring, no IntersectionObserver.
 *  - Video uses native `controls`, never autoplay/muted-loop — the visitor
 *    presses play deliberately, same as the existing single `video` field.
 *  - Slide transitions are opacity-only and gated behind Tailwind's
 *    `motion-safe:` variant, so `prefers-reduced-motion: reduce` gets an
 *    instant cut instead of a cross-fade.
 */

import { useCallback, useState, type KeyboardEvent } from 'react';
import type { SurveyMediaCarouselItem } from './SurveyFormInline.types';
import { dimTextClass } from './SurveyFormInline.helpers';

/** Pure index wraparound — exported so slide-navigation math is unit-testable
 *  without mounting the component. Handles negative `i` (Previous from slide 0). */
export function wrapIndex(i: number, count: number): number {
  if (count <= 0) return 0;
  return ((i % count) + count) % count;
}

interface SurveyMediaCarouselProps {
  items: SurveyMediaCarouselItem[];
  /** Field label — rendered as a small heading above the frame, mirroring how
   *  the single `image`/`video` fields use `field.label` as their caption. */
  label?: string;
  /** Survey card background, forwarded to `dimTextClass` for contrast (see
   *  that helper's doc comment — a pinned card bg beats `dark:` text utilities). */
  cardBg?: string;
}

export function SurveyMediaCarousel({ items, label, cardBg }: SurveyMediaCarouselProps) {
  const [index, setIndex] = useState(0);
  const count = items.length;

  const goTo = useCallback((i: number) => setIndex(wrapIndex(i, count)), [count]);

  if (count === 0) return null;

  const active = items[wrapIndex(index, count)];
  const dimCls = dimTextClass(cardBg);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
  };

  return (
    <figure className="my-1">
      {label && <figcaption className={`text-xs font-medium ${dimCls} mb-1`}>{label}</figcaption>}

      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={label || 'Media carousel'}
        tabIndex={count > 1 ? 0 : -1}
        onKeyDown={count > 1 ? handleKeyDown : undefined}
        className="relative rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-black/5 dark:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {active.kind === 'video' ? (
          <video
            key={active.id}
            src={active.mediaUrl}
            controls
            playsInline
            className="w-full max-h-[70vh] motion-safe:transition-opacity motion-safe:duration-300"
          >
            <track kind="captions" />
          </video>
        ) : (
          <img
            key={active.id}
            src={active.mediaUrl}
            alt={active.caption || (label ? `${label} — slide ${index + 1} of ${count}` : `Slide ${index + 1} of ${count}`)}
            className="w-full max-h-[70vh] object-contain motion-safe:transition-opacity motion-safe:duration-300"
            loading="lazy"
          />
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              aria-label="Previous slide"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <span className="material-icons text-lg" aria-hidden="true">chevron_left</span>
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-label="Next slide"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <span className="material-icons text-lg" aria-hidden="true">chevron_right</span>
            </button>

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40">
              {items.map((it, i) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index}
                  className={`rounded-full transition-all ${i === index ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/60'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 mt-1">
        {active.caption ? (
          <figcaption className={`text-xs ${dimCls}`}>{active.caption}</figcaption>
        ) : <span />}
        {count > 1 && (
          <span className={`text-xs ${dimCls} shrink-0`} aria-live="polite">
            {index + 1} / {count}
          </span>
        )}
      </div>
    </figure>
  );
}
