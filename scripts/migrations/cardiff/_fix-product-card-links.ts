/**
 * Fix 404 links in the home "BORROW THE WAY YOU NEED TO" product cards
 * (post 793, block `products-grid`). The cards linked to nested paths like
 * `/business-loans/products/equipment-leasing/`, which 308-redirect to a 404.
 * The actual product pages live at top-level slugs (`/equipment-leasing`,
 * `/line-of-credit`, `/merchant-cash-advance`, `/sba-loans`, `/business-cards`,
 * `/working-capital` — all 200). Rewrite the nested paths to the top-level slug.
 *
 * Idempotent.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;

async function main() {
  const [row] = await db.select({ content: posts.content }).from(posts).where(eq(posts.id, POST_ID));
  if (!row) throw new Error(`post ${POST_ID} not found`);
  const before = (row.content.match(/\/business-loans\/products\/[a-z0-9-]+\/?/g) || []).length;
  // /business-loans/products/<slug>/?  ->  /<slug>
  const fixed = row.content.replace(/\/business-loans\/products\/([a-z0-9-]+)\/?/g, '/$1');
  if (fixed === row.content) {
    console.log('No nested product links found — no-op.');
    return;
  }
  await db.update(posts).set({ content: fixed }).where(eq(posts.id, POST_ID));
  const after = (fixed.match(/\/business-loans\/products\/[a-z0-9-]+\/?/g) || []).length;
  console.log(`Rewrote ${before} nested product link(s) to top-level slugs. remaining: ${after}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
