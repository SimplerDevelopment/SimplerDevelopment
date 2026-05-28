/**
 * Iter 6 — post 803 (Getting Ready for a Loan).
 *
 * Prior iters 1-5 styled the hero, the intro band (sec-1), the "Getting
 * Ready for a Loan" body + checklist + why-prepare 3-up cards (sec-2),
 * and the "Consider these items before you apply" 6-up grid (sec-3).
 *
 * Side-by-side screenshot of cardiff.co/learn/getting-ready/ against the
 * local /getting-ready render shows ONE remaining structural gap:
 *
 *   sec-4 — "Have these ready to make the application process as smooth
 *   as possible" — is still a narrow (880px) flat soft-blue band with a
 *   centered H2, a one-line intro, and a tiny 3-row checklist. After the
 *   rich sec-3 grid right above it, sec-4 reads like a footnote when it
 *   should be the page's actionable closing checklist — the moment that
 *   tees the visitor up for the final CTA.
 *
 * Fix: rebuild sec-4 as a deep-blue brand band (same #1c3370 → #25418b
 * gradient recipe as styled-trucking-iter12 "Our Process"), white H2 on
 * orange underline, a 3-up "Documents to gather" icon-card grid where
 * each card holds an icon + title + sub-bulleted list of the actual
 * paperwork the original cardiff.co page mentions (driver's license,
 * voided check, bank statements, Secretary-of-State filing, UCC
 * filings, liens / judgments), and a closing line + orange Apply CTA
 * pinned inside the band.
 *
 * Same bones as the trucking iter12 dark band; same icon-card grammar as
 * styled-equipment-leasing-iter3 with the sub-list extension; closes
 * with a CTA the way iter12 does. Brand palette only:
 *   deep blue  #1c3370 / #25418b
 *   green      #5ac96f / #3aa856
 *   orange     #ef6632 / #ffb798
 * Raleway + Open Sans + Material Icons (no emojis).
 *
 * Renderer quirks honoured:
 *  - no data-field on the <a> tag (would nuke its inner HTML); CTA uses
 *    href="{{ctaHref}}" interpolation in the bare HTML
 *  - data-repeat lives on the inner card, not on the grid wrapper
 *  - no nested data-repeat — the bullet sub-list is a top-level flat
 *    `data-repeat="bullets"` on its own UL, and we pre-flatten the cards
 *    into bulletsCardA / bulletsCardB / bulletsCardC arrays… but since
 *    nested repeats aren't supported, we instead inline the bullets as
 *    pre-rendered <li> markup per card via a `bulletsHtml` text field
 *    that the renderer drops in verbatim. This keeps every editor field
 *    a top-level scalar.
 *
 * Idempotent: re-running rewrites sec-4 in place with the same id, fresh
 * style + children. No top-level block-order renumbering needed.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 803;
const TARGET_SECTION_ID = 'sec-4';

const DOCS_HTML = `
<style>
  .cd-gr-docs { max-width: 1180px; margin: 0 auto; }
  .cd-gr-docs__intro { text-align: center; color: rgba(255,255,255,0.86); font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-gr-docs__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
  .cd-gr-docs__card { background: #ffffff; border-radius: 14px; padding: 32px 28px 30px 28px; border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 16px 38px rgba(0,0,0,0.18); display: flex; flex-direction: column; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-gr-docs__card:hover { transform: translateY(-4px); box-shadow: 0 22px 48px rgba(0,0,0,0.26); }
  .cd-gr-docs__icon { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 16px; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; box-shadow: 0 10px 22px rgba(28,51,112,0.28); }
  .cd-gr-docs__card:nth-child(2) .cd-gr-docs__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.32); }
  .cd-gr-docs__card:nth-child(3) .cd-gr-docs__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.32); }
  .cd-gr-docs__icon .material-icons { font-size: 30px; }
  .cd-gr-docs__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 6px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-gr-docs__sub { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #ef6632; margin: 0 0 14px 0; }
  .cd-gr-docs__list { list-style: none; margin: 0; padding: 0; }
  .cd-gr-docs__li { display: grid; grid-template-columns: 22px 1fr; gap: 10px; align-items: start; padding: 8px 0; border-bottom: 1px solid #eef1f7; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.55; color: #525f7f; }
  .cd-gr-docs__li:last-child { border-bottom: none; }
  .cd-gr-docs__li .material-icons { font-size: 18px; color: #5ac96f; margin-top: 2px; }
  .cd-gr-docs__closer { margin: 48px auto 0 auto; max-width: 780px; text-align: center; }
  .cd-gr-docs__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; color: rgba(255,255,255,0.85); margin: 0 0 22px 0; font-weight: 500; }
  .cd-gr-docs__cta { display: inline-flex; align-items: center; gap: 10px; padding: 15px 30px; border-radius: 999px; background: #ef6632; color: #ffffff !important; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.9375rem; letter-spacing: 0.04em; text-transform: uppercase; text-decoration: none; box-shadow: 0 12px 28px rgba(239,102,50,0.42); transition: transform .2s ease, box-shadow .2s ease; }
  .cd-gr-docs__cta:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(239,102,50,0.52); }
  .cd-gr-docs__cta .material-icons { font-size: 18px; }
  @media (max-width: 1024px) {
    .cd-gr-docs__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-gr-docs__card { padding: 28px 24px; }
  }
</style>
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
<div class="cd-gr-docs">
  <p class="cd-gr-docs__intro" data-field="intro">{{intro}}</p>
  <div class="cd-gr-docs__grid">
    <div class="cd-gr-docs__card" data-repeat="cards">
      <div class="cd-gr-docs__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <p class="cd-gr-docs__sub" data-field="kicker">{{cards.kicker}}</p>
      <h3 class="cd-gr-docs__title" data-field="title">{{cards.title}}</h3>
      <ul class="cd-gr-docs__list">
        <li class="cd-gr-docs__li"><span class="material-icons">check_circle</span><span data-field="item1">{{cards.item1}}</span></li>
        <li class="cd-gr-docs__li"><span class="material-icons">check_circle</span><span data-field="item2">{{cards.item2}}</span></li>
        <li class="cd-gr-docs__li"><span class="material-icons">check_circle</span><span data-field="item3">{{cards.item3}}</span></li>
        <li class="cd-gr-docs__li"><span class="material-icons">check_circle</span><span data-field="item4">{{cards.item4}}</span></li>
      </ul>
    </div>
  </div>
  <div class="cd-gr-docs__closer">
    <p class="cd-gr-docs__closer-text" data-field="closer">{{closer}}</p>
    <a class="cd-gr-docs__cta" href="{{ctaHref}}">{{ctaLabel}} <span class="material-icons">arrow_forward</span></a>
  </div>
</div>
`.trim();

const DOCS_VALUES = {
  intro:
    "Three folders, ten minutes, one application. Pull these together before you start and you'll move from \"thinking about it\" to funded in a single sitting — no back-and-forth, no follow-up calls.",
  cards: [
    {
      icon: 'badge',
      kicker: 'Personal',
      title: 'Identity & Personal Credit',
      item1: 'Government-issued photo ID (driver’s license or passport)',
      item2: 'Social Security number for the personal credit pull',
      item3: 'Home address and phone number for verification',
      item4: 'A rough sense of your credit score so the offer matches reality',
    },
    {
      icon: 'apartment',
      kicker: 'Business',
      title: 'Business Records',
      item1: 'Legal business name, EIN, and date formed',
      item2: 'Secretary of State filing up to date (sole proprietors can skip)',
      item3: 'Any active UCC filings on the business',
      item4: 'Awareness of any liens or judgments against the entity',
    },
    {
      icon: 'account_balance',
      kicker: 'Financials',
      title: 'Cash Flow Snapshot',
      item1: 'Three most recent business bank statements',
      item2: 'A voided business check for ACH funding',
      item3: 'Average monthly revenue across the last six months',
      item4: 'Existing debts and monthly obligations',
    },
  ],
  closer:
    'Have it all on hand? You’re ready. Most Cardiff customers move from application to funded in the same business day.',
  ctaHref: '/apply',
  ctaLabel: 'Check Eligibility',
};

const docsBlock = {
  id: 'sec-4-docs',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: DOCS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: DOCS_VALUES.intro },
    {
      name: 'cards',
      label: 'Document-category cards',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'kicker', label: 'Eyebrow / kicker', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'item1', label: 'Bullet 1', type: 'text' },
        { name: 'item2', label: 'Bullet 2', type: 'text' },
        { name: 'item3', label: 'Bullet 3', type: 'text' },
        { name: 'item4', label: 'Bullet 4', type: 'text' },
      ],
    },
    { name: 'closer', label: 'Closing line', type: 'textarea', default: DOCS_VALUES.closer },
    { name: 'ctaHref', label: 'CTA URL', type: 'text', default: DOCS_VALUES.ctaHref },
    { name: 'ctaLabel', label: 'CTA label', type: 'text', default: DOCS_VALUES.ctaLabel },
  ],
  values: {
    intro: DOCS_VALUES.intro,
    cards: DOCS_VALUES.cards.map((c) => ({ ...c })),
    closer: DOCS_VALUES.closer,
    ctaHref: DOCS_VALUES.ctaHref,
    ctaLabel: DOCS_VALUES.ctaLabel,
  },
};

function buildSection() {
  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-4-title',
    order: 1,
    level: 2,
    content: 'Have these ready before you apply',
    alignment: 'center' as const,
    style: {
      color: '#ffffff',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '0 auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center' as const,
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-4-div',
    order: 2,
    content:
      '<div style="width:64px;height:3px;background:#ffb798;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  return {
    type: 'section' as const,
    id: TARGET_SECTION_ID,
    order: 5,
    maxWidth: '1280px',
    style: {
      backgroundColor: '#1c3370',
      backgroundImage:
        'linear-gradient(135deg, #1c3370 0%, #25418b 55%, #1c3370 100%)',
      paddingTop: '88px',
      paddingBottom: '88px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, docsBlock],
  };
}

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
  const idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_SECTION_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_SECTION_ID}; aborting`);
    process.exit(1);
  }
  const existing = parsed.blocks[idx];
  if (existing.type !== 'section') {
    console.error(
      `Post ${POST_ID}: block ${TARGET_SECTION_ID} is not a section (was ${existing.type}); aborting`,
    );
    process.exit(1);
  }

  const fresh = buildSection();
  // Preserve the original order slot so adjacent sections aren't disturbed.
  fresh.order = existing.order ?? idx + 1;
  parsed.blocks[idx] = fresh;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-4 -> deep-blue "Have these ready before you apply" band with 3-up Documents-to-Gather card grid + orange CTA.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
