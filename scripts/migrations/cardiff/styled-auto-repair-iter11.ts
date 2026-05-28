/**
 * Iter 11 — Auto Repair page (post 805).
 *
 * Remaining unstyled gap (last on the page): sec-9 "Take the Next Step
 * Toward Auto Shop Financing". Today it's a centered heading + 48px orange
 * divider + a single bare paragraph, all crammed at 880px wide and on a
 * plain #ffffff band. Every other section on this page now uses the
 * polished 1200px icon-card / process-band recipe — sec-9 reads like a
 * leftover footnote and is the only thing between the rich sec-8 content
 * and the final `cta` block, so it kills the closing momentum.
 *
 * Fix:
 *   1. Widen sec-9 to maxWidth 1240px and switch the band to the brand
 *      deep-blue gradient (matches the trucking iter12 process-band
 *      treatment) so the closer feels like a deliberate "we're wrapping
 *      this up" moment instead of a hanging paragraph.
 *   2. Replace sec-9.blocks with a single html-render "next-step" block:
 *      a 2-col layout — left column carries the H2 + orange divider +
 *      supporting paragraph, right column is a white card with three
 *      trust signals (5-min advisor call, same-day funding for qualified
 *      shops, Plaid-secured application) and primary + secondary CTAs
 *      (Apply -> /apply, View Plans -> #plans). Both CTAs use brand
 *      colors; primary is orange, secondary is outlined deep-blue.
 *
 * Idempotent: re-running overwrites sec-9.blocks wholesale and re-applies
 * the widened section style. The 2-col layout collapses to 1-col below
 * 980px so the right-side card stacks under the copy on mobile.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const TARGET_BLOCK_ID = 'sec-9';
const RENDER_BLOCK_ID = 'sec-9-next-step';

const NEXT_STEP_HTML = `
<style>
  .cd-ar-next { max-width: 1180px; margin: 0 auto; }
  .cd-ar-next__grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 56px; align-items: center; }
  .cd-ar-next__copy { color: #ffffff; }
  .cd-ar-next__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #ffb798; margin: 0 0 14px 0; }
  .cd-ar-next__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.5rem; font-weight: 800; letter-spacing: -0.015em; line-height: 1.12; color: #ffffff; margin: 0 0 18px 0; }
  .cd-ar-next__divider { width: 56px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 0 24px 0; }
  .cd-ar-next__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; color: rgba(255,255,255,0.88); margin: 0 0 28px 0; max-width: 560px; }
  .cd-ar-next__chips { display: flex; flex-wrap: wrap; gap: 10px; }
  .cd-ar-next__chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 600; color: #ffffff; letter-spacing: 0.01em; }
  .cd-ar-next__chip .material-icons { font-size: 16px; color: #5ac96f; }
  .cd-ar-next__card { background: #ffffff; border-radius: 18px; padding: 36px 32px; box-shadow: 0 24px 56px rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.06); }
  .cd-ar-next__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.375rem; font-weight: 800; color: #1c3370; margin: 0 0 6px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-ar-next__card-sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.6; color: #525f7f; margin: 0 0 22px 0; }
  .cd-ar-next__signals { list-style: none; margin: 0 0 26px 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
  .cd-ar-next__signal { display: flex; align-items: flex-start; gap: 12px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.5; color: #1c3370; font-weight: 600; }
  .cd-ar-next__signal .material-icons { font-size: 20px; color: #3aa856; flex-shrink: 0; margin-top: 1px; }
  .cd-ar-next__signal-sub { display: block; font-size: 0.8125rem; line-height: 1.5; color: #525f7f; font-weight: 400; margin-top: 2px; }
  .cd-ar-next__ctas { display: flex; flex-direction: column; gap: 10px; }
  .cd-ar-next__cta { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 22px; border-radius: 10px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
  .cd-ar-next__cta--primary { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); color: #ffffff; box-shadow: 0 10px 22px rgba(239,102,50,0.32); }
  .cd-ar-next__cta--primary:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(239,102,50,0.44); }
  .cd-ar-next__cta--secondary { background: transparent; color: #1c3370; border: 2px solid #1c3370; }
  .cd-ar-next__cta--secondary:hover { background: #1c3370; color: #ffffff; }
  .cd-ar-next__cta .material-icons { font-size: 18px; }
  @media (max-width: 980px) {
    .cd-ar-next__grid { grid-template-columns: 1fr; gap: 36px; }
    .cd-ar-next__title { font-size: 2rem; }
    .cd-ar-next__card { padding: 30px 26px; }
  }
  @media (max-width: 620px) {
    .cd-ar-next__title { font-size: 1.75rem; }
    .cd-ar-next__desc { font-size: 1rem; }
    .cd-ar-next__card { padding: 26px 22px; }
  }
</style>
<div class="cd-ar-next">
  <div class="cd-ar-next__grid">
    <div class="cd-ar-next__copy">
      <p class="cd-ar-next__eyebrow">{{eyebrow}}</p>
      <h2 class="cd-ar-next__title">{{title}}</h2>
      <div class="cd-ar-next__divider"></div>
      <p class="cd-ar-next__desc">{{desc}}</p>
      <div class="cd-ar-next__chips">
        <span class="cd-ar-next__chip" data-repeat="chips"><span class="material-icons">{{chips.icon}}</span>{{chips.label}}</span>
      </div>
    </div>
    <div class="cd-ar-next__card">
      <h3 class="cd-ar-next__card-title">{{cardTitle}}</h3>
      <p class="cd-ar-next__card-sub">{{cardSub}}</p>
      <ul class="cd-ar-next__signals">
        <li class="cd-ar-next__signal" data-repeat="signals">
          <span class="material-icons">{{signals.icon}}</span>
          <span>
            <strong>{{signals.title}}</strong>
            <span class="cd-ar-next__signal-sub">{{signals.body}}</span>
          </span>
        </li>
      </ul>
      <div class="cd-ar-next__ctas">
        <a class="cd-ar-next__cta cd-ar-next__cta--primary" href="{{primaryHref}}">
          {{primaryLabel}}<span class="material-icons">arrow_forward</span>
        </a>
        <a class="cd-ar-next__cta cd-ar-next__cta--secondary" href="{{secondaryHref}}">
          {{secondaryLabel}}
        </a>
      </div>
    </div>
  </div>
</div>
`.trim();

const NEXT_STEP_DEFAULTS = {
  eyebrow: 'Ready when you are',
  title: 'Take the Next Step Toward Auto Shop Financing',
  desc:
    "Whether you’re trying to fund auto repair shop growth plans or smooth out a timing gap between work completed and cash collected, Cardiff can help you explore options that fit your goal — without slowing down the work in your bays.",
  chips: [
    { icon: 'check_circle', label: 'No obligation to apply' },
    { icon: 'check_circle', label: 'Soft pull on initial review' },
    { icon: 'check_circle', label: 'Human advisor, not a bot' },
  ],
  cardTitle: 'Apply in minutes, get matched today',
  cardSub:
    'A short application + a secure Plaid connection is all we need to put you in front of a real loan advisor.',
  signals: [
    {
      icon: 'support_agent',
      title: 'Talk to a loan advisor in under 5 minutes',
      body: 'Real humans on the phone — no chatbots, no week-long email loops.',
    },
    {
      icon: 'bolt',
      title: 'Same-day funding for qualified shops',
      body: 'Capital can land in your business account the same day you’re approved.',
    },
    {
      icon: 'lock',
      title: 'Plaid-secured, bank-grade encryption',
      body: 'We never see or store your bank credentials — Plaid handles the connection.',
    },
  ],
  primaryLabel: 'Apply now',
  primaryHref: '/apply',
  secondaryLabel: 'See funding options',
  secondaryHref: '#plans',
} as const;

const nextStepBlock = {
  id: RENDER_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: NEXT_STEP_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: NEXT_STEP_DEFAULTS.eyebrow },
    { name: 'title', label: 'Headline', type: 'text', default: NEXT_STEP_DEFAULTS.title },
    { name: 'desc', label: 'Supporting paragraph', type: 'textarea', default: NEXT_STEP_DEFAULTS.desc },
    {
      name: 'chips',
      label: 'Trust chips (under copy)',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const },
        { name: 'label', label: 'Chip label', type: 'text' as const },
      ],
    },
    { name: 'cardTitle', label: 'Card title', type: 'text', default: NEXT_STEP_DEFAULTS.cardTitle },
    { name: 'cardSub', label: 'Card subtitle', type: 'textarea', default: NEXT_STEP_DEFAULTS.cardSub },
    {
      name: 'signals',
      label: 'Trust signals (card list)',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const },
        { name: 'title', label: 'Signal title', type: 'text' as const },
        { name: 'body', label: 'Signal body', type: 'textarea' as const },
      ],
    },
    { name: 'primaryLabel', label: 'Primary CTA label', type: 'text', default: NEXT_STEP_DEFAULTS.primaryLabel },
    { name: 'primaryHref', label: 'Primary CTA href', type: 'text', default: NEXT_STEP_DEFAULTS.primaryHref },
    { name: 'secondaryLabel', label: 'Secondary CTA label', type: 'text', default: NEXT_STEP_DEFAULTS.secondaryLabel },
    { name: 'secondaryHref', label: 'Secondary CTA href', type: 'text', default: NEXT_STEP_DEFAULTS.secondaryHref },
  ],
  values: {
    eyebrow: NEXT_STEP_DEFAULTS.eyebrow,
    title: NEXT_STEP_DEFAULTS.title,
    desc: NEXT_STEP_DEFAULTS.desc,
    chips: [...NEXT_STEP_DEFAULTS.chips],
    cardTitle: NEXT_STEP_DEFAULTS.cardTitle,
    cardSub: NEXT_STEP_DEFAULTS.cardSub,
    signals: [...NEXT_STEP_DEFAULTS.signals],
    primaryLabel: NEXT_STEP_DEFAULTS.primaryLabel,
    primaryHref: NEXT_STEP_DEFAULTS.primaryHref,
    secondaryLabel: NEXT_STEP_DEFAULTS.secondaryLabel,
    secondaryHref: NEXT_STEP_DEFAULTS.secondaryHref,
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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
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

  // Widen so the 2-col closer breathes; switch to brand deep-blue gradient
  // band so the closer reads as a deliberate "wrap-up" moment instead of
  // a hanging paragraph between two rich neighbors.
  sec.maxWidth = '1240px';
  sec.style = {
    ...(sec.style || {}),
    background: 'linear-gradient(135deg, #1c3370 0%, #25418b 60%, #1c3370 100%)',
    backgroundColor: '#1c3370',
    paddingTop: '88px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  sec.blocks = [nextStepBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-9 -> styled 2-col "Take the Next Step" closer on deep-blue band.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
