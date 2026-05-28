/**
 * Iter 8 (newsroom, post 826): Add a "Subscribe to the Cardiff Newsroom"
 * email-signup band between the press-contact section (sec-3b) and the
 * final CTA (final-cta).
 *
 * Iters 1-7 covered hero, featured news, latest-news cards, browse-by-topic,
 * by-the-numbers stats, in-the-media tabs, and press contact. The remaining
 * obvious polish on cardiff.co's newsroom is a way for readers to opt into
 * future press updates — the existing flow currently dead-ends at "talk to
 * our press team," which only serves credentialed media. A newsletter band
 * captures investors, partners, and SMB readers.
 *
 * Design: deep-blue gradient band echoing the hero/CTA palette, with a
 * left-column pitch (eyebrow + headline + sub + value bullets) and a
 * right-column email capture card (input + button + trust-line + a small
 * "what you'll get" repeater grid). Brand palette only.
 *
 * Idempotent: re-running detects an existing html-render block at id
 *   `sec-4-subscribe` and rewrites it in place; otherwise inserts it
 *   immediately before `final-cta`.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;
const NEW_BLOCK_ID = 'sec-4-subscribe';
const INSERT_BEFORE_ID = 'final-cta';

const SUBSCRIBE_HTML = `
<style>
  .cd-ns { background: linear-gradient(135deg, #1c3370 0%, #25418b 55%, #1c3370 100%); padding: 88px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; position: relative; overflow: hidden; }
  .cd-ns::before { content: ''; position: absolute; top: -120px; right: -120px; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, rgba(90,201,111,0.22), rgba(90,201,111,0) 65%); pointer-events: none; }
  .cd-ns::after { content: ''; position: absolute; bottom: -160px; left: -120px; width: 440px; height: 440px; border-radius: 50%; background: radial-gradient(circle at 70% 70%, rgba(239,102,50,0.18), rgba(239,102,50,0) 65%); pointer-events: none; }
  .cd-ns__inner { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: 1.05fr 1fr; gap: 56px; align-items: center; position: relative; z-index: 2; }
  .cd-ns__pitch { color: #ffffff; }
  .cd-ns__eyebrow { font-family: 'Raleway', sans-serif; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.16em; color: #5ac96f; text-transform: uppercase; margin: 0 0 18px 0; display: inline-flex; align-items: center; gap: 8px; }
  .cd-ns__eyebrow .material-icons { font-size: 18px; }
  .cd-ns__headline { font-family: 'Raleway', sans-serif; font-size: 2.4rem; font-weight: 800; line-height: 1.15; letter-spacing: -0.015em; margin: 0 0 18px 0; color: #ffffff; }
  .cd-ns__sub { font-size: 1.05rem; line-height: 1.7; color: rgba(255,255,255,0.82); margin: 0 0 30px 0; max-width: 520px; }
  .cd-ns__bullets { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 22px; }
  .cd-ns__bullet { display: flex; align-items: flex-start; gap: 10px; font-size: 0.95rem; color: rgba(255,255,255,0.92); line-height: 1.55; }
  .cd-ns__bullet .material-icons { color: #5ac96f; font-size: 20px; margin-top: 1px; flex-shrink: 0; }
  .cd-ns__card { background: #ffffff; border-radius: 18px; padding: 36px 34px; box-shadow: 0 30px 60px rgba(0,0,0,0.28); position: relative; }
  .cd-ns__card-eyebrow { font-family: 'Raleway', sans-serif; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.14em; color: #ef6632; text-transform: uppercase; margin: 0 0 10px 0; }
  .cd-ns__card-title { font-family: 'Raleway', sans-serif; font-size: 1.35rem; font-weight: 800; color: #1c3370; line-height: 1.25; margin: 0 0 22px 0; letter-spacing: -0.005em; }
  .cd-ns__form { display: flex; flex-direction: column; gap: 12px; margin: 0 0 18px 0; }
  .cd-ns__label { font-size: 0.82rem; font-weight: 700; color: #25418b; letter-spacing: 0.04em; text-transform: uppercase; }
  .cd-ns__input-wrap { display: flex; gap: 10px; }
  .cd-ns__input { flex: 1; font-family: 'Open Sans', sans-serif; font-size: 1rem; padding: 14px 16px; border: 1.5px solid #d9e1ee; border-radius: 10px; color: #1c3370; background: #f6f9fc; transition: border-color .2s ease, background .2s ease; outline: none; }
  .cd-ns__input:focus { border-color: #25418b; background: #ffffff; box-shadow: 0 0 0 4px rgba(37,65,139,0.12); }
  .cd-ns__btn { font-family: 'Raleway', sans-serif; font-size: 0.95rem; font-weight: 800; letter-spacing: 0.03em; padding: 14px 22px; background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); color: #ffffff; border: 0; border-radius: 10px; cursor: pointer; text-transform: uppercase; box-shadow: 0 10px 22px rgba(239,102,50,0.32); transition: transform .2s ease, box-shadow .2s ease; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
  .cd-ns__btn:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(239,102,50,0.4); }
  .cd-ns__btn .material-icons { font-size: 18px; }
  .cd-ns__trust { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #6a778f; margin: 0; }
  .cd-ns__trust .material-icons { font-size: 16px; color: #5ac96f; }
  .cd-ns__perks { margin: 26px 0 0 0; padding: 22px 0 0 0; border-top: 1px solid #eef2f9; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .cd-ns__perk { text-align: center; }
  .cd-ns__perk .material-icons { font-size: 22px; color: #25418b; }
  .cd-ns__perk-label { font-family: 'Raleway', sans-serif; font-size: 0.78rem; font-weight: 800; color: #1c3370; letter-spacing: 0.04em; text-transform: uppercase; margin: 6px 0 0 0; line-height: 1.3; }
  @media (max-width: 980px) {
    .cd-ns__inner { grid-template-columns: 1fr; gap: 40px; }
    .cd-ns__headline { font-size: 2rem; }
    .cd-ns__bullets { grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) {
    .cd-ns { padding: 64px 18px; }
    .cd-ns__card { padding: 28px 22px; }
    .cd-ns__input-wrap { flex-direction: column; }
    .cd-ns__btn { justify-content: center; }
    .cd-ns__perks { grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  }
</style>
<section class="cd-ns">
  <div class="cd-ns__inner">
    <div class="cd-ns__pitch">
      <p class="cd-ns__eyebrow"><span class="material-icons">mark_email_read</span>{{eyebrow}}</p>
      <h2 class="cd-ns__headline">{{headline}}</h2>
      <p class="cd-ns__sub">{{sub}}</p>
      <ul class="cd-ns__bullets" data-repeat="bullets">
        <li class="cd-ns__bullet"><span class="material-icons">check_circle</span>{{bullets.text}}</li>
      </ul>
    </div>
    <div class="cd-ns__card">
      <p class="cd-ns__card-eyebrow">{{cardEyebrow}}</p>
      <h3 class="cd-ns__card-title">{{cardTitle}}</h3>
      <form class="cd-ns__form" action="{{formAction}}" method="post">
        <label class="cd-ns__label" for="cd-ns-email">{{inputLabel}}</label>
        <div class="cd-ns__input-wrap">
          <input class="cd-ns__input" id="cd-ns-email" type="email" name="email" placeholder="{{inputPlaceholder}}" required />
          <button class="cd-ns__btn" type="submit"><span class="material-icons">send</span>{{btnText}}</button>
        </div>
      </form>
      <p class="cd-ns__trust"><span class="material-icons">lock</span>{{trustText}}</p>
      <div class="cd-ns__perks" data-repeat="perks">
        <div class="cd-ns__perk">
          <span class="material-icons">{{perks.icon}}</span>
          <p class="cd-ns__perk-label">{{perks.label}}</p>
        </div>
      </div>
    </div>
  </div>
</section>
`.trim();

const DEFAULTS = {
  eyebrow: 'STAY IN THE LOOP',
  headline: 'Get Cardiff press updates the moment they break.',
  sub: 'Investor letters, market commentary, and small-business lending insights from the Cardiff team — delivered straight to your inbox. No noise, no spam, unsubscribe in one click.',
  bullets: [
    { text: 'New press releases and executive statements' },
    { text: 'Quarterly small-business credit trend reports' },
    { text: 'Founder interviews and market commentary' },
    { text: 'Funding milestones and company news' },
  ],
  cardEyebrow: 'NEWSLETTER',
  cardTitle: 'Subscribe to the Cardiff Newsroom',
  formAction: '/newsroom/subscribe',
  inputLabel: 'Work email',
  inputPlaceholder: 'you@company.com',
  btnText: 'Subscribe',
  trustText: 'We respect your inbox. One email per release, no spam, unsubscribe anytime.',
  perks: [
    { icon: 'schedule', label: 'Real-time' },
    { icon: 'verified', label: 'Source-direct' },
    { icon: 'unsubscribe', label: '1-click out' },
  ],
};

const subscribeBlock = {
  id: NEW_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 0, // re-numbered below
  html: SUBSCRIBE_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: DEFAULTS.eyebrow },
    { name: 'headline', label: 'Headline', type: 'text', default: DEFAULTS.headline },
    { name: 'sub', label: 'Subtitle', type: 'textarea', default: DEFAULTS.sub },
    {
      name: 'bullets',
      label: 'Value bullets',
      type: 'repeater',
      fields: [{ name: 'text', label: 'Bullet text', type: 'text' }],
    },
    { name: 'cardEyebrow', label: 'Card eyebrow', type: 'text', default: DEFAULTS.cardEyebrow },
    { name: 'cardTitle', label: 'Card title', type: 'text', default: DEFAULTS.cardTitle },
    { name: 'formAction', label: 'Form action URL', type: 'text', default: DEFAULTS.formAction },
    { name: 'inputLabel', label: 'Input label', type: 'text', default: DEFAULTS.inputLabel },
    { name: 'inputPlaceholder', label: 'Input placeholder', type: 'text', default: DEFAULTS.inputPlaceholder },
    { name: 'btnText', label: 'Button text', type: 'text', default: DEFAULTS.btnText },
    { name: 'trustText', label: 'Trust line', type: 'textarea', default: DEFAULTS.trustText },
    {
      name: 'perks',
      label: 'Perks (3-up under form)',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'label', label: 'Label', type: 'text' },
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
  const ctaIdx = parsed.blocks.findIndex((b: any) => b?.id === INSERT_BEFORE_ID);
  if (ctaIdx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${INSERT_BEFORE_ID}; aborting`);
    process.exit(1);
  }

  if (existingIdx !== -1) {
    // Preserve existing user-edited values if present.
    const prev = parsed.blocks[existingIdx];
    parsed.blocks[existingIdx] = {
      ...subscribeBlock,
      order: prev.order ?? subscribeBlock.order,
      values: { ...subscribeBlock.values, ...(prev.values || {}) },
    };
    console.log(`Post ${POST_ID}: rewrote existing ${NEW_BLOCK_ID} block at idx ${existingIdx}.`);
  } else {
    parsed.blocks.splice(ctaIdx, 0, subscribeBlock);
    console.log(`Post ${POST_ID}: inserted ${NEW_BLOCK_ID} before ${INSERT_BEFORE_ID} (idx ${ctaIdx}).`);
  }

  // Re-number `order` so blocks stay sequential.
  parsed.blocks.forEach((b: any, i: number) => {
    b.order = i;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: newsroom iter 8 (subscribe band) applied. Block count: ${parsed.blocks.length}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
