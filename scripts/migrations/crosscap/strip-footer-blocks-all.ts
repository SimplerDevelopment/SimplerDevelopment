import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Crosscap — strip embedded `site-footer` blocks from ALL pages.
 *
 * The universal <SiteFooter /> renders on every page; any page whose content
 * embeds a `site-footer` block shows a DOUBLE footer. The first pass only fixed
 * the home page; this scans every post on the site and removes the block from
 * all of them (recursively, in case a footer block is nested inside a section).
 *
 * DRY:    DATABASE_URL=<metro> bun scripts/migrations/crosscap/strip-footer-blocks-all.ts
 * APPLY:  DATABASE_URL=<metro> APPLY=1 bun scripts/migrations/crosscap/strip-footer-blocks-all.ts
 */
async function run() {
  const APPLY = process.env.APPLY === '1';
  const host = (process.env.DATABASE_URL || '').replace(/^.*@([^/]+)\/.*$/, '$1') || '(unknown)';
  console.log(`Target DB host: ${host}  APPLY=${APPLY}`);
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const WEBSITE_ID = 143;
  const rows = await db.select().from(posts).where(eq(posts.websiteId, WEBSITE_ID));
  console.log(`Scanning ${rows.length} posts for websiteId ${WEBSITE_ID}…\n`);

  // Recursively remove any block with type === 'site-footer'. Returns [cleaned, removedCount].
  function strip(blocks: unknown): [unknown[], number] {
    if (!Array.isArray(blocks)) return [[], 0];
    let removed = 0;
    const out: unknown[] = [];
    for (const b of blocks) {
      const block = b as Record<string, unknown>;
      if (block?.type === 'site-footer') { removed++; continue; }
      // recurse into common nesting fields
      for (const key of ['blocks', 'columns']) {
        if (Array.isArray(block?.[key])) {
          const [childCleaned, childRemoved] = strip(block[key]);
          block[key] = childCleaned;
          removed += childRemoved;
        }
      }
      // columns hold their own nested blocks
      if (Array.isArray(block?.columns)) {
        block.columns = (block.columns as Array<Record<string, unknown>>).map(col => {
          if (Array.isArray(col?.blocks)) {
            const [cc, cr] = strip(col.blocks);
            col.blocks = cc; removed += cr;
          }
          return col;
        });
      }
      out.push(block);
    }
    return [out, removed];
  }

  let totalPagesFixed = 0;
  for (const post of rows) {
    let parsed: { blocks?: unknown } | null = null;
    try { parsed = typeof post.content === 'string' ? JSON.parse(post.content) : post.content; }
    catch { console.log(`  ! ${post.slug} — unparseable content, skipped`); continue; }
    if (!parsed || !Array.isArray(parsed.blocks)) continue;
    const [cleaned, removed] = strip(parsed.blocks);
    if (removed > 0) {
      console.log(`  ${APPLY ? 'FIX' : 'WOULD FIX'}: /${post.slug} (id ${post.id}) — removing ${removed} site-footer block(s)`);
      if (APPLY) {
        parsed.blocks = cleaned;
        await db.update(posts).set({ content: JSON.stringify(parsed) }).where(eq(posts.id, post.id));
      }
      totalPagesFixed++;
    }
  }

  console.log(`\n${APPLY ? 'Fixed' : 'Would fix'} ${totalPagesFixed} page(s).`);
  if (!APPLY && totalPagesFixed > 0) console.log('Re-run with APPLY=1 to persist.');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
