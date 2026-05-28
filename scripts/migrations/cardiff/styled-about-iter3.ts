/**
 * About page (post id 795) — iteration 3.
 *
 * Single biggest remaining gap: the final CTA band ("Ready to borrow
 * better?") sits below a tall white slab and only THEN the dark-blue gradient
 * begins. Root cause in CtaBlockRender.tsx: the `cta` block renderer ignores
 * `block.style` entirely — backgroundColor, paddingTop/Bottom, and customCSS
 * gradient are all dropped, so the deep-blue band ends up as a small `bg-
 * primary/10` strip inside a centered `container mx-auto` with no vertical
 * padding. The result is a big white gap above the band.
 *
 * Original cardiff.co finishes the page with a full-bleed deep-blue band:
 *   - white headline "Ready to borrow better?"
 *   - light sub-copy
 *   - bright orange "Check Eligibility" primary button
 *   - outlined ghost "Talk to a Specialist" secondary
 *   - flush against the leadership/footer above — no white slab.
 *
 * Fix: replace blocks[3] (final-cta `cta`) with a single `html-render`
 * block that bakes the full-bleed dark band and CTA buttons. This bypasses
 * the broken CtaBlockRender for this page without touching shared renderer
 * code. Width 'full' so it goes edge-to-edge.
 *
 * Idempotent: aborts unless blocks[3].id === 'final-cta' OR
 * 'final-cta-band' (already-migrated marker). Re-running just refreshes
 * the html/values.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 795;
  const NEW_ID = 'final-cta-band';

  const CTA_HTML = `
<style>
  .cd-cta { background-image: linear-gradient(135deg, #1c3370 0%, #25418b 100%); padding: 96px 24px 96px 24px; margin: 0; }
  .cd-cta__inner { max-width: 780px; margin: 0 auto; text-align: center; }
  .cd-cta__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.5rem; font-weight: 800; letter-spacing: -0.018em; color: #ffffff; margin: 0 0 18px 0; line-height: 1.15; }
  .cd-cta__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.6; color: rgba(255,255,255,0.82); margin: 0 auto 32px auto; max-width: 640px; }
  .cd-cta__actions { display: flex; flex-direction: row; gap: 14px; justify-content: center; flex-wrap: wrap; }
  .cd-cta__btn-primary { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; background: #ef6632; padding: 16px 36px; border-radius: 6px; text-decoration: none; box-shadow: 0 10px 24px rgba(239,102,50,0.4); transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .cd-cta__btn-primary:hover { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(239,102,50,0.55); }
  .cd-cta__btn-secondary { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; background: rgba(255,255,255,0.06); padding: 16px 30px; border-radius: 6px; text-decoration: none; border: 1.5px solid rgba(255,255,255,0.55); backdrop-filter: blur(4px); transition: background 0.18s ease, border-color 0.18s ease; }
  .cd-cta__btn-secondary:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.85); }
  @media (max-width: 720px) {
    .cd-cta { padding: 64px 18px 64px 18px; }
    .cd-cta__title { font-size: 1.875rem; }
    .cd-cta__actions { flex-direction: column; align-items: stretch; }
    .cd-cta__btn-primary, .cd-cta__btn-secondary { width: 100%; text-align: center; padding-left: 18px; padding-right: 18px; }
  }
</style>
<section class="cd-cta">
  <div class="cd-cta__inner">
    <h2 class="cd-cta__title" data-field="title">{{title}}</h2>
    <p class="cd-cta__desc" data-field="description">{{description}}</p>
    <div class="cd-cta__actions">
      <a class="cd-cta__btn-primary" href="{{primaryUrl}}" data-field="primaryText">{{primaryText}}</a>
      <a class="cd-cta__btn-secondary" href="{{secondaryUrl}}" data-field="secondaryText">{{secondaryText}}</a>
    </div>
  </div>
</section>
`.trim();

  const ctaBandBlock = {
    id: NEW_ID,
    type: 'html-render' as const,
    order: 5,
    width: 'full' as const,
    html: CTA_HTML,
    fields: [
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Ready to borrow better?' },
      {
        name: 'description',
        label: 'Sub-copy',
        type: 'textarea' as const,
        default:
          'Same-day funding. Decisions in minutes. Up to $250,000 with no collateral required.',
      },
      { name: 'primaryText', label: 'Primary button text', type: 'text' as const, default: 'Check Eligibility' },
      { name: 'primaryUrl', label: 'Primary button URL', type: 'url' as const, default: '#' },
      { name: 'secondaryText', label: 'Secondary button text', type: 'text' as const, default: 'Talk to a Specialist' },
      { name: 'secondaryUrl', label: 'Secondary button URL', type: 'url' as const, default: '#' },
    ],
    values: {
      title: 'Ready to borrow better?',
      description:
        'Same-day funding. Decisions in minutes. Up to $250,000 with no collateral required.',
      primaryText: 'Check Eligibility',
      primaryUrl: 'https://cardiff.co/business/apply',
      secondaryText: 'Talk to a Specialist',
      secondaryUrl: '/contact-us',
    },
  };

  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }
  const ctaIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === 'final-cta' || b?.id === NEW_ID,
  );
  if (ctaIdx < 0) {
    console.error(`Post ${POST_ID}: no final-cta / ${NEW_ID} block found; aborting`);
    process.exit(1);
  }
  const wasId = parsed.blocks[ctaIdx]?.id;
  parsed.blocks[ctaIdx] = ctaBandBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced '${wasId}' (idx ${ctaIdx}) with '${NEW_ID}' html-render. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
