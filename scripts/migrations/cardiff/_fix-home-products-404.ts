/**
 * Homepage (post 793, slug "home", site 405 cardiff-main) 404 sweep.
 *
 * The homepage "products" grid links to a legacy cardiff.co taxonomy under
 * `/products/<x>` — none of those slugs exist on this site, so all six render
 * the soft-404 "Not Found" page. Repoint each to the real product page.
 * Equipment Financing -> /equipment-leasing per the site nav (user-confirmed).
 *
 * Plain string replacement on posts.content. Idempotent — re-running is a no-op
 * once the legacy /products/ paths are gone.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const FIXES: Array<[string, string]> = [
  ['/products/merchant-cash-advance', '/merchant-cash-advance'],
  ['/products/business-credit-cards', '/business-cards'],
  ['/products/lines-of-credit', '/line-of-credit'],
  ['/products/equipment-financing', '/equipment-leasing'],
  ['/products/invoice-factoring', '/business-invoice-financing'],
  ['/products/term-loans', '/business-loans'],
];

async function main() {
  const [row] = await db.select({ content: posts.content }).from(posts).where(eq(posts.id, POST_ID));
  if (!row) throw new Error(`post ${POST_ID} not found`);
  let content = row.content;
  let total = 0;
  for (const [from, to] of FIXES) {
    const n = content.split(from).length - 1;
    if (n > 0) { content = content.split(from).join(to); total += n; console.log(`  ${from} -> ${to}  (${n}x)`); }
    else console.log(`  ${from}: not present (no-op)`);
  }
  // Safety: no legacy /products/ paths should remain.
  const leftover = [...new Set(content.match(/\/products\/[a-z-]+/g) || [])];
  if (content === row.content) { console.log(`post ${POST_ID}: no changes`); process.exit(0); }
  await db.update(posts).set({ content, updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`post ${POST_ID}: rewrote ${total} occurrence(s). Leftover /products/ paths: ${leftover.length ? leftover.join(', ') : 'none'}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
