/**
 * Iter 9 (newsroom, post 826): Add a "Explore the Cardiff Resource Hub"
 * 3-up content-navigation band — Articles / FAQs / Company Information.
 *
 * Source cardiff.co/newsroom/ has a three-column card grid immediately
 * under the featured-news band that points readers into Articles, FAQs,
 * and Company Information. Iters 1-8 covered hero, featured news, latest
 * cards, browse-by-topic, by-the-numbers stats, in-the-media tabs, press
 * contact, and newsletter subscribe — but never the Hub-nav grid, so
 * readers who don't want a press release have no off-ramp into Cardiff's
 * broader resource library. This adds that off-ramp.
 *
 * Placement: inserted immediately AFTER `sec-2c` (the by-the-numbers
 * stats band) and BEFORE `sec-3` (the in-the-media tabs), so the flow is
 * Hero -> Featured -> Latest cards -> Topics -> Stats -> [HUB] -> Media
 * tabs -> Press contact -> Subscribe -> Final CTA.
 *
 * Design: deep-blue gradient band with three hover-lifting cards. Each
 * card has a circular Material Icon chip, eyebrow, title, supporting
 * copy, and an arrow CTA. Brand palette only — different accent per
 * card (navy / orange / green) so the row reads as three distinct
 * destinations. Uses data-repeat="cards" so editors can add/remove
 * destinations without re-templating.
 *
 * Idempotent: re-running detects an existing html-render block at id
 *   `sec-2d-hub` and rewrites it in place (preserving user-edited
 *   values); otherwise inserts it after `sec-2c`. Block `order` is
 *   re-numbered sequentially after the splice.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;
const NEW_BLOCK_ID = 'sec-2d-hub';
const INSERT_AFTER_ID = 'sec-2c';

const HUB_HTML = `
<style>
  .cd-hub { background: linear-gradient(135deg, #1c3370 0%, #25418b 60%, #1c3370 100%); padding: 84px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; position: relative; overflow: hidden; }
  .cd-hub::before { content: ''; position: absolute; top: -140px; left: -120px; width: 380px; height: 380px; border-radius: 50%; background: radial-gradient(circle at 40% 40%, rgba(90,201,111,0.18), rgba(90,201,111,0) 65%); pointer-events: none; }
  .cd-hub::after { content: ''; position: absolute; bottom: -180px; right: -140px; width: 460px; height: 460px; border-radius: 50%; background: radial-gradient(circle at 60% 60%, rgba(255,183,152,0.16), rgba(255,183,152,0) 65%); pointer-events: none; }
  .cd-hub__inner { max-width: 1180px; margin: 0 auto; position: relative; z-index: 2; }
  .cd-hub__header { text-align: center; max-width: 720px; margin: 0 auto 48px auto; }
  .cd-hub__eyebrow { font-family: 'Raleway', sans-serif; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.16em; color: #5ac96f; text-transform: uppercase; margin: 0 0 14px 0; display: inline-flex; align-items: center; gap: 8px; }
  .cd-hub__eyebrow .material-icons { font-size: 18px; }
  .cd-hub__title { font-family: 'Raleway', sans-serif; font-size: 2.25rem; font-weight: 800; line-height: 1.18; letter-spacing: -0.015em; color: #ffffff; margin: 0 0 14px 0; }
  .cd-hub__divider { width: 56px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 18px auto; }
  .cd-hub__sub { font-size: 1.0625rem; line-height: 1.7; color: rgba(255,255,255,0.82); margin: 0; }
  .cd-hub__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-hub__card { background: #ffffff; border-radius: 16px; padding: 36px 30px 30px 30px; box-shadow: 0 20px 44px rgba(0,0,0,0.18); display: flex; flex-direction: column; text-decoration: none; color: inherit; transition: transform .25s ease, box-shadow .25s ease; position: relative; overflow: hidden; }
  .cd-hub__card::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: #25418b; transition: background .25s ease; }
  .cd-hub__card:nth-child(2)::after { background: #ef6632; }
  .cd-hub__card:nth-child(3)::after { background: #5ac96f; }
  .cd-hub__card:hover { transform: translateY(-6px); box-shadow: 0 28px 56px rgba(0,0,0,0.26); }
  .cd-hub__icon { width: 60px; height: 60px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; margin: 0 0 22px 0; box-shadow: 0 10px 22px rgba(28,51,112,0.24); }
  .cd-hub__card:nth-child(2) .cd-hub__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.28); }
  .cd-hub__card:nth-child(3) .cd-hub__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.28); }
  .cd-hub__icon .material-icons { font-size: 32px; }
  .cd-hub__card-eyebrow { font-family: 'Raleway', sans-serif; font-size: 0.74rem; font-weight: 800; letter-spacing: 0.14em; color: #6a778f; text-transform: uppercase; margin: 0 0 8px 0; }
  .cd-hub__card-title { font-family: 'Raleway', sans-serif; font-size: 1.35rem; font-weight: 800; color: #1c3370; line-height: 1.22; letter-spacing: -0.005em; margin: 0 0 12px 0; }
  .cd-hub__card-desc { font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0 0 22px 0; flex: 1; }
  .cd-hub__cta { display: inline-flex; align-items: center; gap: 8px; font-family: 'Raleway', sans-serif; font-size: 0.92rem; font-weight: 800; letter-spacing: 0.04em; color: #25418b; text-transform: uppercase; margin-top: auto; }
  .cd-hub__card:nth-child(2) .cd-hub__cta { color: #ef6632; }
  .cd-hub__card:nth-child(3) .cd-hub__cta { color: #3aa856; }
  .cd-hub__cta .material-icons { font-size: 18px; transition: transform .25s ease; }
  .cd-hub__card:hover .cd-hub__cta .material-icons { transform: translateX(4px); }
  @media (max-width: 980px) {
    .cd-hub__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-hub__title { font-size: 1.85rem; }
  }
  @media (max-width: 560px) {
    .cd-hub { padding: 64px 18px; }
    .cd-hub__card { padding: 30px 24px 26px 24px; }
  }
</style>
<section class="cd-hub">
  <div class="cd-hub__inner">
    <div class="cd-hub__header">
      <p class="cd-hub__eyebrow"><span class="material-icons">explore</span>{{eyebrow}}</p>
      <h2 class="cd-hub__title">{{title}}</h2>
      <div class="cd-hub__divider"></div>
      <p class="cd-hub__sub">{{sub}}</p>
    </div>
    <div class="cd-hub__grid" data-repeat="cards">
      <a class="cd-hub__card" href="{{cards.href}}">
        <div class="cd-hub__icon"><span class="material-icons">{{cards.icon}}</span></div>
        <p class="cd-hub__card-eyebrow">{{cards.eyebrow}}</p>
        <h3 class="cd-hub__card-title">{{cards.title}}</h3>
        <p class="cd-hub__card-desc">{{cards.desc}}</p>
        <span class="cd-hub__cta">{{cards.ctaText}}<span class="material-icons">arrow_forward</span></span>
      </a>
    </div>
  </div>
</section>
`.trim();

const DEFAULTS = {
  eyebrow: 'EXPLORE THE HUB',
  title: 'More from Cardiff beyond the press desk.',
  sub: 'Looking for something other than a press release? Dive into our long-form articles, get fast answers in the FAQ library, or read up on the team behind Cardiff Capital.',
  cards: [
    {
      icon: 'menu_book',
      eyebrow: 'LONG-FORM',
      title: 'Articles',
      desc: 'In-depth guides on small-business credit, cash-flow strategy, equipment financing, and growth-stage capital — written by the Cardiff team.',
      ctaText: 'Browse Articles',
      href: '/articles',
    },
    {
      icon: 'help_center',
      eyebrow: 'FAST ANSWERS',
      title: 'FAQs',
      desc: 'Quick answers to the most common questions we hear from applicants — rates, terms, documentation, eligibility, and the funding timeline.',
      ctaText: 'Open FAQ Library',
      href: '/faqs',
    },
    {
      icon: 'apartment',
      eyebrow: 'WHO WE ARE',
      title: 'Company Information',
      desc: 'Meet the leadership team, learn how Cardiff is licensed and regulated, and read about our partnerships and community commitments.',
      ctaText: 'Meet Cardiff',
      href: '/about',
    },
  ],
};

const hubBlock = {
  id: NEW_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 0, // re-numbered below
  html: HUB_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: DEFAULTS.eyebrow },
    { name: 'title', label: 'Headline', type: 'text', default: DEFAULTS.title },
    { name: 'sub', label: 'Subtitle', type: 'textarea', default: DEFAULTS.sub },
    {
      name: 'cards',
      label: 'Hub destination cards',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
        { name: 'ctaText', label: 'CTA text', type: 'text' },
        { name: 'href', label: 'Destination URL', type: 'text' },
      ],
    },
  ],
  values: { ...DEFAULTS },
};

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

  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === NEW_BLOCK_ID);
  const afterIdx = parsed.blocks.findIndex((b: any) => b?.id === INSERT_AFTER_ID);
  if (afterIdx === -1 && existingIdx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${INSERT_AFTER_ID}; aborting`);
    process.exit(1);
  }

  if (existingIdx !== -1) {
    const prev = parsed.blocks[existingIdx];
    parsed.blocks[existingIdx] = {
      ...hubBlock,
      order: prev.order ?? hubBlock.order,
      values: { ...hubBlock.values, ...(prev.values || {}) },
    };
    console.log(`Post ${POST_ID}: rewrote existing ${NEW_BLOCK_ID} block at idx ${existingIdx}.`);
  } else {
    parsed.blocks.splice(afterIdx + 1, 0, hubBlock);
    console.log(`Post ${POST_ID}: inserted ${NEW_BLOCK_ID} after ${INSERT_AFTER_ID} (at idx ${afterIdx + 1}).`);
  }

  parsed.blocks.forEach((b: any, i: number) => {
    b.order = i;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: newsroom iter 9 (resource hub) applied. Block count: ${parsed.blocks.length}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
