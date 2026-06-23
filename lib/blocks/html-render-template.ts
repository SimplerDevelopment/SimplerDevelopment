/**
 * Template substitution + field-detection helpers for `html-render` blocks.
 *
 * Three complementary mechanisms — same authoring flow, different placement:
 *
 *   1. `{{name}}` — substituted as a literal string anywhere in the template
 *      (attribute values, text nodes, css). Values are HTML-attribute-escaped
 *      so authors can safely drop user input into `href="{{url}}"` etc.
 *
 *   2. `<X data-field="name">…</X>` — the element keeps its outer tag and
 *      attributes; its inner HTML is REPLACED by the value (raw, so richtext
 *      with `<strong>` etc. round-trips). The `data-field` attribute survives
 *      so the iframe edit layer can find these regions to make editable.
 *
 *   3. `<X data-repeat="arrayName">…</X>` — the marked element is repeated
 *      once per item in `values[arrayName]` (an array of `{ subfield: value }`
 *      records). Inside the repeat:
 *        - `{{arrayName.subfield}}` substitutes from the current item
 *        - `data-field="subfield"` inner-HTML is the current item's subfield
 *      Detection of the array's item schema is by reading the inner template.
 *
 * Detection is the inverse: walk the template, collect top-level vars + array
 * fields (with their item schemas), and infer types from surrounding context
 * (anchor href -> 'url', img src -> 'image', etc.).
 */

import sanitizeHtmlLib from 'sanitize-html';
import type { HtmlRenderField } from '@/types/blocks';
import { escapeHtml } from '@/lib/utils/html';

// Narrow allow-list for `richtext` field values substituted via `{{name}}`.
// SKILL.md (html-render-block) documents: "If the field is `richtext`, the
// substitution is treated as HTML; otherwise it's escaped." Until ticket #20
// this branch was missing — every `{{name}}` value was HTML-escaped, so
// authors saw literal `&lt;em&gt;...&lt;/em&gt;` in their decks. We now keep
// the small set of inline formatting tags an editor would emit (matches the
// in-iframe paste sanitizer's allow-list in HtmlRenderBlockRender.tsx) and
// drop everything else. `data-field` swaps stay raw (separate code path).
const RICHTEXT_PLACEHOLDER_OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 'a', 'br', 'span', 'p', 'ul', 'ol', 'li', 'code', 'small', 'mark'],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
    span: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Anchors only — every other tag listed above is structural/formatting.
  allowedSchemesAppliedToAttributes: ['href'],
};

function sanitizeRichtextPlaceholder(html: string): string {
  return sanitizeHtmlLib(html ?? '', RICHTEXT_PLACEHOLDER_OPTIONS);
}

type ScalarValue = string;
type ArrayValue = Array<Record<string, string>>;
type GroupValue = Record<string, string>;
type FieldValues = Record<string, ScalarValue | ArrayValue | GroupValue>;

const PLACEHOLDER_RX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*\}\}/g;
const NESTED_PLACEHOLDER_RX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\.([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}\}/g;
const DATA_FIELD_RX = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\bdata-field="([a-zA-Z_][a-zA-Z0-9_-]*)"[^>]*>([\s\S]*?)<\/\1>/g;
// Top-level substituteDataFields skips elements already resolved per-item
// (data-field-resolved is added after each repeat/group iteration's swap)
// so a top-level field with the same name doesn't clobber the per-item value.
const DATA_FIELD_TOPLEVEL_RX = /<([a-zA-Z][a-zA-Z0-9-]*)\b(?![^>]*\bdata-field-resolved\b)[^>]*\bdata-field="([a-zA-Z_][a-zA-Z0-9_-]*)"[^>]*>([\s\S]*?)<\/\1>/g;

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'param', 'track']);

/* ─── Public API ────────────────────────────────────────────────────────── */

/**
 * One-shot template render: expand `data-repeat` regions, then `data-field`
 * swaps, then `{{name}}` placeholders.
 */
export function renderHtmlTemplate(
  template: string,
  fields: HtmlRenderField[] | undefined,
  values: FieldValues | undefined,
): string {
  const v: FieldValues = values || {};
  const allFields = fields || [];

  // Defaults (only meaningful for scalar fields; array fields default to [])
  const scalarDefaults: Record<string, string> = {};
  for (const f of allFields) {
    if (f.type !== 'array' && f.default !== undefined) scalarDefaults[f.name] = f.default;
  }
  const scalarValues = pickScalars(v, scalarDefaults);

  // 0. Annotate `<img src="{{name}}">` tags with `data-field-image="name"`
  //    so the iframe edit layer can wire click-to-swap. Done BEFORE group/
  //    repeat expansion because those passes substitute the `{{...}}` and the
  //    annotation regex would no longer find anything afterward.
  const annotated = annotateImageFields(template);
  // 1. Expand `data-repeat` regions (per-item substitution happens during expansion)
  const expanded = expandRepeats(annotated, allFields, v);
  // 2. Expand `data-group` regions — single nested object, runs the group's
  //    sub-values through `{{name.X}}` and per-item `data-field` swaps once.
  const grouped = expandGroups(expanded, allFields, v);
  // 3. data-field swaps at the top level (skips elements already resolved
  //    per-item by the repeat/group passes — they carry data-field-resolved).
  const withFields = grouped.replace(DATA_FIELD_TOPLEVEL_RX, (full, _tag, name, originalInner) => {
    const value = scalarValues[name] ?? originalInner;
    const openEnd = full.indexOf('>') + 1;
    const closeStart = full.lastIndexOf('</');
    return full.slice(0, openEnd) + value + full.slice(closeStart);
  });
  // 4. Top-level `{{name}}` (scalars) and `{{name.X}}` (object/group/post values).
  //    Pass `allFields` through so richtext-typed fields render as sanitized
  //    HTML instead of escaped text (ticket #20).
  const placeheld = substituteAllPlaceholders(withFields, v, scalarValues, allFields);
  // 5. Strip the resolution marker so it doesn't show up in output.
  return placeheld.replace(/\s+data-field-resolved=""/g, '');
}

/**
 * Pre-render annotation: every `<img ... src="{{name}}">` (or dotted path
 * like `{{cta.image}}`, `{{post.coverImage}}`, `{{stats.thumb}}`) gets a
 * `data-field-image="name"` attribute. The iframe edit layer uses this to
 * make images click-to-swap. Done before substitution so we still know
 * which placeholder fed each `<img>`.
 *
 * For dotted paths inside repeat/group regions, the iframe also looks at the
 * `data-repeat-item` ancestor to scope the path correctly — so an image
 * inside a `<div data-loop="posts">…<img src="{{post.coverImage}}">…</div>`
 * doesn't become editable (the post fields are dynamic, no value to write
 * back). We tag with the placeholder name as-is and the iframe decides.
 */
function annotateImageFields(html: string): string {
  return html.replace(/<img\b([^>]*?)\bsrc="\{\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}\}"/g, (full, beforeAttrs, name) => {
    if (/\bdata-field-image=/.test(full)) return full;
    return `<img${beforeAttrs} data-field-image="${name}" src="{{${name}}}"`;
  });
}

/**
 * Top-level placeholder pass that handles BOTH bare names (`{{title}}`) and
 * dotted paths (`{{cta.url}}`, `{{featured.title}}`) against object-shaped
 * values. Dotted paths on string values resolve to empty (lets authors leave a
 * `link`/`post` field unset without leaving literal `{{x.y}}` in the output).
 */
export function substituteAllPlaceholders(
  html: string,
  values: FieldValues,
  scalarDefaults: Record<string, string>,
  fields?: HtmlRenderField[],
): string {
  // Bare-placeholder fields whose schema declares `type: 'richtext'` render
  // as sanitized HTML instead of escaped text (ticket #20). Dotted paths stay
  // escaped — those reach into nested objects (groups, posts, custom fields)
  // and have never been documented to honor richtext semantics.
  const richtextNames = new Set(
    (fields || []).filter(f => f.type === 'richtext').map(f => f.name),
  );
  return html.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*(?:\.[a-zA-Z_][a-zA-Z0-9_-]*)*)\s*\}\}/g, (_full, raw) => {
    const path = raw.split('.');
    const head = path[0];
    const v = values[head];
    if (path.length === 1) {
      if (typeof v === 'string') {
        return richtextNames.has(head) ? sanitizeRichtextPlaceholder(v) : escapeHtml(v);
      }
      // bare placeholder against an object/array → fall back to default scalar
      const dflt = scalarDefaults[head];
      if (!dflt) return '';
      return richtextNames.has(head) ? sanitizeRichtextPlaceholder(dflt) : escapeHtml(dflt);
    }
    // Dotted — walk the path one segment at a time so multi-level paths
    // resolve. The classic shapes are still 2-deep (`{{cta.url}}`,
    // `{{post.title}}`), but typed CMS fields surface as
    // `{{post.fields.<slug>}}` (post-typed field nests `fields: Record<...>`)
    // which is 3-deep. Walk-and-resolve handles both.
    if (!v || typeof v !== 'object' || Array.isArray(v)) return '';
    let cur: unknown = v;
    for (let i = 1; i < path.length; i++) {
      if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return '';
      cur = (cur as Record<string, unknown>)[path[i]];
    }
    if (cur == null) return '';
    return typeof cur === 'string' ? escapeHtml(cur) : escapeHtml(String(cur));
  });
}

/**
 * Walk the template and return every editable variable referenced. Returns:
 *   - one field per `data-repeat="name"` element (type=array, with itemFields)
 *   - one field per top-level `{{name}}` and `data-field="name"` outside repeats
 * Sub-fields inside a repeat are captured under that array field's `itemFields`.
 */
export function detectFields(template: string): HtmlRenderField[] {
  const out: HtmlRenderField[] = [];
  const seen = new Set<string>();

  // 1. Find each top-level data-repeat region; emit one array field per region.
  const repeats = findRepeatRegions(template);
  for (const r of repeats) {
    if (seen.has(r.name)) continue;
    const inner = template.slice(r.innerStart, r.innerEnd);
    const itemFields = detectInnerFields(inner, r.name);
    out.push({
      name: r.name,
      label: titleize(r.name),
      type: 'array',
      itemFields,
    });
    seen.add(r.name);
  }

  // 2. Find each top-level data-group region; emit one group field per region.
  const groups = findRegions(template, 'data-group');
  for (const g of groups) {
    if (seen.has(g.name)) continue;
    const inner = template.slice(g.innerStart, g.innerEnd);
    const itemFields = detectInnerFields(inner, g.name);
    out.push({
      name: g.name,
      label: titleize(g.name),
      type: 'group',
      itemFields,
    });
    seen.add(g.name);
  }

  // Build a fast bitset for "is this offset inside a repeat or group region"
  const inRepeat = (idx: number) =>
    repeats.some(r => idx >= r.start && idx < r.end) ||
    groups.some(g => idx >= g.start && idx < g.end);

  // 2. Top-level data-field elements (outside any repeat).
  let m: RegExpExecArray | null;
  const dfRx = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\bdata-field="([a-zA-Z_][a-zA-Z0-9_-]*)"[^>]*>/g;
  while ((m = dfRx.exec(template)) !== null) {
    if (inRepeat(m.index)) continue;
    const name = m[2];
    if (seen.has(name)) continue;
    out.push({ name, label: titleize(name), type: 'richtext' });
    seen.add(name);
  }

  // 3. Top-level {{name}} placeholders (single-segment only — nested forms like
  //    {{post.title}} or {{stats.body}} are owned by their parent loop/array).
  const phRx = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*\}\}/g;
  while ((m = phRx.exec(template)) !== null) {
    if (inRepeat(m.index)) continue;
    const name = m[1];
    if (seen.has(name)) continue;
    out.push({ name, label: titleize(name), type: inferTypeFromContext(template, m.index) });
    seen.add(name);
  }

  return out;
}

/**
 * Count how many times a field name is referenced in the template — across
 * `{{name}}` placeholders, `data-field="name"` attributes, `data-repeat`/
 * `data-group` annotations, and dotted-path `{{name.sub}}` placeholders.
 * Used by the schema editor to show "used 3x" / "unused" next to each field.
 */
export function countFieldUsage(template: string, name: string): number {
  if (!name) return 0;
  // Escape any regex specials in the name (field names are alphanumeric +
  // underscore + dash today, but be safe).
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\{\\{\\s*${esc}\\s*\\}\\}`, 'g'),
    new RegExp(`\\{\\{\\s*${esc}\\.[a-zA-Z0-9_.-]+\\s*\\}\\}`, 'g'),
    new RegExp(`\\bdata-field="${esc}"`, 'g'),
    new RegExp(`\\bdata-repeat="${esc}"`, 'g'),
    new RegExp(`\\bdata-group="${esc}"`, 'g'),
  ];
  let total = 0;
  for (const rx of patterns) {
    total += (template.match(rx) || []).length;
  }
  return total;
}

/**
 * Rename every reference to a field in the template. Updates `{{old}}`,
 * `{{old.sub}}`, `data-field="old"`, `data-repeat="old"`, `data-group="old"`.
 * Returns the rewritten template + the count of replacements.
 */
export function renameFieldInTemplate(template: string, oldName: string, newName: string): { template: string; replacements: number } {
  if (!oldName || !newName || oldName === newName) return { template, replacements: 0 };
  const eo = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = template;
  let count = 0;
  // 1. {{old}} → {{new}}
  out = out.replace(new RegExp(`\\{\\{\\s*${eo}\\s*\\}\\}`, 'g'), () => { count++; return `{{${newName}}}`; });
  // 2. {{old.sub}} → {{new.sub}}
  out = out.replace(new RegExp(`\\{\\{\\s*${eo}\\.([a-zA-Z0-9_.-]+)\\s*\\}\\}`, 'g'), (_full, sub) => { count++; return `{{${newName}.${sub}}}`; });
  // 3. data-field/data-repeat/data-group="old" → "new"
  for (const attr of ['data-field', 'data-repeat', 'data-group']) {
    out = out.replace(new RegExp(`\\b${attr}="${eo}"`, 'g'), () => { count++; return `${attr}="${newName}"`; });
  }
  return { template: out, replacements: count };
}

/**
 * Find every template reference (`{{name}}`, `{{name.X}}`, `data-field="name"`,
 * `data-repeat="name"`, `data-group="name"`) whose top-level name has no entry
 * in the saved `fields[]` schema. Returns the unique list of orphan names.
 *
 * Powers the "undefined references" warning in the schema editor — until this
 * lint exists, a typo in `{{name}}` silently expands to empty at render time
 * with no editor signal that the field needs to be defined.
 */
export function findOrphanReferences(template: string, fields: HtmlRenderField[] | undefined): string[] {
  const known = new Set((fields || []).map(f => f.name));
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (name: string) => {
    if (!name || known.has(name) || seen.has(name)) return;
    seen.add(name);
    out.push(name);
  };
  // {{name}} and {{name.x.y...}}
  const phRx = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)(?:\.[a-zA-Z0-9_.-]+)?\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = phRx.exec(template)) !== null) add(m[1]);
  // data-field="name" / data-repeat="name" / data-group="name". Note this
  // intentionally over-reports: a `data-field` inside a `data-repeat` body
  // resolves to a sub-field, not a top-level. We dedupe against the
  // sub-field names below.
  const attrRx = /\b(?:data-field|data-repeat|data-group)="([a-zA-Z_][a-zA-Z0-9_-]*)"/g;
  while ((m = attrRx.exec(template)) !== null) add(m[1]);
  // Knock out anything that's actually a sub-field of a known array/group
  // field (those resolve through their parent's itemFields, not the top
  // level) so we don't false-positive on perfectly valid `data-field="title"`
  // inside a `data-repeat="cards"` with `cards.itemFields[].name === 'title'`.
  const subFieldNames = new Set<string>();
  for (const f of fields || []) {
    if ((f.type === 'array' || f.type === 'group') && f.itemFields) {
      for (const sf of f.itemFields) subFieldNames.add(sf.name);
    }
  }
  // Also knock out dynamic placeholders that are resolved server-side rather
  // than against the block's `fields[]`: `{{post.X}}` (loop) and
  // `{{post.values.X}}` / `{{post.fields.X}}` reach into the fetched post
  // record. The author doesn't need a `post` schema entry for these.
  const SERVER_NAMES = new Set(['post']);
  return out.filter(n => !subFieldNames.has(n) && !SERVER_NAMES.has(n));
}

/**
 * Reconcile a saved field list with what the template actually references:
 *   - new variables get added with detected type/label
 *   - existing variables keep their author-set label/type/options/default
 *   - variables no longer in the template are dropped
 *   - for array fields, itemFields are recursively reconciled
 */
export function reconcileFields(
  template: string,
  existing: HtmlRenderField[] | undefined,
): HtmlRenderField[] {
  const detected = detectFields(template);
  const byName = new Map((existing || []).map(f => [f.name, f]));
  return detected.map(d => {
    const prev = byName.get(d.name);
    if (!prev) return d;
    if (d.type === 'array') {
      // Preserve author overrides on the array field itself, then
      // recursively reconcile item fields against detected ones.
      const itemPrev = prev.itemFields || [];
      const itemDetected = d.itemFields || [];
      const itemByName = new Map(itemPrev.map(f => [f.name, f]));
      const itemReconciled = itemDetected.map(it => itemByName.get(it.name) || it);
      return { ...prev, type: 'array', itemFields: itemReconciled };
    }
    return prev;
  });
}

/* ─── Substitution primitives ───────────────────────────────────────────── */

export function substitutePlaceholders(html: string, values: Record<string, string>, defaults: Record<string, string> = {}): string {
  return html.replace(PLACEHOLDER_RX, (_full, name) => {
    const v = values[name] ?? defaults[name] ?? '';
    return escapeHtml(v);
  });
}

export function substituteDataFields(html: string, values: Record<string, string>, defaults: Record<string, string> = {}, markResolved = false): string {
  return html.replace(DATA_FIELD_RX, (full, _tag, name, originalInner) => {
    const v = values[name] ?? defaults[name] ?? originalInner;
    const openEnd = full.indexOf('>') + 1;
    const closeStart = full.lastIndexOf('</');
    let openTag = full.slice(0, openEnd);
    if (markResolved && !/\bdata-field-resolved\b/.test(openTag)) {
      // Insert the marker just after the tag name (right before the closing >)
      openTag = openTag.replace(/>$/, ' data-field-resolved="">');
    }
    return openTag + v + full.slice(closeStart);
  });
}

/* ─── data-repeat expansion ─────────────────────────────────────────────── */

interface RepeatRegion {
  name: string;
  start: number;
  end: number;
  openLen: number;
  innerStart: number;
  innerEnd: number;
  tag: string;
}

/** Top-level only — nested instances of the same attribute are not supported. */
export function findRepeatRegions(html: string): RepeatRegion[] {
  return findRegions(html, 'data-repeat');
}

/**
 * Generic sibling of findRepeatRegions — find each `<X attr="name">…</X>`
 * element span for any singular attribute. Used by both `data-repeat` and
 * `data-group` (and whatever annotation we add next).
 */
export function findRegions(html: string, attr: string): RepeatRegion[] {
  const tagRx = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  const attrRx = new RegExp(`\\b${attr.replace(/-/g, '-')}="([a-zA-Z_][a-zA-Z0-9_-]*)"`);
  const regions: RepeatRegion[] = [];
  let m: RegExpExecArray | null;
  let activeStart = -1;
  let activeTag = '';
  let activeOpenLen = 0;
  let activeName = '';
  let depth = 0;

  while ((m = tagRx.exec(html)) !== null) {
    const isClose = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3];
    const selfClose = m[4] === '/';
    if (selfClose || VOID_TAGS.has(tag)) continue;
    if (!isClose) {
      if (activeStart === -1) {
        const dr = attrs.match(attrRx);
        if (dr) {
          activeStart = m.index;
          activeTag = tag;
          activeOpenLen = m[0].length;
          activeName = dr[1];
          depth = 1;
        }
      } else if (tag === activeTag) {
        depth++;
      }
    } else if (activeStart !== -1) {
      if (tag === activeTag) {
        depth--;
        if (depth === 0) {
          const end = m.index + m[0].length;
          regions.push({
            name: activeName,
            start: activeStart,
            end,
            openLen: activeOpenLen,
            innerStart: activeStart + activeOpenLen,
            innerEnd: m.index,
            tag: activeTag,
          });
          activeStart = -1;
          activeTag = '';
          activeOpenLen = 0;
          activeName = '';
        }
      }
    }
  }
  return regions;
}

/**
 * Replace each `<X data-group="name">…</X>` region with the same element
 * (data-group attribute removed) once, with the group's sub-values applied
 * via `{{name.X}}` and `data-field` swaps. Group is just an array-of-1 in
 * authoring terms, but read as a single object so `values.name.X` is a flat
 * record instead of an array entry.
 */
export function expandGroups(template: string, fields: HtmlRenderField[], values: FieldValues): string {
  const regions = findRegions(template, 'data-group');
  if (regions.length === 0) return template;
  let out = template;
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    const groupVal = values[r.name];
    const obj: Record<string, string> = (groupVal && !Array.isArray(groupVal) && typeof groupVal === 'object')
      ? (groupVal as Record<string, string>) : {};
    const field = fields.find(f => f.name === r.name);
    const subDefaults = (field?.itemFields || []).reduce<Record<string, string>>((acc, sf) => {
      if (sf.default !== undefined) acc[sf.name] = sf.default;
      return acc;
    }, {});
    const fullElement = out.slice(r.start, r.end);
    const cleanElement = fullElement.replace(/\s+data-group="[^"]+"/, '');
    // Tag the wrapper with `data-group-item="<name>"` so the iframe inline-
    // edit layer can resolve `[data-field]` descendants to the right
    // `<group>.<sub>` path (without this, edits clobber a top-level field
    // with the same name as the group's sub-field).
    const tagged = cleanElement.replace(/^<([a-zA-Z][a-zA-Z0-9-]*)/, (_m, t) => `<${t} data-group-item="${r.name}"`);
    // Re-uses substituteRepeatItem since the per-item substitution semantics
    // are identical — a group is just an array entry that doesn't repeat.
    const rendered = substituteRepeatItem(tagged, r.name, obj, subDefaults);
    out = out.slice(0, r.start) + rendered + out.slice(r.end);
  }
  return out;
}

/**
 * Replace each `data-repeat` region with N copies of itself (one per item),
 * with `{{arrayName.X}}` placeholders and per-item `data-field` swaps applied.
 * The data-repeat attribute is stripped from each rendered copy. If the array
 * is empty the element is dropped entirely.
 */
export function expandRepeats(template: string, fields: HtmlRenderField[], values: FieldValues): string {
  const regions = findRepeatRegions(template);
  if (regions.length === 0) return template;
  let out = template;
  // Process back-to-front so earlier indices stay valid.
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    const arr = values[r.name];
    const items: Array<Record<string, string>> = Array.isArray(arr) ? arr : [];
    const fullElement = out.slice(r.start, r.end);
    const cleanElement = fullElement.replace(/\s+data-repeat="[^"]+"/, '');
    if (items.length === 0) {
      // Drop the element. Authors can render a fallback by placing static
      // markup outside the repeat.
      out = out.slice(0, r.start) + out.slice(r.end);
      continue;
    }
    const field = fields.find(f => f.name === r.name);
    const subDefaults = (field?.itemFields || []).reduce<Record<string, string>>((acc, sf) => {
      if (sf.default !== undefined) acc[sf.name] = sf.default;
      return acc;
    }, {});
    // Tag each rendered iteration with `data-repeat-item="name:index"` so the
    // iframe edit layer knows which item a `[data-field]` belongs to and can
    // post the path `name.index.subfield` back to the parent.
    const repeated = items.map((item, idx) => {
      const tagged = cleanElement.replace(/^<([a-zA-Z][a-zA-Z0-9-]*)/, (_m, t) => `<${t} data-repeat-item="${r.name}:${idx}"`);
      return substituteRepeatItem(tagged, r.name, item, subDefaults);
    }).join('');
    out = out.slice(0, r.start) + repeated + out.slice(r.end);
  }
  return out;
}

/**
 * Inside ONE repeat iteration, substitute placeholders + data-fields scoped
 * to the current item. Done before the global passes so item content can't
 * be clobbered by top-level fields with overlapping names. After the swap
 * we tag each substituted element with `data-field-resolved` so the global
 * `substituteDataFields` pass skips it (a top-level `body` field with the
 * same name as a per-item `body` would otherwise overwrite the item's value).
 */
function substituteRepeatItem(html: string, arrayName: string, item: Record<string, string>, defaults: Record<string, string>): string {
  // 1. {{arrayName.subfield}} — escape because they land in attributes/text
  const withAttrs = html.replace(NESTED_PLACEHOLDER_RX, (full, namespace, path) => {
    if (namespace !== arrayName) return full;
    const v = item[path] ?? defaults[path] ?? '';
    return escapeHtml(v);
  });
  // 2. data-field="subfield" — raw HTML for richtext sub-fields. Mark each
  //    substituted element with data-field-resolved="" so the top-level
  //    pass treats it as already done.
  return substituteDataFields(withAttrs, item, defaults, /* markResolved */ true);
}

/* ─── Inner detection (sub-fields of a repeat) ──────────────────────────── */

function detectInnerFields(inner: string, arrayName: string): HtmlRenderField[] {
  const out: HtmlRenderField[] = [];
  const seen = new Set<string>();
  // 1. data-field elements inside the repeat are richtext sub-fields
  let m: RegExpExecArray | null;
  const dfRx = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\bdata-field="([a-zA-Z_][a-zA-Z0-9_-]*)"[^>]*>/g;
  while ((m = dfRx.exec(inner)) !== null) {
    const name = m[2];
    if (seen.has(name)) continue;
    out.push({ name, label: titleize(name), type: 'richtext' });
    seen.add(name);
  }
  // 2. {{arrayName.X}} placeholders — scalar sub-fields with type inferred
  while ((m = NESTED_PLACEHOLDER_RX.exec(inner)) !== null) {
    if (m[1] !== arrayName) continue;
    const name = m[2];
    if (seen.has(name)) continue;
    out.push({ name, label: titleize(name), type: inferTypeFromContext(inner, m.index) });
    seen.add(name);
  }
  return out;
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function pickScalars(values: FieldValues, defaults: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...defaults };
  for (const [k, v] of Object.entries(values)) {
    // Only string scalars belong in the top-level placeholder/data-field map.
    // Arrays (repeats) and objects (groups) are consumed by their respective
    // expanders before we reach this layer.
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function inferTypeFromContext(template: string, idx: number): HtmlRenderField['type'] {
  const ctx = template.slice(Math.max(0, idx - 80), idx);
  if (/\b(href|action|cite|formaction|ping)=["']?$/i.test(ctx)) return 'url';
  if (/\b(src|srcset|poster|data-src)=["']?$/i.test(ctx)) return 'image';
  if (/\b(color|background-color|fill|stroke):\s*$/i.test(ctx)) return 'color';
  if (/\bstyle="[^"]*background-image:\s*url\(\s*$/i.test(ctx)) return 'image';
  return 'text';
}


function titleize(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}
