/**
 * Home page (post id 793) — iteration 16.
 *
 * Final CTA band ("Ready to borrow better?", block 14) is a `cta` block.
 * The CtaBlockRender drops `block.style` (no backgroundColor, no
 * paddingTop/Bottom, no customCSS gradient) so the deep-blue band ends
 * up as a small `bg-primary/10` strip inside a centered container — a
 * tall white gap above plus a wimpy band. Same root cause as the about
 * page (see styled-about-iter3.ts).
 *
 * Fix: replace blocks[14] with a single `html-render` block (width
 * 'full') that bakes the full-bleed dark gradient and CTA buttons,
 * mirroring the about-page treatment so the home page finishes flush.
 *
 * Idempotent: aborts unless blocks[14].id === 'final-cta' OR
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

  const POST_ID = 793;
  const NEW_ID = 'final-cta-band';

  const CTA_HTML = `
<style>
  .cd-cta { background-image: linear-gradient(135deg, #1c3370 0%, #25418b 100%); padding: 104px 24px 104px 24px; margin: 0; position: relative; overflow: hidden; }
  .cd-cta::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle at 18% 22%, rgba(90,201,111,0.16) 0%, rgba(90,201,111,0) 42%), radial-gradient(circle at 82% 78%, rgba(255,183,152,0.14) 0%, rgba(255,183,152,0) 46%); pointer-events: none; }
  .cd-cta__inner { position: relative; max-width: 820px; margin: 0 auto; text-align: center; }
  .cd-cta__overline { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.32em; text-transform: uppercase; color: #5ac96f; margin: 0 0 18px 0; }
  .cd-cta__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.75rem; font-weight: 800; letter-spacing: -0.018em; color: #ffffff; margin: 0 0 20px 0; line-height: 1.12; }
  .cd-cta__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; line-height: 1.6; color: rgba(255,255,255,0.84); margin: 0 auto 36px auto; max-width: 660px; }
  .cd-cta__actions { display: flex; flex-direction: row; gap: 14px; justify-content: center; flex-wrap: wrap; }
  .cd-cta__btn-primary { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; background: #ef6632; padding: 18px 40px; border-radius: 6px; text-decoration: none; box-shadow: 0 12px 30px rgba(239,102,50,0.42); transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .cd-cta__btn-primary:hover { transform: translateY(-1px); box-shadow: 0 16px 36px rgba(239,102,50,0.58); }
  .cd-cta__btn-secondary { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; background: rgba(255,255,255,0.06); padding: 18px 34px; border-radius: 6px; text-decoration: none; border: 1.5px solid rgba(255,255,255,0.55); backdrop-filter: blur(4px); transition: background 0.18s ease, border-color 0.18s ease; }
  .cd-cta__btn-secondary:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.85); }
  @media (max-width: 720px) {
    .cd-cta { padding: 72px 18px 72px 18px; }
    .cd-cta__title { font-size: 2rem; }
    .cd-cta__desc { font-size: 1rem; }
    .cd-cta__actions { flex-direction: column; align-items: stretch; }
    .cd-cta__btn-primary, .cd-cta__btn-secondary { width: 100%; text-align: center; padding-left: 18px; padding-right: 18px; }
  }
</style>
<section class="cd-cta">
  <div class="cd-cta__inner">
    <p class="cd-cta__overline" data-field="overline">{{overline}}</p>
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
    order: 14,
    width: 'full' as const,
    html: CTA_HTML,
    fields: [
      { name: 'overline', label: 'Overline', type: 'text' as const, default: 'READY WHEN YOU ARE' },
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Ready to borrow better?' },
      {
        name: 'description',
        label: 'Sub-copy',
        type: 'textarea' as const,
        default:
          'Apply in under two minutes. No collateral required. Decisions in minutes, funds the same day.',
      },
      { name: 'primaryText', label: 'Primary button text', type: 'text' as const, default: 'Check Eligibility' },
      { name: 'primaryUrl', label: 'Primary button URL', type: 'url' as const, default: '#' },
      { name: 'secondaryText', label: 'Secondary button text', type: 'text' as const, default: 'Talk to a Specialist' },
      { name: 'secondaryUrl', label: 'Secondary button URL', type: 'url' as const, default: '#' },
    ],
    values: {
      overline: 'READY WHEN YOU ARE',
      title: 'Ready to borrow better?',
      description:
        'Apply in under two minutes. No collateral required. Decisions in minutes, funds the same day.',
      primaryText: 'Check Eligibility',
      primaryUrl: 'https://cardiff.co/business/apply',
      secondaryText: 'Talk to a Lending Specialist',
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
