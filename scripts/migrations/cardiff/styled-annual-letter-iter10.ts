/**
 * Annual Letter iter 10 — Style the "Apply Once. Move Fast. Grow Confidently."
 * section (sec-7) on post 794. After iters 1-9, sec-7 is the last remaining
 * wall-of-text band on this page — bare H2 + orange divider + 3 stacked
 * paragraphs (the only other bare section, sec-3, is only 2 paras and reads
 * as an intro/setup for sec-4 which iter 9 already restyled).
 *
 * The existing headline ("Apply Once. Move Fast. Grow Confidently.") is
 * already a perfect 3-step framing, so iter 10 reuses the icon-card grid
 * pattern from styled-equipment-leasing-iter3.ts (and the iter 9 repeater
 * variant), but renders it as a 3-up "how it works" band with numbered
 * step chips alongside Material Icons and a closing reassurance line.
 *
 * Card content is synthesized strictly from claims already on this same
 * page (sec-7 + sec-4 + sec-1 stats) — no new promises.
 *
 * Idempotent: re-running rewrites sec-7.blocks wholesale; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 794;
const TARGET_BLOCK_ID = 'sec-7';

const STEPS_HTML = `
<style>
  .cd-al-steps { max-width: 1140px; margin: 0 auto; }
  .cd-al-steps__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-al-steps__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-al-steps__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 36px 28px 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-al-steps__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-al-steps__num { position: absolute; top: -14px; left: 28px; min-width: 32px; height: 32px; padding: 0 10px; border-radius: 16px; background: #1c3370; color: #fff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.875rem; letter-spacing: 0.04em; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 6px 14px rgba(28,51,112,0.25); }
  .cd-al-steps__card:nth-child(2) .cd-al-steps__num { background: #ef6632; box-shadow: 0 6px 14px rgba(239,102,50,0.3); }
  .cd-al-steps__card:nth-child(3) .cd-al-steps__num { background: #3aa856; box-shadow: 0 6px 14px rgba(58,168,86,0.3); }
  .cd-al-steps__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 6px 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-al-steps__card:nth-child(2) .cd-al-steps__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-al-steps__card:nth-child(3) .cd-al-steps__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-al-steps__icon .material-icons { font-size: 30px; }
  .cd-al-steps__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-al-steps__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-al-steps__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-al-steps__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-al-steps__grid { grid-template-columns: 1fr; gap: 28px; }
  }
  @media (max-width: 620px) {
    .cd-al-steps__card { padding: 30px 22px 26px 22px; }
    .cd-al-steps__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-al-steps">
  <p class="cd-al-steps__intro" data-field="intro">{{intro}}</p>
  <div class="cd-al-steps__grid">
    <div class="cd-al-steps__card" data-repeat="steps">
      <span class="cd-al-steps__num" data-field="num">{{steps.num}}</span>
      <div class="cd-al-steps__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <h3 class="cd-al-steps__card-title" data-field="title">{{steps.title}}</h3>
      <p class="cd-al-steps__card-desc" data-field="desc">{{steps.desc}}</p>
    </div>
  </div>
  <div class="cd-al-steps__closer">
    <p class="cd-al-steps__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const STEPS_DEFAULTS = {
  intro:
    'Your search for the best "financing for my business" stops here. Cardiff makes it easy to finance your business on your terms — apply once, move fast, and grow with confidence.',
  steps: [
    {
      num: 'STEP 01',
      icon: 'edit_note',
      title: 'Apply Once',
      desc: 'Our online application takes only a few minutes. Tell us about your business once and we’ll match you to the right financing — no rework, no repeated paperwork, no rigid bank-loan checklists.',
    },
    {
      num: 'STEP 02',
      icon: 'bolt',
      title: 'Move Fast',
      desc: 'Applicants typically receive a same-day decision, and approved deals can fund as quickly as the same day so you can act on opportunities the moment they appear instead of waiting weeks for an answer.',
    },
    {
      num: 'STEP 03',
      icon: 'trending_up',
      title: 'Grow Confidently',
      desc: 'Whether you’re renovating, expanding, or staying ahead of your next payroll cycle, Cardiff puts capital to work on your schedule — with repayment structures that flex with your revenue cycles.',
    },
  ],
  closer:
    'No guesswork. No unnecessary hoops. Just actionable capital when you need it.',
} as const;

const stepsBlock = {
  id: 'sec-7-steps',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: STEPS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: STEPS_DEFAULTS.intro },
    {
      name: 'steps',
      label: 'Apply / Move / Grow steps',
      type: 'repeater',
      itemFields: [
        { name: 'num', label: 'Step label (e.g. STEP 01)', type: 'text' },
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
      default: STEPS_DEFAULTS.steps,
    },
    { name: 'closer', label: 'Closing reassurance', type: 'textarea', default: STEPS_DEFAULTS.closer },
  ],
  values: { ...STEPS_DEFAULTS },
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
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

  // Widen so the 3-col card grid breathes; soft-blue band matches iter 9 sec-4.
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
    id: 'sec-7-title',
    order: 1,
    level: 2,
    content: 'Apply Once. Move Fast. Grow Confidently.',
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
    id: 'sec-7-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, stepsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-7 -> styled 3-step "Apply / Move / Grow" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
