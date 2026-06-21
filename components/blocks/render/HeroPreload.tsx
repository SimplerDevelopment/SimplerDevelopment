import { preload, preconnect } from 'react-dom';
import { firstContentImageUrls } from '@/lib/blocks/page-fonts';

/**
 * Server component (NO 'use client') that preloads the likely-LCP image into
 * the document <head> as early as possible, plus a preconnect to its origin.
 *
 * Heroes are frequently authored as a CSS background-image (often on an
 * ::after pseudo-element inside an html-render block), which the preload
 * scanner cannot see — so the image otherwise doesn't start loading until the
 * main document JS clears, pushing LCP load-delay to ~6s.
 *
 * Rendering a <link rel=preload> from a CLIENT component in the body is too
 * late (discovered after the head's module preloads). ReactDOM.preload() from
 * a SERVER component is hoisted into <head> and flushed at the very top of the
 * streamed HTML, so the fetch starts immediately. Returns null — it only emits
 * head resource hints.
 */
export function HeroPreload({ content }: { content: string }) {
  // Preload the first couple of on-page images. The LCP element differs by
  // viewport — a small hero photo on desktop, the first full-width grid image
  // on mobile — so covering both candidates keeps the mobile LCP image from
  // sitting undiscovered (lazy, in an html-render block) until the page JS
  // clears. The non-LCP grid cells stay `loading="lazy"`, so these few high-
  // priority preloads don't contend with a dozen eager image requests.
  const urls = firstContentImageUrls(content, 2);
  const seenOrigins = new Set<string>();
  for (const url of urls) {
    try {
      if (/^https?:\/\//i.test(url)) {
        const origin = new URL(url).origin;
        if (!seenOrigins.has(origin)) {
          seenOrigins.add(origin);
          // Preconnect to the image origin (no crossOrigin: CSS background-image
          // fetches are not CORS, so a crossorigin hint would open a separate,
          // unused connection).
          preconnect(origin);
        }
      }
    } catch {
      /* ignore malformed URL */
    }
    preload(url, { as: 'image', fetchPriority: 'high' });
  }
  return null;
}
