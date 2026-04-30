import { parse } from 'node-html-parser';

// Strip <html>/<head>/<body> wrappers, drop <nav>/<header>, and keep styling
// + scripts. Browsers wrap the resulting fragment in implicit html/head/body
// when the iframe loads it, so the embed renders without inheriting page
// chrome (title, meta tags, favicons, the original site nav).
//
// Implementation note: previously used jsdom, but its transitive dep
// `@exodus/bytes` (via html-encoding-sniffer) is ESM-only and breaks Next's
// turbopack CJS bundles on Vercel — every replace/upload route 500'd.
// node-html-parser is pure CJS with the DOM-shaped API we use (querySelectorAll,
// remove, outerHTML, innerHTML).
export function cleanEmbedHtml(html: string): string {
  const root = parse(html, {
    voidTag: { closingSlash: true },
    blockTextElements: { script: true, style: true, pre: true },
  });

  root.querySelectorAll('nav, header').forEach((el) => el.remove());

  // Full document: extract <head> assets + body content.
  const body = root.querySelector('body');
  if (body) {
    const head = root.querySelector('head');
    const headParts: string[] = [];
    if (head) {
      head
        .querySelectorAll(
          'style, script, link[rel="stylesheet"], link[rel="preconnect"], link[rel="preload"], link[rel="dns-prefetch"]'
        )
        .forEach((el) => headParts.push(el.outerHTML));
    }
    return `<!DOCTYPE html>\n${headParts.join('\n')}\n${body.innerHTML}`;
  }

  // Fragment input (already-cleaned re-upload). Pass through after the
  // nav/header strip; preserve whatever DOCTYPE the fragment had instead of
  // doubling it.
  const text = root.toString().trimStart();
  return /^<!DOCTYPE/i.test(text) ? text : `<!DOCTYPE html>\n${text}`;
}
