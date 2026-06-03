// Page-level Google Fonts collection.
//
// Historically every block that carried a `style.fontFamily` emitted its OWN
// `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...">`
// (see the old code in BlockStyleWrapper). On a real page that meant 40-50
// render-blocking font requests — and because authored values are full CSS
// stacks ("Raleway, -apple-system, BlinkMacSystemFont, sans-serif") the
// `family=` param was malformed and resolved to nothing, so the font never
// loaded AND the page sat blocked on dozens of dead requests.
//
// These helpers (a) extract the bare Google-Font family name from a possibly-
// stacked value, and (b) collect every unique family used across a page's
// block tree so the renderer can emit a SINGLE combined request.

// Generic CSS keywords and common system fonts that are NOT Google Fonts and
// must never be sent to the css2 endpoint. Compared lowercase.
const NON_GOOGLE_FAMILIES = new Set([
  'sans-serif', 'serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-serif',
  'ui-monospace', 'cursive', 'fantasy', 'emoji', 'math', 'fangsong',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'inherit', 'initial',
  'unset', 'revert', 'revert-layer', 'none',
]);

/**
 * Reduce a fontFamily value to the bare Google-Font family name, or null if it
 * isn't a Google Font we should request. Handles:
 *  - full stacks  → takes the first family ("Raleway, -apple-system, ..." → "Raleway")
 *  - quotes       → strips them ('"Open Sans", ...' → "Open Sans")
 *  - tailwind     → "font-sans"  → null
 *  - brand tokens → "brand.headingFont" → null
 *  - generics     → "sans-serif" → null
 */
export function bareFontFamily(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('font-')) return null; // tailwind utility class
  if (trimmed.startsWith('brand.')) return null; // brand sentinel
  if (trimmed.startsWith('var(')) return null; // CSS variable
  const first = trimmed.split(',')[0].trim().replace(/^["']|["']$/g, '').trim();
  if (!first) return null;
  if (NON_GOOGLE_FAMILIES.has(first.toLowerCase())) return null;
  return first;
}

/**
 * Produce a valid CSS `font-family` value for inline application. If the
 * authored value is already a stack (contains a comma) it is used verbatim —
 * the old code wrapped the WHOLE stack in quotes, producing an invalid single
 * family name that silently fell back to the generic. A bare name gets quoted
 * and given a sensible fallback.
 */
export function cssFontStack(
  raw: string | null | undefined,
  fallback = 'sans-serif',
): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes(',')) return trimmed; // already a stack — use as-is
  return `"${trimmed}", ${fallback}`;
}

/**
 * Walk a parsed block tree (any shape) and collect every unique bare Google
 * Font family referenced by `style.fontFamily` or `elementStyles[*].fontFamily`.
 * Generic recursion makes this resilient to all nesting shapes (columns, tabs,
 * accordion items, sections, etc.) without depending on their exact schemas.
 */
function walkForFonts(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkForFonts(child, out);
    return;
  }
  const obj = node as Record<string, unknown>;

  const style = obj.style as Record<string, unknown> | undefined;
  if (style && typeof style === 'object') {
    const f = bareFontFamily(style.fontFamily as string | undefined);
    if (f) out.add(f);
  }

  const elementStyles = obj.elementStyles as Record<string, unknown> | undefined;
  if (elementStyles && typeof elementStyles === 'object') {
    for (const v of Object.values(elementStyles)) {
      if (v && typeof v === 'object') {
        const f = bareFontFamily((v as Record<string, unknown>).fontFamily as string | undefined);
        if (f) out.add(f);
      }
    }
  }

  for (const v of Object.values(obj)) walkForFonts(v, out);
}

/** Collect unique Google-Font families used by a page's serialized block content. */
export function collectBlockFonts(content: string): string[] {
  const out = new Set<string>();
  try {
    walkForFonts(JSON.parse(content), out);
  } catch {
    // Non-JSON content (raw HTML fallback) carries no block font metadata.
  }
  return Array.from(out);
}

/**
 * Find the first image URL in a page's serialized block content — used to
 * <link rel=preload> the likely LCP image. Heroes are frequently authored as a
 * CSS background-image (often inside an html-render block), which the browser's
 * preload scanner cannot see, so the image doesn't even START loading until
 * other resources clear — wrecking LCP. The site chrome's images (logo, trust
 * seals, OG/favicon) live in the LAYOUT, not in `content`, so the first image
 * URL in `content` is reliably the first on-page (hero) image.
 */
export function firstContentImageUrl(content: string): string | null {
  // Match absolute http(s) image URLs OR root-relative ones, common raster/next-gen formats.
  const m = content.match(/(https?:\/\/[^"'()\s\\]+?\.(?:png|jpe?g|webp|avif|gif)|\/[^"'()\s\\]+?\.(?:png|jpe?g|webp|avif))/i);
  return m ? m[1] : null;
}

/**
 * Build a single combined Google Fonts css2 URL for the given families, or null
 * if there are none. Dedupes and applies `display=swap` so text paints
 * immediately with a fallback and swaps when the webfont arrives.
 */
export function googleFontsHref(families: Array<string | null | undefined>): string | null {
  const unique = Array.from(
    new Set(families.map((f) => bareFontFamily(f)).filter((f): f is string => !!f)),
  );
  if (unique.length === 0) return null;
  const params = unique.map((f) => `family=${encodeURIComponent(f)}`).join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
