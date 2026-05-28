/**
 * Standardize hero CTA buttons across all cardiff-main pages.
 *
 * The canonical hero structure (set up by every recent styled-*-iter*.ts) is:
 *
 *   section "hero-*" → columns "h-btns" → button "hb-apply" + button "hb-talk"
 *
 * The bug: each column is `width: 'auto'` so it sizes to its button's natural
 * width. The primary CTA ("Apply Now", 9 chars) ends up much wider than its
 * label, while the secondary CTA ("Talk to a Specialist", 20 chars) gets
 * shrink-wrapped and wraps to two lines under it. They render at clearly
 * mismatched sizes.
 *
 * Fix: walk every page in cardiff-main, find any columns block whose id ends
 * in `-btns` (matches `h-btns`, `hero-btns`, and the few one-off variants)
 * sitting inside a section with id starting `hero-`. For every button child:
 *   - Add `white-space: nowrap` so neither label wraps
 *   - Add `min-width: 240px` so the two CTAs sit at the same visual weight
 *   - Add `text-align: center` so the now-wider labels stay centered
 *
 * The buttons keep their existing primary/outline variant, colors, and
 * existing customCSS; we merge into customCSS so prior overrides are
 * preserved. Idempotent — the keys we set are deterministic so re-running is
 * a no-op write.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

interface Block {
  id?: string;
  type?: string;
  blocks?: Block[];
  columns?: { blocks?: Block[] }[];
  style?: Record<string, unknown>;
}

/**
 * Merge a small set of declarations into a customCSS string, preserving every
 * other declaration the author already wrote. Idempotent: re-running with
 * the same key/value pairs produces the same output.
 */
function mergeCustomCSS(existing: string | undefined, additions: Record<string, string>): string {
  const map = new Map<string, string>();
  if (existing) {
    for (const decl of existing.split(';')) {
      const idx = decl.indexOf(':');
      if (idx < 0) continue;
      const k = decl.slice(0, idx).trim();
      const v = decl.slice(idx + 1).trim();
      if (k) map.set(k, v);
    }
  }
  for (const [k, v] of Object.entries(additions)) map.set(k, v);
  return [...map.entries()].map(([k, v]) => `${k}: ${v}`).join('; ');
}

function fixButton(btn: Block): boolean {
  if (btn.type !== 'button') return false;
  const style = (btn.style && typeof btn.style === 'object' ? btn.style : {}) as Record<string, unknown>;
  const existingCss = typeof style.customCSS === 'string' ? style.customCSS : '';
  const nextCss = mergeCustomCSS(existingCss, {
    'white-space': 'nowrap',
    'min-width': '240px',
    'text-align': 'center',
    'justify-content': 'center',
  });
  if (nextCss === existingCss) return false;
  btn.style = { ...style, customCSS: nextCss };
  return true;
}

/**
 * Walk a block tree finding hero CTA columns. A hero CTA columns block is any
 * `columns` whose id ends in `-btns` and that lives inside a section whose id
 * starts with `hero-` (covers `hero-contact-us`, `hero-merchant-cash-advance`,
 * `hero-line-of-credit-v2`, …).
 */
function findHeroButtons(node: Block, parentId: string | undefined, acc: Block[]): void {
  if (node.type === 'columns' && node.id?.endsWith('-btns') && parentId?.startsWith('hero')) {
    acc.push(node);
  }
  const childParentId = node.id || parentId;
  if (Array.isArray(node.blocks)) {
    for (const child of node.blocks) findHeroButtons(child, childParentId, acc);
  }
  // columns blocks store their children under `columns[i].blocks` rather
  // than `blocks` directly; walk those too.
  if (Array.isArray(node.columns)) {
    for (const col of node.columns) {
      if (Array.isArray(col.blocks)) {
        for (const child of col.blocks) findHeroButtons(child as Block, childParentId, acc);
      }
    }
  }
}

function fixHeroButtons(col: Block): number {
  let n = 0;
  if (!Array.isArray(col.columns)) return 0;
  for (const inner of col.columns) {
    if (!Array.isArray(inner.blocks)) continue;
    for (const child of inner.blocks) {
      if (fixButton(child as Block)) n += 1;
    }
  }
  return n;
}

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main not found');
  const rows = await db.select({ id: posts.id, slug: posts.slug, content: posts.content }).from(posts).where(eq(posts.websiteId, site.id));
  console.log(`Scanning ${rows.length} posts...`);
  let postsTouched = 0;
  let buttonsFixed = 0;
  for (const r of rows) {
    if (!r.content) continue;
    let parsed: { blocks: Block[] };
    try { parsed = JSON.parse(r.content); }
    catch { continue; }
    const ctas: Block[] = [];
    for (const top of parsed.blocks ?? []) findHeroButtons(top, top.id, ctas);
    if (ctas.length === 0) continue;
    let n = 0;
    for (const c of ctas) n += fixHeroButtons(c);
    if (n === 0) continue;
    await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, r.id));
    postsTouched += 1;
    buttonsFixed += n;
    console.log(`  post ${r.id} (${r.slug}): ${ctas.length} hero CTA group${ctas.length === 1 ? '' : 's'}, ${n} buttons styled`);
  }
  console.log(`\nDone. Posts touched: ${postsTouched}. Buttons standardized: ${buttonsFixed}.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
