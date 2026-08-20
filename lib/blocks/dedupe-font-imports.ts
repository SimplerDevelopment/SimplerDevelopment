/**
 * Drops redundant Google Fonts `@import` rules from html-render block content.
 *
 * Migrated sites carry their own font imports inside block `<style>` tags —
 * added to reach weights the platform helper doesn't request (see
 * googleFontsHref in lib/blocks/page-fonts.ts, which asks for bare family names).
 * They accumulate: the integratouch homepage shipped THREE `css2` requests for
 * two families, and gstatic answered with two separate Montserrat files
 * (37KB + 36KB) because the specs didn't match.
 *
 * That delivery mechanism is the worst available. An `@import` inside an inline
 * `<style>` is render-blocking AND serially discovered: parse the HTML, parse
 * the style block, fetch the stylesheet, then fetch the font — three hops on the
 * critical path, while the platform's own link is already deferred.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not remove font imports, and it does not touch the weights a page
 * asks for. Deleting an import that supplies a weight the design uses would
 * silently swap real bold for synthetic bold, which is a visual regression
 * nobody would catch in review. So the only rule here is subset elimination:
 * an import is dropped ONLY when another import on the same page requests every
 * family it does, at a superset of its weights and italic coverage. Removing a
 * strict subset cannot change what the browser can render.
 *
 * Anything this cannot prove redundant is left exactly as it is. When the
 * platform helper learns to request real weight axes (ITM-020), the content
 * imports become removable outright and this becomes unnecessary.
 */

/**
 * Roman and italic are tracked as SEPARATE weight sets, and that distinction is
 * load-bearing. `ital,wght@1,400..700` requests italic faces ONLY — it does not
 * imply the upright ones. Modelling italic as a boolean "also has italics" made
 * a roman-only import look redundant against an italic-only import, which would
 * have deleted every upright face from the page.
 */
interface FamilySpec {
  /** Upright weights this spec provides. */
  roman: Set<number>;
  /** Italic weights this spec provides. */
  italic: Set<number>;
}

/** One `@import` rule and the coverage it provides, keyed by lowercased family. */
interface ImportSpec {
  raw: string;
  families: Map<string, FamilySpec>;
}

const IMPORT_RE = /@import\s+url\(\s*(['"]?)(https:\/\/fonts\.googleapis\.com\/css2\?[^)'"]+)\1\s*\)\s*;?/gi;

/** Expands `300..900` to every 100-step in range; a bare `500` to itself. */
function expandWeightToken(token: string): number[] {
  const range = token.match(/^(\d+)\.\.(\d+)$/);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
    const out: number[] = [];
    // Variable axes are continuous, but comparing at 100-step granularity is
    // enough to decide subset-hood for every weight a stylesheet can name.
    for (let w = Math.ceil(lo / 100) * 100; w <= hi; w += 100) out.push(w);
    return out;
  }
  const n = Number(token);
  return Number.isFinite(n) ? [n] : [];
}

/**
 * Parses one `family=` value into its coverage.
 * Handles `Montserrat`, `Montserrat:wght@300;400`, and
 * `Montserrat:ital,wght@0,300..900;1,300..900`.
 */
function parseFamilyParam(value: string): [string, FamilySpec] | null {
  const [rawName, spec] = value.split(':');
  const name = decodeURIComponent(rawName.replace(/\+/g, ' ')).trim();
  if (!name) return null;

  const out: FamilySpec = { roman: new Set(), italic: new Set() };
  if (!spec) {
    out.roman.add(400); // bare `family=X` yields upright 400 only
    return [name.toLowerCase(), out];
  }

  const [axesPart, tuplesPart] = spec.split('@');
  const axes = (axesPart ?? '').split(',').map((a) => a.trim());
  const italIndex = axes.indexOf('ital');
  const wghtIndex = axes.indexOf('wght');

  for (const tuple of (tuplesPart ?? '').split(';')) {
    const parts = tuple.split(',');
    // Each tuple names one slant. With no `ital` axis every tuple is upright.
    const isItalic = italIndex >= 0 && parts[italIndex]?.trim() === '1';
    const target = isItalic ? out.italic : out.roman;
    const weightToken = wghtIndex >= 0 ? parts[wghtIndex] : parts[0];
    for (const w of expandWeightToken((weightToken ?? '').trim())) target.add(w);
  }

  if (out.roman.size === 0 && out.italic.size === 0) out.roman.add(400);
  return [name.toLowerCase(), out];
}

function parseImport(raw: string, url: string): ImportSpec | null {
  const query = url.slice(url.indexOf('?') + 1);
  // Content is HTML-escaped by the time it reaches us, so `&amp;` is common.
  const params = query.replace(/&amp;/g, '&').split('&');
  const families = new Map<string, FamilySpec>();

  for (const param of params) {
    if (!param.startsWith('family=')) continue;
    const parsed = parseFamilyParam(param.slice('family='.length));
    if (!parsed) continue;
    const [name, spec] = parsed;
    const existing = families.get(name);
    if (existing) {
      for (const w of spec.roman) existing.roman.add(w);
      for (const w of spec.italic) existing.italic.add(w);
    } else {
      families.set(name, spec);
    }
  }

  return families.size ? { raw, families } : null;
}

/** True when `outer` provides every face `inner` does — same families, ⊇ roman, ⊇ italic. */
function covers(outer: ImportSpec, inner: ImportSpec): boolean {
  for (const [name, innerSpec] of inner.families) {
    const outerSpec = outer.families.get(name);
    if (!outerSpec) return false;
    for (const w of innerSpec.roman) if (!outerSpec.roman.has(w)) return false;
    for (const w of innerSpec.italic) if (!outerSpec.italic.has(w)) return false;
  }
  return true;
}

/**
 * Removes Google Fonts `@import` rules whose coverage is fully provided by
 * another import in the same content. Returns the content unchanged when
 * nothing is provably redundant.
 */
export function dedupeFontImports(content: string): string {
  if (!content.includes('fonts.googleapis.com')) return content;

  IMPORT_RE.lastIndex = 0;
  const specs: ImportSpec[] = [];
  for (const m of content.matchAll(IMPORT_RE)) {
    const spec = parseImport(m[0], m[2]);
    if (spec) specs.push(spec);
  }
  if (specs.length < 2) return content;

  // Identical rules: keep the first, drop later copies (the homepage had the
  // same rule three times). Then drop any strict subset of another import.
  const dropped = new Set<number>();
  const seenRaw = new Set<string>();
  specs.forEach((spec, i) => {
    if (seenRaw.has(spec.raw)) dropped.add(i);
    else seenRaw.add(spec.raw);
  });

  specs.forEach((inner, i) => {
    if (dropped.has(i)) return;
    const redundant = specs.some((outer, j) => {
      if (i === j || dropped.has(j)) return false;
      if (!covers(outer, inner)) return false;
      // Mutual coverage (equal specs written differently) — keep the earlier.
      if (covers(inner, outer)) return j < i;
      return true;
    });
    if (redundant) dropped.add(i);
  });

  if (dropped.size === 0) return content;

  let out = content;
  for (const i of dropped) {
    // Replace one occurrence at a time so duplicate identical rules each get
    // their own removal rather than all vanishing at once.
    out = out.replace(specs[i].raw, '');
  }
  return out;
}
