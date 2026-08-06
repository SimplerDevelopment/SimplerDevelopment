import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "If Agile Were Invented After AI" — a scroll-driven WebGL essay.
 *
 * Served as a whole document rather than embedded in a page, deliberately.
 * The piece is a fixed-canvas scrollytelling experience: it needs to own the
 * viewport and the scroll. Wrapping it in an iframe (the html-embed block path)
 * gives a 100vh frame that consumes scroll inside a page that also scrolls,
 * which traps the reader. Rendering it inside the marketing layout would also
 * put site chrome against an art direction that assumes a full black field.
 *
 * The asset lives in `public/agile-after-ai/index.html`, so it is additionally
 * reachable at that literal path if this handler is ever bypassed. This route
 * exists to give it the clean `/agile-after-ai` URL.
 */

export const dynamic = 'force-static';

// Read once at build time, not per request.
//
// The GA id is substituted here rather than baked into the committed asset: the
// document is static and public, and the id belongs to the environment. When
// NEXT_PUBLIC_GA_ID is unset the placeholder simply stays put, the page's own
// guard rejects it, and no analytics load — matching app/layout.tsx, which only
// renders gtag when the var is present.
const html = readFileSync(
  join(process.cwd(), 'public', 'agile-after-ai', 'index.html'),
  'utf8',
).replace('__SD_GA_ID__', process.env.NEXT_PUBLIC_GA_ID ?? '');

export function GET() {
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
