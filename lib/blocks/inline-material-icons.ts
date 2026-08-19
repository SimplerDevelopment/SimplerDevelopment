import { ICON_PATHS, ICON_MAP, type IconShape } from '@/lib/icons/material-icon-paths';

/**
 * Rewrites `<span class="material-icons">glyph_name</span>` in html-render block
 * content into an inline <svg>, so public client sites never load the
 * material-icons webfont.
 *
 * Why this is a server-side string transform rather than a component change:
 * the icons live in DB-stored html-render block content, authored during site
 * migration, not in any React tree we control. Editing every client's content
 * is not an option, so the substitution happens once on the server as the block
 * JSON is assembled — the browser only ever sees SVG.
 *
 * The webfont cost this removes is not marginal. Measured on
 * integratouch.simplerdevelopment.com 2026-08-19: /fonts/material-icons.woff2
 * is 126KB at VeryHigh priority — it competed directly with the LCP image for
 * the first bytes — and the entire site uses 40 distinct glyphs. The inline
 * geometry for all 40 is a few KB, carried in the HTML that was being sent
 * anyway.
 *
 * Unmapped glyphs are left as-is. That is deliberate: a span we cannot resolve
 * keeps rendering through the webfont, so an unrecognised icon degrades to
 * "looks exactly as it did before" rather than to an empty box. Callers should
 * therefore keep shipping the @font-face — see hasUnmappedMaterialIcons(), which
 * lets a page decide whether the font is still needed at all.
 */

/** Matches a material-icons span and captures its extra classes, inline style and glyph name. */
const ICON_SPAN =
  /<span([^>]*?)class="([^"]*\bmaterial-icons\b[^"]*)"([^>]*?)>\s*([a-z0-9_]+)\s*<\/span>/gi;

function attrValue(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

function shapeToMarkup(shape: IconShape): string {
  if ('tag' in shape && shape.tag === 'circle') {
    const fill = shape.fill ? ` fill="${shape.fill}"` : '';
    return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"${fill}/>`;
  }
  const fill = shape.fill ? ` fill="${shape.fill}"` : '';
  const rule = shape.fillRule ? ` fill-rule="${shape.fillRule}"` : '';
  return `<path d="${shape.d}"${fill}${rule}/>`;
}

/** Resolves a Material Icons ligature name to its shape list, or null if unmapped. */
export function materialIconShapes(name: string): readonly IconShape[] | null {
  const key = ICON_MAP[name];
  return key ? (ICON_PATHS[key] ?? null) : null;
}

/**
 * True if the content still contains a material-icons span this module cannot
 * resolve — i.e. the webfont is still required for that page.
 */
export function hasUnmappedMaterialIcons(content: string): boolean {
  ICON_SPAN.lastIndex = 0;
  for (const m of content.matchAll(ICON_SPAN)) {
    if (!materialIconShapes(m[4])) return true;
  }
  return false;
}

export function inlineMaterialIcons(content: string): string {
  if (!content.includes('material-icons')) return content;

  return content.replace(ICON_SPAN, (whole, pre: string, cls: string, post: string, glyph: string) => {
    const shapes = materialIconShapes(glyph);
    if (!shapes) return whole;

    const attrs = `${pre} ${post}`;
    // Carry the author's own classes across, minus `material-icons` itself —
    // those classes are how the surrounding stylesheet sizes and colours the
    // icon (e.g. `text-lg`, a brand colour utility), so dropping them would
    // silently restyle every migrated site.
    const kept = cls
      .split(/\s+/)
      .filter((c) => c && c !== 'material-icons' && !c.startsWith('material-icons-'))
      .join(' ');
    const style = attrValue(attrs, 'style');

    // width/height of 1em + fill=currentColor make the SVG behave like the
    // glyph it replaces: it inherits font-size and color from its container,
    // so existing CSS keeps working untouched.
    return [
      '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"',
      ' aria-hidden="true" focusable="false"',
      kept ? ` class="${kept}"` : '',
      style ? ` style="${style}"` : '',
      '>',
      shapes.map(shapeToMarkup).join(''),
      '</svg>',
    ].join('');
  });
}
