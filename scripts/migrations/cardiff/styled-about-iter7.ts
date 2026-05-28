/**
 * About page (post id 795) — iteration 7.
 *
 * Single biggest remaining visual gap (after iters 1-6 nailed hero, diff
 * stats, process, leadership, awards, and CTA): the About hero copy
 * promises "personalized service... transparent experience, owners
 * across industries like construction, restaurants, trucking, and
 * more." — but the page never delivers on that promise. There's no
 * visual surface that names the verticals Cardiff actually serves.
 *
 * The result: hero teases a breadth of customer types, then the page
 * pivots into abstract numbers + team bios + accolades, leaving a
 * small-business operator unable to self-identify ("does Cardiff
 * actually fund people like me?"). On real lender About pages this
 * gap is closed by an "Industries We Serve" strip — a tight grid of
 * 8 vertical chips with a material icon + label. It does triple duty:
 *   1. Pays off the hero promise.
 *   2. Acts as a soft-CTA bridge between Leadership (who we are) and
 *      Awards (why trust us) — "and yes, we fund people in YOUR
 *      industry."
 *   3. Adds an internal-link surface point for SEO toward the
 *      per-industry pages (construction, restaurants, etc.) once
 *      those are wired.
 *
 * Fix: insert a new `industries-band` html-render block between
 * leadership-cards (order 5) and awards-band (order 6). 4x2 grid of
 * industry chips, each a vertical card with rounded peach/blue icon
 * tile + label. Background is a subtle light-blue gradient
 * (#f4f7fb -> #ffffff) to differentiate from the white leadership
 * section above and the cream awards section below — re-uses the
 * Raleway eyebrow + 800-weight headline rhythm established in iter4-6
 * so the page reads as one cohesive system.
 *
 * Uses data-repeat="industries" with {{industries.icon}} /
 * {{industries.label}} so the portal editor can reorder, add, or
 * relabel verticals without touching markup.
 *
 * Idempotent: detects existing `industries-band` block and rewrites
 * it; otherwise inserts at the correct position (after
 * leadership-cards) and renumbers downstream `order` values.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 795;
  const NEW_ID = 'industries-band';
  const ANCHOR_ID = 'leadership-cards';

  const INDUSTRIES_HTML = `
<style>
  .cd-ind { background: linear-gradient(180deg, #f4f7fb 0%, #ffffff 100%); padding: 96px 24px 96px 24px; }
  .cd-ind__inner { max-width: 1180px; margin: 0 auto; }
  .cd-ind__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; color: #ef6632; letter-spacing: 0.32em; text-transform: uppercase; text-align: center; margin: 0 0 14px 0; }
  .cd-ind__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.25rem; font-weight: 800; color: #25418b; letter-spacing: -0.018em; text-align: center; margin: 0 0 16px 0; line-height: 1.15; }
  .cd-ind__sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.6; color: #525f7f; text-align: center; margin: 0 auto 56px auto; max-width: 660px; }
  .cd-ind__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-ind__chip { background: #ffffff; border-radius: 14px; padding: 28px 18px 24px 18px; border: 1px solid #e8edf6; box-shadow: 0 8px 22px rgba(28,51,112,0.05); text-align: center; transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; text-decoration: none; display: block; }
  .cd-ind__chip:hover { transform: translateY(-3px); box-shadow: 0 16px 36px rgba(28,51,112,0.12); border-color: #d9e1ee; }
  .cd-ind__icon { width: 52px; height: 52px; border-radius: 13px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px auto; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; box-shadow: 0 6px 14px rgba(28,51,112,0.22); }
  .cd-ind__chip:nth-child(2n) .cd-ind__icon { background: linear-gradient(135deg, #ef6632 0%, #ffb798 100%); box-shadow: 0 6px 14px rgba(239,102,50,0.24); }
  .cd-ind__chip:nth-child(4n+3) .cd-ind__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 6px 14px rgba(58,168,86,0.24); }
  .cd-ind__icon .material-icons { font-size: 26px; }
  .cd-ind__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; font-weight: 700; color: #1c3370; letter-spacing: -0.005em; line-height: 1.3; margin: 0; }
  .cd-ind__footer { margin: 48px auto 0 auto; max-width: 720px; text-align: center; }
  .cd-ind__footer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #6b7390; margin: 0 0 18px 0; }
  .cd-ind__footer-link { display: inline-flex; align-items: center; gap: 8px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #25418b; text-decoration: none; padding: 11px 22px; border: 1.5px solid #25418b; border-radius: 999px; background: transparent; transition: background-color .18s ease, color .18s ease; }
  .cd-ind__footer-link:hover { background: #25418b; color: #ffffff; }
  .cd-ind__footer-link .material-icons { font-size: 16px; }
  @media (max-width: 980px) {
    .cd-ind__grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 720px) {
    .cd-ind__grid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
  }
  @media (max-width: 480px) {
    .cd-ind { padding: 72px 18px 72px 18px; }
    .cd-ind__title { font-size: 1.875rem; }
    .cd-ind__chip { padding: 22px 14px 18px 14px; }
    .cd-ind__icon { width: 46px; height: 46px; }
    .cd-ind__label { font-size: 0.875rem; }
  }
</style>
<section class="cd-ind">
  <div class="cd-ind__inner">
    <p class="cd-ind__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-ind__title" data-field="title">{{title}}</h2>
    <p class="cd-ind__sub" data-field="sub">{{sub}}</p>
    <div class="cd-ind__grid">
      <a class="cd-ind__chip" href="{{industries.url}}" data-repeat="industries">
        <div class="cd-ind__icon"><span class="material-icons" data-field="icon">{{industries.icon}}</span></div>
        <p class="cd-ind__label" data-field="label">{{industries.label}}</p>
      </a>
    </div>
    <div class="cd-ind__footer">
      <p class="cd-ind__footer-text" data-field="footerText">{{footerText}}</p>
      <a class="cd-ind__footer-link" href="{{footerUrl}}">
        <span data-field="footerLink">{{footerLink}}</span>
        <span class="material-icons">arrow_forward</span>
      </a>
    </div>
  </div>
</section>
`.trim();

  const industriesBlock = {
    id: NEW_ID,
    type: 'html-render' as const,
    order: 6,
    width: 'full' as const,
    html: INDUSTRIES_HTML,
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'WHO WE FUND' },
      {
        name: 'title',
        label: 'Headline',
        type: 'text' as const,
        default: 'Industries we serve',
      },
      {
        name: 'sub',
        label: 'Sub-headline',
        type: 'textarea' as const,
        default:
          'Cardiff funds owner-operators across the real economy — the trades, the storefronts, the trucks, and the clinics that keep America running.',
      },
      {
        name: 'industries',
        label: 'Industry chips',
        type: 'array' as const,
        itemFields: [
          { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'storefront' },
          { name: 'label', label: 'Label', type: 'text' as const, default: '' },
          { name: 'url', label: 'Link', type: 'url' as const, default: '#' },
        ],
      },
      {
        name: 'footerText',
        label: 'Footer text',
        type: 'textarea' as const,
        default:
          "Don't see your industry? We fund hundreds of business types across the U.S. — let's talk.",
      },
      {
        name: 'footerLink',
        label: 'Footer link text',
        type: 'text' as const,
        default: 'See all industries',
      },
      {
        name: 'footerUrl',
        label: 'Footer link URL',
        type: 'url' as const,
        default: '/industries',
      },
    ],
    values: {
      eyebrow: 'WHO WE FUND',
      title: 'Industries we serve',
      sub:
        'Cardiff funds owner-operators across the real economy — the trades, the storefronts, the trucks, and the clinics that keep America running.',
      industries: [
        { icon: 'construction', label: 'Construction', url: '/industries/construction' },
        { icon: 'restaurant', label: 'Restaurants', url: '/industries/restaurants' },
        { icon: 'local_shipping', label: 'Trucking & Transport', url: '/industries/trucking' },
        { icon: 'storefront', label: 'Retail', url: '/industries/retail' },
        { icon: 'medical_services', label: 'Healthcare', url: '/industries/healthcare' },
        { icon: 'content_cut', label: 'Beauty & Salon', url: '/industries/beauty' },
        { icon: 'directions_car', label: 'Automotive', url: '/industries/automotive' },
        { icon: 'agriculture', label: 'Agriculture', url: '/industries/agriculture' },
      ],
      footerText:
        "Don't see your industry? We fund hundreds of business types across the U.S. — let's talk.",
      footerLink: 'See all industries',
      footerUrl: '/industries',
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

  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === NEW_ID);
  if (existingIdx >= 0) {
    // Idempotent refresh of html / values / fields.
    const prevOrder = parsed.blocks[existingIdx]?.order ?? industriesBlock.order;
    parsed.blocks[existingIdx] = { ...industriesBlock, order: prevOrder };
    await db
      .update(posts)
      .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
      .where(eq(posts.id, POST_ID));
    console.log(
      `Refreshed existing '${NEW_ID}' block at idx ${existingIdx}. Block count: ${parsed.blocks.length}`,
    );
    process.exit(0);
  }

  const anchorIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === ANCHOR_ID,
  );
  if (anchorIdx < 0) {
    console.error(
      `Post ${POST_ID}: no anchor '${ANCHOR_ID}' block found; aborting (run iter2 first).`,
    );
    process.exit(1);
  }
  const anchorOrder: number =
    typeof parsed.blocks[anchorIdx]?.order === 'number'
      ? parsed.blocks[anchorIdx].order
      : anchorIdx + 1;
  const insertOrder = anchorOrder + 1;

  // Bump any downstream block.order >= insertOrder so we slot in cleanly.
  for (const b of parsed.blocks) {
    if (typeof b?.order === 'number' && b.order >= insertOrder) {
      b.order = b.order + 1;
    }
  }
  industriesBlock.order = insertOrder;
  parsed.blocks.splice(anchorIdx + 1, 0, industriesBlock);

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Inserted '${NEW_ID}' html-render block at idx ${anchorIdx + 1} (order ${insertOrder}). Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
