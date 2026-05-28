/**
 * Find html-render blocks that render a checkmark icon next to a description
 * placeholder but where the description value might be empty or wired wrong.
 * Specifically hunting for "Working Capital" / "Equipment Financing" with
 * empty text next to a check icon.
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
        if (b.type !== 'html-render' || !b.html) return;
        const html = b.html;
        // Looking for cards with "Working Capital" and "Equipment Financing" titles + checkmark
        const hasWC = /Working Capital/i.test(html) || /Working Capital/i.test(JSON.stringify(b.values || {}));
        const hasEF = /Equipment Financing/i.test(html) || /Equipment Financing/i.test(JSON.stringify(b.values || {}));
        if (!hasWC || !hasEF) return;
        // And rendering checkmark icons
        const hasCheck = /check_circle|check\b|task_alt|done|verified/i.test(html);
        if (!hasCheck) return;
        // Print
        console.log(`\n${r.slug.padEnd(40)} ${b.id || '(no id)'}`);
        console.log('  html (first 800):', html.slice(0, 800).replace(/\s+/g, ' '));
        if (b.values) console.log('  values keys:', Object.keys(b.values));
      });
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
