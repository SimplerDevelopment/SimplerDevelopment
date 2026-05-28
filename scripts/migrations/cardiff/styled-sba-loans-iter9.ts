/**
 * Iter 9 — post 829 (SBA Loans). After iters 1-8 every band is styled, but
 * `sec-3` ("Your Go-To Lender for Business Funding") still uses 8 flat
 * icon{N}/card{N}Title/card{N}Desc fields instead of the standard
 * `data-repeat="cards"` array pattern used by the rest of the cardiff port
 * (sec-2-benefits, sec-4-reqs, sec-6-why, sec-7-testimonials). That makes the
 * block painful to extend in the editor — adding a 5th card means hand-editing
 * HTML, fields, and values.
 *
 * Rewrites sec-3 in place: same dark-blue gradient band, same orange→peach
 * icon chips, same green CTA, same 4-up grid → 2-up → 1-up responsive — but
 * the grid becomes a single `data-repeat="cards"` template using
 * `{{cards.icon}}` / `{{cards.title}}` / `{{cards.desc}}`. Editor users can
 * now add/remove cards from one array control.
 *
 * Idempotent: locates sec-3 by id and always rewrites html + fields + values.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 829;
const TARGET_BLOCK_ID = 'sec-3';

const GOTO_HTML = `
<style>
  .cd-sba-goto { position: relative; background: linear-gradient(180deg, #1c3370 0%, #25418b 100%); color: #fff; padding: 96px 24px 110px 24px; overflow: hidden; }
  .cd-sba-goto::before { content: ''; position: absolute; top: -120px; right: -120px; width: 380px; height: 380px; background: radial-gradient(circle, rgba(90,201,111,0.18) 0%, rgba(90,201,111,0) 70%); pointer-events: none; }
  .cd-sba-goto::after { content: ''; position: absolute; bottom: -160px; left: -120px; width: 420px; height: 420px; background: radial-gradient(circle, rgba(255,183,152,0.10) 0%, rgba(255,183,152,0) 70%); pointer-events: none; }
  .cd-sba-goto__inner { position: relative; z-index: 2; max-width: 1200px; margin: 0 auto; }
  .cd-sba-goto__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.4rem; font-weight: 800; line-height: 1.15; letter-spacing: -0.015em; text-transform: uppercase; text-align: center; margin: 0 0 18px 0; color: #fff; }
  .cd-sba-goto__rule { width: 56px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 26px auto; }
  .cd-sba-goto__intro { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.65; color: rgba(255,255,255,0.88); max-width: 760px; margin: 0 auto 52px auto; text-align: center; }
  .cd-sba-goto__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px; margin: 0 0 48px 0; }
  .cd-sba-goto__card { background: #ffffff; border-radius: 10px; padding: 32px 22px 28px 22px; text-align: center; box-shadow: 0 18px 44px rgba(7, 18, 50, 0.28); transition: transform 0.22s ease, box-shadow 0.22s ease; }
  .cd-sba-goto__card:hover { transform: translateY(-4px); box-shadow: 0 26px 58px rgba(7, 18, 50, 0.36); }
  .cd-sba-goto__icon { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #ef6632 0%, #ffb798 100%); color: #fff; margin: 0 auto 18px auto; box-shadow: 0 10px 22px rgba(239,102,50,0.32); }
  .cd-sba-goto__icon .material-icons { font-size: 30px; }
  .cd-sba-goto__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.05rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; color: #1c3370; margin: 0 0 12px 0; line-height: 1.25; }
  .cd-sba-goto__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.55; color: #525f7f; margin: 0; }
  .cd-sba-goto__cta-wrap { text-align: center; }
  .cd-sba-goto__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 17px 38px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-sba-goto__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 44px rgba(90,201,111,0.55); }
  @media (max-width: 1000px) {
    .cd-sba-goto__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 600px) {
    .cd-sba-goto { padding: 64px 18px 76px 18px; }
    .cd-sba-goto__title { font-size: 1.75rem; }
    .cd-sba-goto__grid { grid-template-columns: 1fr; gap: 16px; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<section class="cd-sba-goto">
  <div class="cd-sba-goto__inner">
    <h2 class="cd-sba-goto__title" data-field="title">{{title}}</h2>
    <div class="cd-sba-goto__rule"></div>
    <p class="cd-sba-goto__intro" data-field="intro">{{intro}}</p>
    <div class="cd-sba-goto__grid">
      <div class="cd-sba-goto__card" data-repeat="cards">
        <div class="cd-sba-goto__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
        <h3 class="cd-sba-goto__card-title" data-field="title">{{cards.title}}</h3>
        <p class="cd-sba-goto__card-desc" data-field="desc">{{cards.desc}}</p>
      </div>
    </div>
    <div class="cd-sba-goto__cta-wrap">
      <a class="cd-sba-goto__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
    </div>
  </div>
</section>
`.trim();

const CARDS = [
  {
    icon: 'assignment_turned_in',
    title: 'All-In-One Application',
    desc: 'Discover the perfect financing option tailored to your business needs in just a few clicks.',
  },
  {
    icon: 'bolt',
    title: 'Faster Processing',
    desc: 'Once approved, your funds are promptly released, enabling you to advance your business goals efficiently.',
  },
  {
    icon: 'tune',
    title: 'Flexible Financing',
    desc: 'We offer a range of loan options that flex to fit your business’s unique financial landscape.',
  },
  {
    icon: 'support_agent',
    title: 'Ongoing Support',
    desc: 'As your business grows, our financing solutions scale to meet your changing needs.',
  },
];

const GOTO_VALUES = {
  title: 'Your Go-To Lender for Business Funding',
  intro:
    'Select from a diverse array of financing solutions tailored to meet your business objectives. We navigate the financial intricacies, freeing you to concentrate on scaling your enterprise.',
  ctaText: 'Apply Now',
  ctaUrl: 'https://cardiff.co/business/apply',
  cards: CARDS,
} as const;

const GOTO_FIELDS = [
  { name: 'title', label: 'Section title', type: 'text' as const },
  { name: 'intro', label: 'Intro paragraph', type: 'textarea' as const },
  { name: 'ctaText', label: 'CTA label', type: 'text' as const },
  { name: 'ctaUrl', label: 'CTA url', type: 'text' as const },
  {
    name: 'cards',
    label: 'Feature cards',
    type: 'array' as const,
    itemFields: [
      { name: 'icon', label: 'Material Icons name', type: 'text' as const },
      { name: 'title', label: 'Card title', type: 'text' as const },
      { name: 'desc', label: 'Card description', type: 'textarea' as const },
    ],
  },
];

async function main() {
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

  const idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const block = parsed.blocks[idx];
  if (block.type !== 'html-render') {
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not html-render (was ${block.type}); aborting`,
    );
    process.exit(1);
  }

  block.html = GOTO_HTML;
  block.fields = GOTO_FIELDS;
  block.values = { ...GOTO_VALUES };

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-3 -> "Your Go-To Lender" converted to data-repeat=cards.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
