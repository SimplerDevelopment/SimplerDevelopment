/**
 * How to Qualify page (post id 804) — iteration 4.
 *
 * Remaining gap: the final "Are You Ready to Apply?" CTA section renders
 * undersized and without the blue button styling cardiff.co uses, because
 * the legacy `cta` block renderer ignores `block.style` (backgroundColor,
 * paddingTop/Bottom, customCSS gradient). The deep-blue band collapses to
 * a small bg-primary/10 strip with no vertical breathing room.
 *
 * Fix: replace blocks[5] (final-cta `cta`) with a single `html-render`
 * block that bakes the full-bleed dark-blue gradient band, white headline,
 * white body, bright orange primary button, ghost-white secondary. Width
 * 'full' so it goes edge-to-edge. Same pattern as styled-about-iter3.ts.
 *
 * Idempotent: aborts unless blocks[5].id === 'final-cta' OR
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

  const POST_ID = 804;
  const NEW_ID = 'final-cta-band';

  const CTA_HTML = `
<style>
  .cd-htq-cta { background-image: linear-gradient(135deg, #1c3370 0%, #25418b 100%); padding: 96px 24px 96px 24px; margin: 0; }
  .cd-htq-cta__inner { max-width: 780px; margin: 0 auto; text-align: center; }
  .cd-htq-cta__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.5rem; font-weight: 800; letter-spacing: -0.018em; color: #ffffff; margin: 0 0 18px 0; line-height: 1.15; }
  .cd-htq-cta__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.6; color: rgba(255,255,255,0.82); margin: 0 auto 32px auto; max-width: 640px; }
  .cd-htq-cta__actions { display: flex; flex-direction: row; gap: 14px; justify-content: center; flex-wrap: wrap; }
  .cd-htq-cta__btn-primary { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; background: #ef6632; padding: 16px 36px; border-radius: 6px; text-decoration: none; box-shadow: 0 10px 24px rgba(239,102,50,0.4); transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .cd-htq-cta__btn-primary:hover { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(239,102,50,0.55); }
  .cd-htq-cta__btn-secondary { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; background: rgba(255,255,255,0.06); padding: 16px 30px; border-radius: 6px; text-decoration: none; border: 1.5px solid rgba(255,255,255,0.55); backdrop-filter: blur(4px); transition: background 0.18s ease, border-color 0.18s ease; }
  .cd-htq-cta__btn-secondary:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.85); }
  @media (max-width: 720px) {
    .cd-htq-cta { padding: 64px 18px 64px 18px; }
    .cd-htq-cta__title { font-size: 1.875rem; }
    .cd-htq-cta__actions { flex-direction: column; align-items: stretch; }
    .cd-htq-cta__btn-primary, .cd-htq-cta__btn-secondary { width: 100%; text-align: center; padding-left: 18px; padding-right: 18px; }
  }
</style>
<section class="cd-htq-cta">
  <div class="cd-htq-cta__inner">
    <h2 class="cd-htq-cta__title" data-field="title">{{title}}</h2>
    <p class="cd-htq-cta__desc" data-field="description">{{description}}</p>
    <div class="cd-htq-cta__actions">
      <a class="cd-htq-cta__btn-primary" href="{{primaryUrl}}" data-field="primaryText">{{primaryText}}</a>
      <a class="cd-htq-cta__btn-secondary" href="{{secondaryUrl}}" data-field="secondaryText">{{secondaryText}}</a>
    </div>
  </div>
</section>
`.trim();

  const ctaBandBlock = {
    id: NEW_ID,
    type: 'html-render' as const,
    order: 6,
    width: 'full' as const,
    html: CTA_HTML,
    fields: [
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Are You Ready to Apply?' },
      {
        name: 'description',
        label: 'Sub-copy',
        type: 'textarea' as const,
        default:
          'Get a decision in minutes. Same-day funding available. Up to $250,000 with no collateral required.',
      },
      { name: 'primaryText', label: 'Primary button text', type: 'text' as const, default: 'Check Eligibility' },
      { name: 'primaryUrl', label: 'Primary button URL', type: 'url' as const, default: '#' },
      { name: 'secondaryText', label: 'Secondary button text', type: 'text' as const, default: 'Talk to a Specialist' },
      { name: 'secondaryUrl', label: 'Secondary button URL', type: 'url' as const, default: '#' },
    ],
    values: {
      title: 'Are You Ready to Apply?',
      description:
        'Get a decision in minutes. Same-day funding available. Up to $250,000 with no collateral required.',
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
