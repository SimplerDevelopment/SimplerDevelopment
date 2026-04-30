import { JSDOM } from 'jsdom';

// Strip <html>/<head>/<body> wrappers, drop <nav>, and keep styling + scripts.
// Browsers wrap the resulting fragment in implicit html/head/body when the
// iframe loads it, so the embed renders without inheriting page chrome
// (title, meta tags, favicons, the original site nav).
export function cleanEmbedHtml(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  doc.querySelectorAll('nav, header').forEach((el) => el.remove());

  const headParts: string[] = [];
  if (doc.head) {
    doc.head
      .querySelectorAll(
        'style, script, link[rel="stylesheet"], link[rel="preconnect"], link[rel="preload"], link[rel="dns-prefetch"]'
      )
      .forEach((el) => headParts.push(el.outerHTML));
  }

  const bodyHtml = doc.body ? doc.body.innerHTML : '';

  return `<!DOCTYPE html>\n${headParts.join('\n')}\n${bodyHtml}`;
}
