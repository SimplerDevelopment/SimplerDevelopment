/**
 * Iteration 6: Newsroom page (post id 826) — add a "Press & Media Contact"
 * band (id `sec-3b`) between sec-3 (Cardiff In The Media) and the final
 * Apply-CTA section.
 *
 * Why this polish, not another tweak elsewhere:
 *   - iter1–4 built hero + Latest News + Press Mentions; iter5 inserted a
 *     Browse-by-Topic icon-card grid. The page now reads well until the
 *     last beat, where it leaps straight from a press-mention logo wall to
 *     a generic "Apply Now" CTA.
 *   - On real cardiff.co (and every credible newsroom — SBA, Block, Stripe
 *     press pages), the page ends with a press-contact block: a name,
 *     email, response-time promise, and a couple of "what reporters can
 *     ask us about" topic chips. This converts the page from a passive
 *     news archive into something a journalist can actually act on.
 *   - It also adds a visual rest between the busy logo/list section (sec-3)
 *     and the apply CTA, fixing the slight "two heavy bands back-to-back"
 *     rhythm problem.
 *
 * Pattern reused: the icon-card + repeater approach from
 *   `styled-equipment-leasing-iter3.ts` and the topics grid in
 *   `styled-newsroom-iter5.ts`. One html-render block, brand palette
 *   (#1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798), Raleway + Open
 *   Sans, no emojis (Material Icons via <span class="material-icons">).
 *
 * Idempotent: detects an existing block with id `sec-3b` and rewrites it
 * in place; otherwise inserts after sec-3 and re-numbers `order` to keep
 * the sequence monotonic.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;
const NEW_SECTION_ID = 'sec-3b';
const INSERT_AFTER_ID = 'sec-3';

const PRESS_HTML = `
<style>
  .cd-press { max-width: 1180px; margin: 0 auto; padding: 56px 24px 64px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-press__inner { background: linear-gradient(135deg, #1c3370 0%, #25418b 60%, #385cc0 100%); border-radius: 18px; padding: 44px 48px; color: #ffffff; box-shadow: 0 22px 60px rgba(28,51,112,0.22); position: relative; overflow: hidden; }
  .cd-press__inner::after { content: ''; position: absolute; right: -80px; top: -80px; width: 320px; height: 320px; background: radial-gradient(circle, rgba(239,102,50,0.28) 0%, rgba(239,102,50,0) 65%); pointer-events: none; }
  .cd-press__grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 40px; align-items: center; position: relative; z-index: 1; }
  .cd-press__eyebrow { font-family: 'Raleway', sans-serif; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.16em; color: #ffb798; text-transform: uppercase; margin: 0 0 12px 0; }
  .cd-press__title { font-family: 'Raleway', sans-serif; font-size: 1.85rem; font-weight: 800; color: #ffffff; line-height: 1.18; letter-spacing: -0.014em; margin: 0 0 14px 0; }
  .cd-press__sub { font-family: 'Open Sans', sans-serif; font-size: 1rem; line-height: 1.65; color: rgba(255,255,255,0.85); margin: 0 0 22px 0; }
  .cd-press__topics { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 4px 0; }
  .cd-press__chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; font-family: 'Raleway', sans-serif; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; color: #ffffff; text-transform: uppercase; }
  .cd-press__chip .material-icons { font-size: 14px; color: #ffb798; }
  .cd-press__card { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.16); border-radius: 14px; padding: 28px 28px; backdrop-filter: blur(6px); }
  .cd-press__row { display: flex; align-items: flex-start; gap: 14px; margin: 0 0 18px 0; }
  .cd-press__row:last-of-type { margin-bottom: 22px; }
  .cd-press__icon { flex: 0 0 38px; width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 6px 14px rgba(239,102,50,0.32); }
  .cd-press__row:nth-of-type(2) .cd-press__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 6px 14px rgba(58,168,86,0.32); }
  .cd-press__row:nth-of-type(3) .cd-press__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 6px 14px rgba(255,183,152,0.32); }
  .cd-press__icon .material-icons { font-size: 20px; color: #ffffff; }
  .cd-press__row-label { font-family: 'Raleway', sans-serif; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.12em; color: rgba(255,255,255,0.65); text-transform: uppercase; margin: 0 0 2px 0; }
  .cd-press__row-value { font-family: 'Open Sans', sans-serif; font-size: 0.98rem; line-height: 1.45; color: #ffffff; margin: 0; word-break: break-word; }
  .cd-press__row-value a { color: #ffffff; text-decoration: none; border-bottom: 1px solid rgba(255,183,152,0.55); }
  .cd-press__row-value a:hover { border-bottom-color: #ffb798; }
  .cd-press__cta { display: inline-flex; align-items: center; gap: 8px; padding: 13px 26px; background: #ffffff; color: #1c3370; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.14em; text-transform: uppercase; border-radius: 6px; text-decoration: none; box-shadow: 0 8px 20px rgba(0,0,0,0.18); transition: transform .2s ease, box-shadow .2s ease; }
  .cd-press__cta:hover { transform: translateY(-2px); box-shadow: 0 14px 28px rgba(0,0,0,0.24); }
  .cd-press__cta .material-icons { font-size: 16px; color: #ef6632; }
  @media (max-width: 900px) {
    .cd-press__inner { padding: 36px 30px; }
    .cd-press__grid { grid-template-columns: 1fr; gap: 28px; }
    .cd-press__title { font-size: 1.55rem; }
  }
  @media (max-width: 520px) {
    .cd-press { padding: 40px 16px 48px 16px; }
    .cd-press__inner { padding: 28px 22px; }
    .cd-press__card { padding: 22px 20px; }
  }
</style>
<section class="cd-press">
  <div class="cd-press__inner">
    <div class="cd-press__grid">
      <div class="cd-press__left">
        <p class="cd-press__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
        <h2 class="cd-press__title" data-field="title">{{title}}</h2>
        <p class="cd-press__sub" data-field="sub">{{sub}}</p>
        <div class="cd-press__topics">
          <span class="cd-press__chip" data-repeat="chips">
            <span class="material-icons">{{chips.icon}}</span>{{chips.label}}
          </span>
        </div>
      </div>
      <div class="cd-press__card">
        <div class="cd-press__row">
          <div class="cd-press__icon"><span class="material-icons">person</span></div>
          <div>
            <p class="cd-press__row-label" data-field="contactLabel">{{contactLabel}}</p>
            <p class="cd-press__row-value" data-field="contactName">{{contactName}}</p>
          </div>
        </div>
        <div class="cd-press__row">
          <div class="cd-press__icon"><span class="material-icons">mail</span></div>
          <div>
            <p class="cd-press__row-label" data-field="emailLabel">{{emailLabel}}</p>
            <p class="cd-press__row-value"><a href="mailto:{{contactEmail}}" data-field="contactEmail">{{contactEmail}}</a></p>
          </div>
        </div>
        <div class="cd-press__row">
          <div class="cd-press__icon"><span class="material-icons">schedule</span></div>
          <div>
            <p class="cd-press__row-label" data-field="responseLabel">{{responseLabel}}</p>
            <p class="cd-press__row-value" data-field="responseValue">{{responseValue}}</p>
          </div>
        </div>
        <a class="cd-press__cta" href="mailto:{{contactEmail}}">
          <span class="material-icons">send</span><span data-field="ctaText">{{ctaText}}</span>
        </a>
      </div>
    </div>
  </div>
</section>
`.trim();

const PRESS_DEFAULTS = {
  eyebrow: 'PRESS & MEDIA',
  title: 'Working on a story? Reach our press team.',
  sub: 'Cardiff executives and analysts are available for interviews, expert commentary, and on-the-record quotes on small-business lending, equipment finance, and SMB credit trends. We respond to credentialed media within one business day.',
  chips: [
    { icon: 'trending_up', label: 'SMB Credit Trends' },
    { icon: 'precision_manufacturing', label: 'Equipment Finance' },
    { icon: 'storefront', label: 'Main Street Economy' },
    { icon: 'policy', label: 'Rate & Policy Impact' },
  ],
  contactLabel: 'PRESS CONTACT',
  contactName: 'Cardiff Communications Team',
  emailLabel: 'EMAIL',
  contactEmail: 'press@cardiff.co',
  responseLabel: 'RESPONSE TIME',
  responseValue: 'Within one business day for credentialed media inquiries.',
  ctaText: 'Email the Press Team',
} as const;

const pressBlock = {
  id: NEW_SECTION_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3, // placeholder — recomputed in main()
  html: PRESS_HTML,
  style: {
    backgroundColor: '#ffffff',
  },
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: PRESS_DEFAULTS.eyebrow },
    { name: 'title', label: 'Title', type: 'text', default: PRESS_DEFAULTS.title },
    { name: 'sub', label: 'Subtitle', type: 'textarea', default: PRESS_DEFAULTS.sub },
    {
      name: 'chips',
      label: 'Topic chips',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'label', label: 'Label', type: 'text' },
      ],
    },
    { name: 'contactLabel', label: 'Contact label', type: 'text', default: PRESS_DEFAULTS.contactLabel },
    { name: 'contactName', label: 'Contact name', type: 'text', default: PRESS_DEFAULTS.contactName },
    { name: 'emailLabel', label: 'Email label', type: 'text', default: PRESS_DEFAULTS.emailLabel },
    { name: 'contactEmail', label: 'Contact email', type: 'text', default: PRESS_DEFAULTS.contactEmail },
    { name: 'responseLabel', label: 'Response label', type: 'text', default: PRESS_DEFAULTS.responseLabel },
    { name: 'responseValue', label: 'Response value', type: 'textarea', default: PRESS_DEFAULTS.responseValue },
    { name: 'ctaText', label: 'CTA text', type: 'text', default: PRESS_DEFAULTS.ctaText },
  ],
  values: { ...PRESS_DEFAULTS, chips: PRESS_DEFAULTS.chips.map((c) => ({ ...c })) },
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
  const blocks: any[] = parsed.blocks;

  const existingIdx = blocks.findIndex((b) => b?.id === NEW_SECTION_ID);
  const anchorIdx = blocks.findIndex((b) => b?.id === INSERT_AFTER_ID);
  if (anchorIdx === -1) {
    console.error(`Post ${POST_ID}: anchor block ${INSERT_AFTER_ID} not found`);
    process.exit(1);
  }

  if (existingIdx !== -1) {
    const prevOrder = blocks[existingIdx].order;
    blocks[existingIdx] = { ...pressBlock, order: prevOrder };
    console.log(`Rewrote existing ${NEW_SECTION_ID} block at index ${existingIdx} (order ${prevOrder}).`);
  } else {
    blocks.splice(anchorIdx + 1, 0, pressBlock);
    blocks.forEach((b, i) => {
      b.order = i + 1;
    });
    console.log(`Inserted ${NEW_SECTION_ID} after ${INSERT_AFTER_ID}; re-numbered ${blocks.length} block orders.`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID} (iter6): Press & Media Contact band in place.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
