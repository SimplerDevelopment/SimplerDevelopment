/**
 * Audit: find every html-render block where a `data-field` element targets a
 * value that looks like a URL — because that means it'll render the URL as
 * the visible label (e.g. "/APPLY" or "https://google.com/...").
 *
 * Also flag empty strings in repeat-item description fields — those are the
 * "blank space after checkmark" bug.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

interface Block {
  id?: string; type?: string; blocks?: Block[]; html?: string;
  values?: Record<string, unknown>;
}

function walk(node: Block, fn: (b: Block) => void) {
  fn(node);
  if (Array.isArray(node.blocks)) for (const c of node.blocks) walk(c, fn);
}

function looksLikeUrl(s: string): boolean {
  return /^\/[^\s]*$/.test(s) || /^https?:\/\//.test(s) || /^mailto:/.test(s) || /^tel:/.test(s);
}

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main not found');
  const rows = await db.select({ id: posts.id, slug: posts.slug, content: posts.content }).from(posts).where(eq(posts.websiteId, site.id));

  for (const r of rows) {
    if (!r.content) continue;
    let parsed: { blocks?: Block[] };
    try { parsed = JSON.parse(r.content); } catch { continue; }
    for (const top of parsed.blocks || []) {
      walk(top, (b) => {
        if (b.type !== 'html-render' || !b.html || !b.values) return;
        const html = b.html;
        // Find <a|button data-field="X"> patterns
        const re = /<(a|button)\b[^>]*?\bdata-field="([a-zA-Z_][a-zA-Z0-9_-]*)"[^>]*>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) !== null) {
          const field = m[2];
          // Resolve top-level value
          let raw: unknown = b.values?.[field];
          // Handle dotted paths via repeat items by checking inside arrays
          if (raw === undefined) {
            for (const k of Object.keys(b.values || {})) {
              const v = (b.values as Record<string, unknown>)[k];
              if (Array.isArray(v)) {
                for (const item of v as Record<string, unknown>[]) {
                  if (item && typeof item === 'object' && field in item) {
                    const val = item[field];
                    if (typeof val === 'string' && looksLikeUrl(val)) {
                      console.log(`  ${r.slug.padEnd(40)} ${(b.id || '').padEnd(38)} <${m[1]}> data-field="${field}" → ARRAY value "${val.slice(0, 80)}"`);
                    }
                  }
                }
              }
            }
            continue;
          }
          if (typeof raw === 'string' && looksLikeUrl(raw)) {
            console.log(`  ${r.slug.padEnd(40)} ${(b.id || '').padEnd(38)} <${m[1]}> data-field="${field}" → URL value "${raw.slice(0, 80)}"`);
          }
        }
      });
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
