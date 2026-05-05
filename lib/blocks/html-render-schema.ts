/**
 * Schema clipboard + JSON export for html-render blocks.
 *
 * What travels:
 *   - the HTML template (so authors don't have to re-type the markup)
 *   - the fields[] schema (labels, types, validation, conditional logic, help)
 *   - the loop config (postType / limit / orderBy)
 *
 * What does NOT travel:
 *   - the values{} bag (that's content, not structure — recipients fill it in)
 *   - the block id / order / style overrides (block-specific, would clash)
 *
 * Clipboard storage: `localStorage` under SCHEMA_CLIPBOARD_KEY. Survives reloads
 * and cross-tab navigation. Single-slot — copying overwrites the previous schema.
 */

import type { HtmlRenderBlock, HtmlRenderField, HtmlRenderLoop } from '@/types/blocks';

const SCHEMA_CLIPBOARD_KEY = 'sd-html-render-schema-clipboard';

export interface HtmlRenderSchema {
  /** Bumped whenever the persisted shape changes. */
  version: 1;
  /** When this schema was captured (unix ms). Shown in the paste UI as
   *  "Schema copied 2 minutes ago" so authors know the clipboard isn't
   *  some random ancient thing. */
  copiedAt: number;
  /** Optional source descriptor — block label or post title — purely for
   *  the paste confirmation dialog. Not used at apply time. */
  sourceLabel?: string;
  html: string;
  fields: HtmlRenderField[];
  loop?: HtmlRenderLoop;
}

export function buildSchemaSnapshot(block: HtmlRenderBlock, sourceLabel?: string): HtmlRenderSchema {
  return {
    version: 1,
    copiedAt: Date.now(),
    sourceLabel,
    html: block.html || '',
    fields: deepClone(block.fields || []),
    loop: block.loop ? deepClone(block.loop) : undefined,
  };
}

/**
 * Produce the partial update to apply a schema to a target block. Wipes the
 * target's existing fields/html/loop AND its values (since the field names
 * may not align with what the recipient previously stored). Defaults from the
 * incoming schema are preserved on each field — they'll surface as the
 * starting values when the author opens the block.
 */
export function applySchemaSnapshot(schema: HtmlRenderSchema): Partial<HtmlRenderBlock> {
  return {
    html: schema.html,
    fields: deepClone(schema.fields),
    values: {}, // recipient starts blank; defaults from schema kick in
    loop: schema.loop ? deepClone(schema.loop) : undefined,
  };
}

export function writeSchemaClipboard(schema: HtmlRenderSchema): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(SCHEMA_CLIPBOARD_KEY, JSON.stringify(schema));
    return true;
  } catch {
    return false;
  }
}

export function readSchemaClipboard(): HtmlRenderSchema | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SCHEMA_CLIPBOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HtmlRenderSchema;
    if (parsed?.version !== 1 || typeof parsed.html !== 'string' || !Array.isArray(parsed.fields)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSchemaClipboard(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(SCHEMA_CLIPBOARD_KEY); } catch { /* noop */ }
}

/** Triggers a JSON file download with the schema. Filename includes the
 *  source label and a timestamp so authors can sort exports. */
export function downloadSchemaJson(schema: HtmlRenderSchema): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = (schema.sourceLabel || 'html-render-schema').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const stamp = new Date(schema.copiedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `${slug}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Validates an imported JSON blob is a real schema. Returns the schema or
 *  an error string for the UI. */
export function parseImportedSchema(json: string): HtmlRenderSchema | { error: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch (e) {
    return { error: 'Invalid JSON: ' + (e instanceof Error ? e.message : 'parse failed') };
  }
  if (!parsed || typeof parsed !== 'object') return { error: 'Schema must be a JSON object' };
  const s = parsed as Record<string, unknown>;
  if (s.version !== 1) return { error: `Unsupported schema version: ${s.version}` };
  if (typeof s.html !== 'string') return { error: 'Missing `html` template' };
  if (!Array.isArray(s.fields)) return { error: 'Missing `fields` array' };
  return s as unknown as HtmlRenderSchema;
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
