/**
 * Iter 6: Restyle the "Equipment Leasing vs. Equipment Loans: What's the
 * Difference?" section on post 802 (equipment-leasing). This is sec-5 —
 * currently a centered H2 plus a flat stack of four paragraphs (intro,
 * lease description, loan description, Cardiff closer). The contrast is
 * the whole point of the section but visually there is no contrast at
 * all — both options collapse into one indistinguishable wall of copy.
 *
 * Cardiff.co's source page presents this as a head-to-head comparison.
 * We replace sec-5 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter2/3/4/5)
 *   2. A single html-render block carrying an intro line, a 2-up
 *      comparison grid (Lease vs Loan) driven by `data-repeat="options"`,
 *      and a Cardiff closer band.
 *
 * Layout: two side-by-side cards, each with circular icon chip, label,
 * tagline, body, and a bulleted "best for" list. Brand palette only —
 * #1c3370 / #25418b deep blue, #5ac96f green, #ef6632 orange, #ffb798
 * peach accent — no emojis. Lease card uses blue gradient, Loan card
 * uses orange gradient via nth-child to drive visual contrast.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-5-compare` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-5';

const COMPARE_HTML = `
<style>
  .cd-eq-cmp { max-width: 1140px; margin: 0 auto; }
  .cd-eq-cmp__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-eq-cmp__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 28px; }
  .cd-eq-cmp__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 36px 32px 32px 32px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; overflow: hidden; }
  .cd-eq-cmp__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-eq-cmp__card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #25418b 0%, #1c3370 100%); }
  .cd-eq-cmp__card:nth-child(2n)::before { background: linear-gradient(90deg, #ef6632 0%, #d8501e 100%); }
  .cd-eq-cmp__icon { width: 60px; height: 60px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.24); }
  .cd-eq-cmp__card:nth-child(2n) .cd-eq-cmp__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.28); }
  .cd-eq-cmp__icon .material-icons { font-size: 32px; }
  .cd-eq-cmp__label { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #25418b; margin: 0 0 6px 0; }
  .cd-eq-cmp__card:nth-child(2n) .cd-eq-cmp__label { color: #ef6632; }
  .cd-eq-cmp__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.5rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.01em; line-height: 1.2; }
  .cd-eq-cmp__tagline { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.5; color: #525f7f; margin: 0 0 18px 0; font-style: italic; }
  .cd-eq-cmp__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0 0 22px 0; }
  .cd-eq-cmp__bestfor-label { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #1c3370; margin: 0 0 12px 0; padding-top: 18px; border-top: 1px solid #e6ecf5; }
  .cd-eq-cmp__bestfor { list-style: none; padding: 0; margin: 0; }
  .cd-eq-cmp__bestfor li { position: relative; padding: 0 0 10px 26px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.55; color: #525f7f; }
  .cd-eq-cmp__bestfor li::before { content: 'check_circle'; font-family: 'Material Icons'; position: absolute; left: 0; top: 1px; color: #5ac96f; font-size: 18px; }
  .cd-eq-cmp__closer { margin: 48px auto 0 auto; max-width: 860px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-eq-cmp__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 820px) {
    .cd-eq-cmp__grid { grid-template-columns: 1fr; gap: 20px; }
    .cd-eq-cmp__card { padding: 30px 24px 26px 24px; }
    .cd-eq-cmp__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-eq-cmp">
  <p class="cd-eq-cmp__intro" data-field="intro">{{intro}}</p>
  <div class="cd-eq-cmp__grid">
    <div class="cd-eq-cmp__card" data-repeat="options">
      <div class="cd-eq-cmp__icon"><span class="material-icons">{{options.icon}}</span></div>
      <p class="cd-eq-cmp__label">{{options.label}}</p>
      <h3 class="cd-eq-cmp__name">{{options.name}}</h3>
      <p class="cd-eq-cmp__tagline">{{options.tagline}}</p>
      <p class="cd-eq-cmp__desc">{{options.desc}}</p>
      <p class="cd-eq-cmp__bestfor-label">{{options.bestForLabel}}</p>
      <ul class="cd-eq-cmp__bestfor">
        <li>{{options.bestFor1}}</li>
        <li>{{options.bestFor2}}</li>
        <li>{{options.bestFor3}}</li>
      </ul>
    </div>
  </div>
  <div class="cd-eq-cmp__closer">
    <p class="cd-eq-cmp__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const COMPARE_DEFAULTS = {
  intro: "You can acquire equipment for your business using a loan or a lease. Which one should you choose? It depends. Understanding the difference helps you decide which path will support your current growth strategy.",
  options: [
    {
      icon: 'autorenew',
      label: 'Option A',
      name: 'Equipment Leasing',
      tagline: 'Access the tools you need without owning them outright.',
      desc: 'You make regular, predictable payments for the lease term. You do not own the equipment during the lease, but you may have the option to purchase it at the end.',
      bestForLabel: 'Best for',
      bestFor1: 'Rapidly evolving industries where equipment may become outdated',
      bestFor2: 'Avoiding long-term ownership obligations',
      bestFor3: 'Keeping upfront investment low and cash flow flexible',
    },
    {
      icon: 'account_balance',
      label: 'Option B',
      name: 'Equipment Loans',
      tagline: 'Buy and own your equipment from day one.',
      desc: 'You make monthly payments for the term of the loan, but you own the equipment from day one. The loan is a good fit when the equipment has a long useful life or you want to build equity.',
      bestForLabel: 'Best for',
      bestFor1: 'Equipment with a long useful life',
      bestFor2: 'Building business equity in physical assets',
      bestFor3: 'Predictable monthly payments toward full ownership',
    },
  ],
  closer: 'With Cardiff, you can choose either structure, or a blend of the two, to match your operational needs and cash flow.',
} as const;

const compareBlock = {
  id: 'sec-5-compare',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: COMPARE_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: COMPARE_DEFAULTS.intro },
    {
      name: 'options',
      label: 'Comparison options',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'label', label: 'Eyebrow label', type: 'text' },
        { name: 'name', label: 'Option name', type: 'text' },
        { name: 'tagline', label: 'Tagline', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
        { name: 'bestForLabel', label: '"Best for" label', type: 'text' },
        { name: 'bestFor1', label: 'Best-for bullet 1', type: 'text' },
        { name: 'bestFor2', label: 'Best-for bullet 2', type: 'text' },
        { name: 'bestFor3', label: 'Best-for bullet 3', type: 'text' },
      ],
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: COMPARE_DEFAULTS.closer },
  ],
  values: { ...COMPARE_DEFAULTS, options: COMPARE_DEFAULTS.options.map((o) => ({ ...o })) },
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

  const idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  // Widen so the 2-up comparison grid breathes.
  sec.maxWidth = '1200px';
  // Soft blue-tinted background to set this band apart from neighbors.
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-5-title',
    order: 1,
    level: 2,
    content: 'Equipment Leasing vs. Equipment Loans: What’s the Difference?',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '0 auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-5-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, compareBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-5 -> styled 2-up "Lease vs Loan" comparison grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
