/**
 * Hunt the "checkmark + blank space" bug shown in Image 7:
 * cards rendering with title ("Working Capital" / "Equipment Financing") and
 * a green check icon but no description text.
 *
 * Most likely a data-repeat array where each item has a description field but
 * the value is empty / undefined / wrong key.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

interface Block { id?: string; type?: string; blocks?: Block[]; html?: string; values?: Record<string, unknown>; }

function walk(node: Block, fn: (b: Block) => void) {
  fn(node);
  if (Array.isArray(node.blocks)) for (const c of node.blocks) walk(c, fn);
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
        // For each data-repeat array in values, find the data-repeat="name" element
        // and check whether items have any "Working Capital" / "Equipment Financing"
        // titles AND empty/missing description fields.
        for (const [arrayKey, arr] of Object.entries(b.values)) {
          if (!Array.isArray(arr)) continue;
          // Does the html reference data-repeat="<arrayKey>"?
          if (!html.includes(`data-repeat="${arrayKey}"`)) continue;
          // Find titles
          const titles = (arr as Record<string, unknown>[])
            .map(i => (typeof i?.title === 'string' ? i.title : ''));
          const hasWorkingCap = titles.some(t => /Working Capital|Equipment Financ/i.test(t));
          if (!hasWorkingCap) continue;
          // Check if descriptions/desc are blank
          const blanks = (arr as Record<string, unknown>[]).filter(i => {
            const d = (i?.description ?? i?.desc ?? i?.body ?? '');
            return typeof d === 'string' && d.trim() === '';
          });
          // Even if not blank, log so we can see structure
          console.log(`\n${r.slug} / ${b.id} / values["${arrayKey}"]:`);
          for (const item of arr as Record<string, unknown>[]) {
            console.log(`  - title="${String(item.title || '').slice(0, 40)}"  desc="${String(item.description ?? item.desc ?? item.body ?? '').slice(0, 60)}"  icon=${String(item.icon || '')}`);
          }
          if (blanks.length > 0) console.log(`  → ${blanks.length} blank descriptions`);
        }
      });
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
