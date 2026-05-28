/**
 * Iter 22 — three bug fixes reported from the home page:
 *
 * 1. `stats-band` shows "39 Months" wrapping to two lines because the value
 *    fontSize is 3.5rem. Reduce to 2.5rem so all four numbers (5.99%,
 *    $82,000, 39 Months, 84%) sit on one line.
 *
 * 2. `stats-band` outer/inner gradient layering creates the visual of an
 *    "inner darker rectangle". The customCSS radial+linear gradient mix
 *    makes the corners look lighter than the center. Replace with a single
 *    flat deep-blue (#1c3370) so the band reads as one uniform plane.
 *
 * 3. `products-grid` html-render template has `data-field="link"` on the
 *    outer `<a>` element of each repeat. The template engine treats
 *    `data-field` as a content-swap directive — it replaces the entire
 *    inner HTML of that element with the field's value. So every card's
 *    icon + title + description + CTA gets blasted away and replaced with
 *    the raw URL string ("/business-loans/products/working-capital/"). Fix
 *    by removing `data-field="link"`; the `href="{{cards.link}}"` template
 *    placeholder is enough to wire the link without nuking inner content.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;

interface Block {
  id?: string;
  type?: string;
  blocks?: Block[];
  style?: Record<string, unknown>;
  elementStyles?: Record<string, Record<string, unknown>>;
  html?: string;
}

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) throw new Error(`Post ${POST_ID} not found`);
  const parsed = JSON.parse(row.content) as { blocks: Block[] };

  // --- Fix 1 + 2: stats-band ---
  const statsBand = parsed.blocks.find(b => b.id === 'stats-band');
  if (!statsBand) throw new Error('stats-band not found');
  // Flatten the gradient — single uniform deep blue.
  statsBand.style = {
    ...(statsBand.style || {}),
    backgroundColor: '#1c3370',
    customCSS: 'background-image: none;',
  };
  const statsGrid = statsBand.blocks?.find(b => b.id === 'stats-grid');
  if (!statsGrid) throw new Error('stats-grid not found');
  // Shrink the stat value so "39 Months" fits one line.
  statsGrid.elementStyles = {
    ...(statsGrid.elementStyles || {}),
    statValue: {
      ...(statsGrid.elementStyles?.statValue || {}),
      fontSize: '2.5rem',
      lineHeight: '1.1',
    },
  };

  // --- Fix 3: products-grid card link content swap ---
  const productsSection = parsed.blocks.find(b => b.id === 'products');
  if (!productsSection) throw new Error('products section not found');
  const productsGrid = productsSection.blocks?.find(b => b.id === 'products-grid');
  if (!productsGrid || !productsGrid.html) throw new Error('products-grid html not found');
  // Strip the destructive `data-field="link"` attribute from the outer <a>.
  // Keep the `href="{{cards.link}}"` template placeholder which interpolates
  // properly. Idempotent: regex tolerates re-runs (no-op if already gone).
  productsGrid.html = productsGrid.html.replace(/\s+data-field="link"/g, '');

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log('iter22: stats fontSize → 2.5rem (one-line "39 Months"); stats band → flat #1c3370; products cards → data-field="link" stripped');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
