/**
 * Iter 13 — post 829 (SBA Loans). Iters 1-12 have styled every band, but
 * the single most distinctive section on cardiff.co/sba-loans/ is still
 * missing in shape: the "Our Process" 5-step VERTICAL timeline.
 *
 * Original (https://cardiff.co/sba-loans/) "Our Process" renders as a
 * vertical stack of five numbered cards (01 Apply Online → 02 Get
 * Approved → 03 Withdraw Funds → 04 Repayment → 05 Renew Your Funding),
 * each with a large left-rail number badge and short copy on the right.
 * Iter10 added an "How to Apply for an SBA Loan" band, but it is only
 * 3 horizontal cards (Apply / Same-Day Decision / Receive Funds) — it
 * collapses the original's 5-step funnel lifecycle (which crucially
 * includes Repayment + Renew Your Funding, the two steps that
 * differentiate Cardiff from a one-shot lender) into a 3-card
 * acquisition flow.
 *
 * This iter rewrites the `sec-5-apply` section's html-render child to a
 * 5-step VERTICAL timeline that matches the original's lifecycle copy,
 * with a vertical brand-orange rail connecting big numeric badges
 * (CSS-counter "01"-"05") down the left side, and step title + body
 * stacked on the right — same pattern family as
 * `restyle-home-process.ts` (CSS counter + decimal-leading-zero) but
 * rotated 90° to a vertical layout, which is the original's hallmark.
 *
 * Section heading is also updated to "Our Process" to mirror the
 * cardiff.co label exactly; section background stays #f6f9fc so the
 * band still alternates against neighbors.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), orange (#ef6632),
 * green CTA (#5ac96f). Raleway display, Open Sans body. Material Icons
 * only, no emojis. Editors edit one `steps` array.
 *
 * Idempotent: rewrites sec-5-apply's child blocks in place; safe to
 * re-run. Does not splice (section already exists from iter10).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 829;
const TARGET_BLOCK_ID = 'sec-5-apply';
const APPLY_CHILD_ID = `${TARGET_BLOCK_ID}-html`;

const PROCESS_HTML = `
<style>
  .cd-sba-proc { max-width: 900px; margin: 0 auto; counter-reset: cd-sba-step; }
  .cd-sba-proc__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 720px; margin: 0 auto 56px auto; }
  .cd-sba-proc__list { position: relative; display: flex; flex-direction: column; gap: 28px; padding-left: 8px; }
  .cd-sba-proc__list::before { content: ''; position: absolute; top: 52px; bottom: 52px; left: 56px; width: 3px; background: linear-gradient(to bottom, #ef6632 0%, #ffb798 100%); border-radius: 2px; z-index: 0; }
  .cd-sba-proc__row { position: relative; z-index: 1; display: grid; grid-template-columns: 116px 1fr; gap: 28px; align-items: stretch; }
  .cd-sba-proc__num-wrap { display: flex; justify-content: center; align-items: flex-start; padding-top: 4px; }
  .cd-sba-proc__num { counter-increment: cd-sba-step; width: 104px; height: 104px; border-radius: 50%; background: #ffffff; border: 3px solid #ef6632; display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 28px rgba(239,102,50,0.22); font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.4rem; font-weight: 800; color: #1c3370; letter-spacing: -0.02em; line-height: 1; }
  .cd-sba-proc__num::before { content: counter(cd-sba-step, decimal-leading-zero); }
  .cd-sba-proc__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 28px 32px; box-shadow: 0 10px 28px rgba(28,51,112,0.06); display: flex; flex-direction: column; justify-content: center; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-sba-proc__card:hover { transform: translateX(4px); box-shadow: 0 16px 38px rgba(28,51,112,0.1); }
  .cd-sba-proc__icon-row { display: flex; align-items: center; gap: 12px; margin: 0 0 10px 0; }
  .cd-sba-proc__icon-chip { width: 36px; height: 36px; border-radius: 10px; background: rgba(239,102,50,0.10); display: flex; align-items: center; justify-content: center; }
  .cd-sba-proc__icon-chip .material-icons { color: #ef6632; font-size: 22px; }
  .cd-sba-proc__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.35rem; font-weight: 800; color: #1c3370; margin: 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-sba-proc__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9875rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-sba-proc__cta-wrap { text-align: center; margin: 48px 0 0 0; }
  .cd-sba-proc__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 17px 38px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-sba-proc__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 44px rgba(90,201,111,0.55); }
  @media (max-width: 720px) {
    .cd-sba-proc__list::before { left: 36px; }
    .cd-sba-proc__row { grid-template-columns: 80px 1fr; gap: 18px; }
    .cd-sba-proc__num { width: 72px; height: 72px; font-size: 1.65rem; border-width: 2px; }
    .cd-sba-proc__card { padding: 22px 22px; }
    .cd-sba-proc__title { font-size: 1.15rem; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<div class="cd-sba-proc">
  <p class="cd-sba-proc__intro" data-field="intro">{{intro}}</p>
  <div class="cd-sba-proc__list">
    <div class="cd-sba-proc__row" data-repeat="steps">
      <div class="cd-sba-proc__num-wrap"><div class="cd-sba-proc__num"></div></div>
      <div class="cd-sba-proc__card">
        <div class="cd-sba-proc__icon-row">
          <div class="cd-sba-proc__icon-chip"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
          <h3 class="cd-sba-proc__title" data-field="title">{{steps.title}}</h3>
        </div>
        <p class="cd-sba-proc__desc" data-field="desc">{{steps.desc}}</p>
      </div>
    </div>
  </div>
  <div class="cd-sba-proc__cta-wrap">
    <a class="cd-sba-proc__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
  </div>
</div>
`.trim();

const PROCESS_STEPS = [
  {
    icon: 'edit_note',
    title: 'Apply Online',
    desc: 'Tell us a little about your business and get approved in less than 2 minutes — no hard credit check and no paperwork to dig up.',
  },
  {
    icon: 'task_alt',
    title: 'Get Approved',
    desc: 'Choose the SBA loan terms that work best for your budget and get on with your day — most applicants see a same-day decision.',
  },
  {
    icon: 'account_balance',
    title: 'Withdraw Funds',
    desc: 'Link your business checking account to your Cardiff financing and access your funds immediately, with no hidden transfer fees.',
  },
  {
    icon: 'autorenew',
    title: 'Repayment',
    desc: 'Payments are remitted automatically through ACH withdrawal on a daily, weekly, or monthly cadence that fits your cash flow.',
  },
  {
    icon: 'rocket_launch',
    title: 'Renew Your Funding',
    desc: 'Pay off your balance early and gain access to more capital at better terms — a true funding partner, not a one-shot lender.',
  },
];

const PROCESS_DEFAULTS = {
  intro:
    'From application to repayment to renewal, here is exactly what your SBA loan journey with Cardiff looks like — five clear steps designed to keep capital working for your business.',
  ctaText: 'Start Your Application',
  ctaUrl: 'https://cardiff.co/business/apply',
  steps: PROCESS_STEPS,
} as const;

const PROCESS_FIELDS = [
  { name: 'intro', label: 'Intro paragraph', type: 'textarea' as const },
  { name: 'ctaText', label: 'CTA label', type: 'text' as const },
  { name: 'ctaUrl', label: 'CTA url', type: 'text' as const },
  {
    name: 'steps',
    label: 'Process steps',
    type: 'array' as const,
    itemFields: [
      { name: 'icon', label: 'Material Icons name', type: 'text' as const },
      { name: 'title', label: 'Step title', type: 'text' as const },
      { name: 'desc', label: 'Step description', type: 'textarea' as const },
    ],
  },
];

const processBlock = {
  id: APPLY_CHILD_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: PROCESS_HTML,
  fields: PROCESS_FIELDS,
  values: { ...PROCESS_DEFAULTS },
};

const headerBlock = {
  id: `${TARGET_BLOCK_ID}-title`,
  type: 'heading' as const,
  order: 1,
  level: 2 as const,
  content: 'Our Process',
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
  id: `${TARGET_BLOCK_ID}-div`,
  type: 'text' as const,
  order: 2,
  content:
    '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
  style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
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
    console.error(
      `Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; run iter10 first to splice the section.`,
    );
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

  // Preserve any editor-customised steps if they look reasonable (>=5 items
  // with title/desc populated); otherwise reset to the canonical 5-step
  // lifecycle so re-runs converge. Also preserve a custom intro / cta if
  // someone tweaked them.
  const existingHtmlChild = Array.isArray(sec.blocks)
    ? sec.blocks.find((b: any) => b?.id === APPLY_CHILD_ID)
    : null;
  const existingSteps =
    existingHtmlChild &&
    Array.isArray(existingHtmlChild.values?.steps) &&
    existingHtmlChild.values.steps.length >= 5 &&
    existingHtmlChild.values.steps
      .slice(0, 5)
      .every((s: any) => s && typeof s.title === 'string' && s.title.trim())
      ? existingHtmlChild.values.steps.slice(0, 5).map((s: any, i: number) => ({
          icon: s.icon || PROCESS_STEPS[i].icon,
          title: s.title || PROCESS_STEPS[i].title,
          desc: s.desc || s.description || PROCESS_STEPS[i].desc,
        }))
      : PROCESS_STEPS;
  const existingIntro =
    typeof existingHtmlChild?.values?.intro === 'string' && existingHtmlChild.values.intro.trim()
      ? existingHtmlChild.values.intro
      : PROCESS_DEFAULTS.intro;
  const existingCtaText =
    typeof existingHtmlChild?.values?.ctaText === 'string' && existingHtmlChild.values.ctaText.trim()
      ? existingHtmlChild.values.ctaText
      : PROCESS_DEFAULTS.ctaText;
  const existingCtaUrl =
    typeof existingHtmlChild?.values?.ctaUrl === 'string' && existingHtmlChild.values.ctaUrl.trim()
      ? existingHtmlChild.values.ctaUrl
      : PROCESS_DEFAULTS.ctaUrl;

  const populatedProcessBlock = {
    ...processBlock,
    values: {
      intro: existingIntro,
      ctaText: existingCtaText,
      ctaUrl: existingCtaUrl,
      steps: existingSteps,
    },
  };

  sec.width = 'full';
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };
  sec.blocks = [headerBlock, dividerBlock, populatedProcessBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: ${TARGET_BLOCK_ID} -> "Our Process" 5-step vertical numbered timeline (matches cardiff.co/sba-loans/).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
