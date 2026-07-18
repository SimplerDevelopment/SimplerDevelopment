import type { ReactNode } from 'react';

/**
 * Marketing-pages layout (route group `(pages)`).
 *
 * A few decorative/animated elements on the marketing pages — oversized section
 * numerals (`.section-number`, text-[10rem]) and slide-in transforms
 * (`.sd-slide--x`, translateX) — extend a few pixels past the viewport on
 * phones. The root already sets `overflow-x: clip`, but iOS Safari can still pan
 * horizontally when only the html element clips, so contain the overflow at the
 * marketing wrapper on small screens too.
 *
 * `clip` (not `hidden`) keeps `position: sticky` working; the wrapper is
 * content-height so it clips nothing vertically. md+ stays `visible`.
 */
export default function MarketingPagesLayout({ children }: { children: ReactNode }) {
  return <div className="overflow-x-clip md:overflow-x-visible">{children}</div>;
}
