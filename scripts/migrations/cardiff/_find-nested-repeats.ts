/**
 * Find every html-render block with a `data-repeat` nested inside another
 * `data-repeat`. The engine only supports top-level repeats, so nested ones
 * render once with empty placeholders.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

interface Block { id?: string; type?: string; blocks?: Block[]; html?: string; }

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
        const repeats = [...html.matchAll(/data-repeat="([^"]+)"/g)];
        if (repeats.length < 2) return;
        // Naïve nesting check: find first `data-repeat="X"` open + look for second `data-repeat=` before its closing tag
        // Use a simple paired check: any html chunk with >= 2 data-repeat attributes is suspicious.
        const names = repeats.map(m => m[1]);
        console.log(`  ${r.slug.padEnd(40)} ${b.id || '(no id)'.padEnd(38)} data-repeats: [${names.join(', ')}]`);
      });
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
