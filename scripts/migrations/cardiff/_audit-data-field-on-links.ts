/**
 * Find every html-render block on cardiff-main where `data-field` is placed on
 * an <a>, <button>, or any element whose value is a URL — that pattern makes
 * the renderer's template engine REPLACE the element's inner HTML with the
 * field's value, which is why we see "/APPLY" or "https://google.com/..." as
 * button text instead of the actual label.
 *
 * Also flags <li>, <span>, <div> data-field elements whose field key looks like
 * a URL (href/url/link/ctaUrl/...) — same bug, different tag.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

interface Block { id?: string; type?: string; blocks?: Block[]; html?: string; }

function walkBlocks(node: Block, fn: (b: Block, path: string[]) => void, path: string[] = []) {
  fn(node, path);
  if (Array.isArray(node.blocks)) {
    for (let i = 0; i < node.blocks.length; i++) walkBlocks(node.blocks[i], fn, [...path, `${node.id ?? node.type ?? '?'}[${i}]`]);
  }
}

const URL_FIELDS = /(?:^|\W)(?:href|url|link|ctaUrl|cta_url|imageUrl|src|photoUrl|videoUrl)$/i;

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main not found');
  const rows = await db.select({ id: posts.id, slug: posts.slug, content: posts.content }).from(posts).where(eq(posts.websiteId, site.id));

  const hits: Array<{ postId: number; slug: string; blockId: string; tag: string; field: string }> = [];

  for (const r of rows) {
    if (!r.content) continue;
    let parsed: { blocks?: Block[] };
    try { parsed = JSON.parse(r.content); } catch { continue; }
    for (const top of parsed.blocks || []) {
      walkBlocks(top, (b) => {
        if (b.type !== 'html-render' || !b.html) return;
        // Match <tag ... data-field="name" ...>
        const re = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?\bdata-field="([a-zA-Z_][a-zA-Z0-9_-]*)"[^>]*>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(b.html!)) !== null) {
          const tag = m[1].toLowerCase();
          const field = m[2];
          // Always flag links + buttons
          if (tag === 'a' || tag === 'button') {
            hits.push({ postId: r.id, slug: r.slug || '', blockId: b.id || '(no id)', tag, field });
          } else if (URL_FIELDS.test(field)) {
            // Also flag any tag with a URL-ish field name
            hits.push({ postId: r.id, slug: r.slug || '', blockId: b.id || '(no id)', tag, field });
          }
        }
      });
    }
  }

  console.log(`Found ${hits.length} occurrences of data-field on link/button or URL-field on other tag:`);
  const bySlug = new Map<string, typeof hits>();
  for (const h of hits) {
    const key = `${h.slug} (post ${h.postId})`;
    if (!bySlug.has(key)) bySlug.set(key, []);
    bySlug.get(key)!.push(h);
  }
  for (const [k, list] of [...bySlug].sort()) {
    console.log(`\n  ${k}:`);
    for (const h of list) console.log(`    ${h.blockId.padEnd(40)} <${h.tag}> data-field="${h.field}"`);
  }
  console.log(`\nDistinct posts affected: ${bySlug.size}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
