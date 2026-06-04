/**
 * Accessibility fixes for the home page (post 793) — pushes Lighthouse a11y up:
 *
 * 1. heading-order: section "overline" eyebrows were level-6 heading blocks
 *    placed before their <h2> titles, creating h2→h6 level skips. They're
 *    decorative labels, not headings — set `as: 'p'` so they render as <p>
 *    (keeping the eyebrow styling that derives from level) and drop out of the
 *    heading outline.
 * 2. label: the loan-calculator range slider (#cls-range) had no accessible
 *    name — add aria-label.
 * 3. color-contrast: darken low-contrast calculator text (gray "/ month",
 *    the green estimate, the italic disclaimer) to meet 4.5:1 on white.
 *
 * Idempotent. Does NOT touch brand button colors (white-on-green CTAs are a
 * separate brand decision).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;

type Block = { id?: string; type?: string; level?: number; as?: string; html?: string; blocks?: Block[]; columns?: Block[]; items?: Block[]; tabs?: Block[] };

function walk(arr: Block[] | undefined, cb: (b: Block) => void) {
  if (!Array.isArray(arr)) return;
  for (const b of arr) {
    cb(b);
    walk(b.blocks, cb); walk(b.columns, cb); walk(b.items, cb); walk(b.tabs, cb);
    // columns block: each column may itself hold blocks
    if (Array.isArray(b.columns)) for (const c of b.columns as unknown as { blocks?: Block[] }[]) walk(c?.blocks, cb);
  }
}

async function main() {
  const [row] = await db.select({ content: posts.content }).from(posts).where(eq(posts.id, POST_ID));
  if (!row) throw new Error(`post ${POST_ID} not found`);
  const data = JSON.parse(row.content);

  let overlines = 0;
  let calcFixed = false;
  walk(data.blocks, (b) => {
    // 1. overline eyebrows → render as <p>
    if (b.type === 'heading' && b.level === 6 && b.as !== 'p') { b.as = 'p'; overlines++; }
    // 2 + 3. loan calculator block
    if (b.type === 'html-render' && b.html && /cls-range/.test(b.html)) {
      let h = b.html;
      if (!/id="cls-range"[^>]*aria-label/.test(h)) {
        h = h.replace('id="cls-range"', 'id="cls-range" aria-label="Loan amount"');
      }
      h = h.split('color:#3aa856').join('color:#15803d')   // green estimate
           .split('color:#7c8aa6').join('color:#566375')   // "/ month" gray
           .split('color:#a3afc4').join('color:#5b6675');  // italic disclaimer
      if (h !== b.html) { b.html = h; calcFixed = true; }
    }
  });

  await db.update(posts).set({ content: JSON.stringify(data) }).where(eq(posts.id, POST_ID));
  console.log(`Done. overlines→<p>: ${overlines}, calculator fixed: ${calcFixed}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
