/**
 * Iter 2: Replace post 829, block 'sec-3' ("Your Go-To Lender for Business Funding")
 * with a blue full-width section featuring a 4-card grid that matches cardiff.co.
 *
 * Original cardiff.co/business-loans/products/sba-loans/ renders this section as a
 * deep-blue background band with a centered uppercase headline, an orange underline,
 * a short intro paragraph, a 4-column grid of white "cards" (each with an icon,
 * a title, and a short description), and a single green "APPLY NOW" CTA below.
 *
 * Our current port renders this section as plain stacked headings + paragraphs on
 * a white background — the entire blue brand moment is missing.
 *
 * Same pattern as styled-sba-loans-iter1.ts / replace-home-hero.ts: swap the whole
 * `section` block for an `html-render` block.
 *
 * Idempotent: detects if sec-3 has already been replaced (type === 'html-render')
 * and re-applies cleanly.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const SBA_POST_ID = 829;
const TARGET_BLOCK_ID = 'sec-3';

const SEC3_HTML = `
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
      <div class="cd-sba-goto__card">
        <div class="cd-sba-goto__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
        <h3 class="cd-sba-goto__card-title" data-field="card1Title">{{card1Title}}</h3>
        <p class="cd-sba-goto__card-desc" data-field="card1Desc">{{card1Desc}}</p>
      </div>
      <div class="cd-sba-goto__card">
        <div class="cd-sba-goto__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
        <h3 class="cd-sba-goto__card-title" data-field="card2Title">{{card2Title}}</h3>
        <p class="cd-sba-goto__card-desc" data-field="card2Desc">{{card2Desc}}</p>
      </div>
      <div class="cd-sba-goto__card">
        <div class="cd-sba-goto__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
        <h3 class="cd-sba-goto__card-title" data-field="card3Title">{{card3Title}}</h3>
        <p class="cd-sba-goto__card-desc" data-field="card3Desc">{{card3Desc}}</p>
      </div>
      <div class="cd-sba-goto__card">
        <div class="cd-sba-goto__icon"><span class="material-icons" data-field="icon4">{{icon4}}</span></div>
        <h3 class="cd-sba-goto__card-title" data-field="card4Title">{{card4Title}}</h3>
        <p class="cd-sba-goto__card-desc" data-field="card4Desc">{{card4Desc}}</p>
      </div>
    </div>
    <div class="cd-sba-goto__cta-wrap">
      <a class="cd-sba-goto__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
    </div>
  </div>
</section>
`.trim();

const FIELDS = [
  { name: 'title', label: 'Section title', type: 'text', default: 'Your Go-To Lender for Business Funding' },
  { name: 'intro', label: 'Intro copy', type: 'textarea', default: 'Select from a diverse array of financing solutions tailored to meet your business objectives. We navigate the financial intricacies, freeing you to concentrate on scaling your enterprise.' },
  { name: 'icon1', label: 'Card 1 icon', type: 'text', default: 'assignment_turned_in' },
  { name: 'card1Title', label: 'Card 1 title', type: 'text', default: 'All-In-One Application' },
  { name: 'card1Desc', label: 'Card 1 description', type: 'textarea', default: 'Discover the perfect financing option tailored to your business needs in just a few clicks.' },
  { name: 'icon2', label: 'Card 2 icon', type: 'text', default: 'bolt' },
  { name: 'card2Title', label: 'Card 2 title', type: 'text', default: 'Faster Processing' },
  { name: 'card2Desc', label: 'Card 2 description', type: 'textarea', default: 'Once approved, your funds are promptly released, enabling you to advance your business goals efficiently.' },
  { name: 'icon3', label: 'Card 3 icon', type: 'text', default: 'tune' },
  { name: 'card3Title', label: 'Card 3 title', type: 'text', default: 'Flexible Financing' },
  { name: 'card3Desc', label: 'Card 3 description', type: 'textarea', default: 'We offer a range of loan options that flex to fit your business’s unique financial landscape.' },
  { name: 'icon4', label: 'Card 4 icon', type: 'text', default: 'support_agent' },
  { name: 'card4Title', label: 'Card 4 title', type: 'text', default: 'Ongoing Support' },
  { name: 'card4Desc', label: 'Card 4 description', type: 'textarea', default: 'As your business grows, our financing solutions scale to meet your changing needs.' },
  { name: 'ctaText', label: 'CTA text', type: 'text', default: 'Apply Now' },
  { name: 'ctaUrl', label: 'CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
];

const VALUES: Record<string, string> = {};
for (const f of FIELDS) VALUES[f.name] = f.default as string;

const newSec3Block = {
  id: TARGET_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: SEC3_HTML,
  fields: FIELDS,
  values: VALUES,
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, SBA_POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${SBA_POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${SBA_POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }
  const idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${SBA_POST_ID}: no block with id='${TARGET_BLOCK_ID}'; aborting`);
    process.exit(1);
  }
  const existing = parsed.blocks[idx];
  if (existing.type !== 'section' && existing.type !== 'html-render') {
    console.error(`Post ${SBA_POST_ID}: block '${TARGET_BLOCK_ID}' has unexpected type '${existing.type}'; aborting`);
    process.exit(1);
  }
  const wasAlreadyHtmlRender = existing.type === 'html-render';
  parsed.blocks[idx] = newSec3Block;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, SBA_POST_ID));
  console.log(
    `Updated post ${SBA_POST_ID}: replaced '${TARGET_BLOCK_ID}' with html-render 4-card grid` +
      (wasAlreadyHtmlRender ? ' (was already html-render — reapplied)' : ' (was section)') +
      `. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
