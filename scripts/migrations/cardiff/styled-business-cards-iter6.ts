/**
 * Iter 6: Restyle the "How to Apply for a Cardiff Business Credit Card"
 * section on post 797 (business-cards). This is sec-6 — currently a heading
 * + orange divider + intro paragraph + a basic 3-up card-grid (with a
 * broken first step where "Fill" was split off from the rest of the copy)
 * + trailing closing paragraph. No visual treatment of the "process" idea.
 *
 * Cardiff.co's source page reads as an ordered 3-step process. The port
 * loses the numbering, the step-flow rhythm, and the connector cues.
 *
 * We replace sec-6's children with:
 *   1. Centered H2 + orange underline (same pattern as iter3 / iter4)
 *   2. Intro paragraph (the original lead-in copy)
 *   3. A single html-render block carrying a numbered 3-step process flow
 *      driven by data-repeat="steps" — each step is a card with a big
 *      brand-blue numbered chip, a Material Icons glyph, title, and copy.
 *      Connector arrows between cards on desktop reinforce the sequence.
 *   4. Closing reassurance paragraph in a soft brand-tinted callout.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632), peach (#ffb798) accents — no emojis. Raleway titles,
 * Open Sans body.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-6-process` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 797;
const TARGET_BLOCK_ID = 'sec-6';

const PROCESS_HTML = `
<style>
  .cd-bc-proc { max-width: 1140px; margin: 0 auto; }
  .cd-bc-proc__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; position: relative; }
  .cd-bc-proc__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 40px 28px 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; align-items: flex-start; counter-increment: cd-bc-step; }
  .cd-bc-proc__grid { counter-reset: cd-bc-step; }
  .cd-bc-proc__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bc-proc__num { position: absolute; top: -22px; left: 28px; width: 52px; height: 52px; border-radius: 14px; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 22px rgba(28,51,112,0.28); }
  .cd-bc-proc__num::before { content: counter(cd-bc-step); }
  .cd-bc-proc__card:nth-child(2) .cd-bc-proc__num { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.32); }
  .cd-bc-proc__card:nth-child(3) .cd-bc-proc__num { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.32); }
  .cd-bc-proc__icon { margin: 6px 0 16px 0; width: 44px; height: 44px; border-radius: 12px; background: rgba(28,51,112,0.06); color: #1c3370; display: flex; align-items: center; justify-content: center; }
  .cd-bc-proc__card:nth-child(2) .cd-bc-proc__icon { background: rgba(239,102,50,0.10); color: #ef6632; }
  .cd-bc-proc__card:nth-child(3) .cd-bc-proc__icon { background: rgba(58,168,86,0.12); color: #3aa856; }
  .cd-bc-proc__icon .material-icons { font-size: 26px; }
  .cd-bc-proc__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-bc-proc__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-bc-proc__card:not(:last-child)::after { content: ''; position: absolute; top: 50%; right: -22px; width: 24px; height: 2px; background: linear-gradient(90deg, #ffb798 0%, #ef6632 100%); transform: translateY(-50%); z-index: 1; }
  .cd-bc-proc__card:not(:last-child)::before { content: ''; position: absolute; top: 50%; right: -28px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 8px solid #ef6632; transform: translateY(-50%); z-index: 2; }
  .cd-bc-proc__closer { margin: 56px auto 0 auto; max-width: 820px; text-align: center; padding: 24px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-bc-proc__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-bc-proc__grid { grid-template-columns: 1fr; gap: 36px; }
    .cd-bc-proc__card:not(:last-child)::after,
    .cd-bc-proc__card:not(:last-child)::before { display: none; }
  }
  @media (max-width: 620px) {
    .cd-bc-proc__card { padding: 36px 22px 26px 22px; }
    .cd-bc-proc__closer { padding: 20px 18px; }
  }
</style>
<div class="cd-bc-proc">
  <div class="cd-bc-proc__grid">
    <article class="cd-bc-proc__card" data-repeat="steps">
      <div class="cd-bc-proc__num"></div>
      <div class="cd-bc-proc__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <h3 class="cd-bc-proc__title" data-field="title">{{steps.title}}</h3>
      <p class="cd-bc-proc__desc" data-field="desc">{{steps.desc}}</p>
    </article>
  </div>
  <div class="cd-bc-proc__closer">
    <p class="cd-bc-proc__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const PROCESS_DEFAULTS = {
  steps: [
    {
      icon: 'edit_note',
      title: 'Fill Out Our Short Online Application',
      desc: 'The application asks you to provide basic business and financial information we need to evaluate your business.',
    },
    {
      icon: 'trending_up',
      title: 'Get Reviewed Based on Actual Revenue',
      desc: 'We assess your application using modern lending criteria, including monthly revenue. You can still qualify with limited credit history or a lower credit score.',
    },
    {
      icon: 'credit_card',
      title: 'Access Your Card and Credit Line',
      desc: 'Once approved, you can use your card for purchases or cash advances as needed.',
    },
  ],
  closer:
    'You can still qualify for a Cardiff credit card without providing collateral or having a high personal credit score.',
} as const;

const processBlock = {
  id: 'sec-6-process',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: PROCESS_HTML,
  fields: [
    {
      name: 'steps',
      label: 'Application steps',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'edit_note' },
        { name: 'title', label: 'Step title', type: 'text' as const },
        { name: 'desc', label: 'Step description', type: 'textarea' as const },
      ],
    },
    { name: 'closer', label: 'Reassurance line', type: 'textarea' as const, default: PROCESS_DEFAULTS.closer },
  ],
  values: {
    steps: PROCESS_DEFAULTS.steps.map((s) => ({ ...s })),
    closer: PROCESS_DEFAULTS.closer,
  },
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

  // Widen so the 3-col process flow breathes; soft blue-tinted background
  // to differentiate this "how-to" band from the neighboring white sections.
  sec.maxWidth = '1200px';
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
    id: 'sec-6-title',
    order: 1,
    level: 2,
    content: 'How to Apply for a Cardiff Business Credit Card',
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
    id: 'sec-6-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 28px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  const introBlock = {
    type: 'text' as const,
    id: 'sec-6-intro',
    order: 3,
    content:
      'Applying for a cash advance business credit card from Cardiff is simple. Here’s how the process works:',
    style: {
      color: '#525f7f',
      fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '1.0625rem',
      lineHeight: '1.75',
      maxWidth: '760px',
      margin: '0 auto 56px auto',
      textAlign: 'center' as const,
    },
  };

  sec.blocks = [headerBlock, dividerBlock, introBlock, processBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-6 -> styled numbered 3-step process flow (data-repeat="steps").`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
