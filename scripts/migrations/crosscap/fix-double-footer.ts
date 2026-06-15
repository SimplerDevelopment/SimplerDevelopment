import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Crosscap — remove the embedded `site-footer` block from the home page.
 *
 * The public site layout (app/sites/[domain]/layout.tsx) renders a universal
 * <SiteFooter /> on every page. The home page ALSO embedded a `site-footer`
 * block as its last content block, producing TWO footers on the home page only.
 * Every other page (about/services/insights) relies solely on the global footer.
 *
 * Fix: strip any `site-footer` block from the home post content so home matches
 * every other page. The SEC compliance disclaimer that lived in the embedded
 * block is moved into the global footer via SITE_CONTACT_OVERRIDES (layout.tsx),
 * so it now shows site-wide instead of home-only.
 *
 * Run DRY (default):   bun scripts/migrations/crosscap/fix-double-footer.ts
 * Run APPLY:           APPLY=1 bun scripts/migrations/crosscap/fix-double-footer.ts
 */
async function run() {
  const APPLY = process.env.APPLY === '1';
  const host = (process.env.DATABASE_URL || '').replace(/^.*@([^/]+)\/.*$/, '$1') || '(unknown)';
  console.log(`Target DB host: ${host}`);
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const WEBSITE_ID = 143; // crosscap-advisors (from ids.json)

  const [home] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, 'home'), eq(posts.websiteId, WEBSITE_ID)))
    .limit(1);

  if (!home) {
    console.error(`No home post found for websiteId ${WEBSITE_ID}.`);
    process.exit(1);
  }

  const parsed = typeof home.content === 'string' ? JSON.parse(home.content) : home.content;
  const blocks: Array<{ type?: string; id?: string }> = Array.isArray(parsed?.blocks) ? parsed.blocks : [];

  const footerBlocks = blocks.filter(b => b?.type === 'site-footer');
  console.log(`Home post id=${home.id}  blocks=${blocks.length}`);
  console.log(`Top-level block types: ${blocks.map(b => b?.type).join(', ')}`);
  console.log(`site-footer blocks found at top level: ${footerBlocks.length}`);

  if (footerBlocks.length === 0) {
    console.log('Nothing to do — no embedded site-footer block present.');
    process.exit(0);
  }

  const cleaned = { ...parsed, blocks: blocks.filter(b => b?.type !== 'site-footer') };

  if (!APPLY) {
    console.log(`\n[DRY RUN] Would remove ${footerBlocks.length} site-footer block(s).`);
    console.log(`[DRY RUN] Resulting block count: ${cleaned.blocks.length}`);
    console.log('Re-run with APPLY=1 to persist.');
    process.exit(0);
  }

  await db.update(posts).set({ content: JSON.stringify(cleaned) }).where(eq(posts.id, home.id));
  console.log(`\n✓ Removed ${footerBlocks.length} site-footer block(s). New block count: ${cleaned.blocks.length}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
