/**
 * Iter 8 (post 817 — Small Business Loans for Trucking).
 *
 * Iters 1-7 styled the hero, stats, qualify, options, reviews, why-Cardiff,
 * and FAQ bands. Audit of the assembled page reveals one remaining gap:
 * there is no trust-credentials strip between the FAQ and the final CTA.
 * Cardiff.co's industry pages always carry a trust band (BBB rating, years
 * funding, total funded, customers served) right before the closer to
 * reduce CTA friction. The port skipped it.
 *
 * Fix: insert a single `html-render` block with id `sec-trust-strip` at
 * position 7 (between the FAQ accordion and the CTA). Four-up icon-card
 * grid driven by `data-repeat="badges"`; inside the repeat use
 * `{{badges.field}}` so the editor can manage stats as a list.
 *
 * Idempotent: if a block with id `sec-trust-strip` already exists it is
 * rewritten in place; otherwise it is spliced in just before `final-cta`.
 *
 * Brand only: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798, Raleway +
 * Open Sans, Material Icons (no emoji).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const TRUST_BLOCK_ID = 'sec-trust-strip';
const ANCHOR_BEFORE_ID = 'final-cta';

const TRUST_HTML = `
<style>
  .cd-trk-trust { background: linear-gradient(135deg, #f6f9fc 0%, #eef3f8 100%); padding: 64px 24px; border-top: 1px solid #e6ecf5; border-bottom: 1px solid #e6ecf5; }
  .cd-trk-trust__inner { max-width: 1140px; margin: 0 auto; }
  .cd-trk-trust__eyebrow { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #ef6632; text-align: center; margin: 0 0 10px 0; }
  .cd-trk-trust__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.875rem; font-weight: 800; color: #1c3370; text-align: center; margin: 0 auto 10px auto; letter-spacing: -0.012em; line-height: 1.2; max-width: 760px; }
  .cd-trk-trust__rule { width: 56px; height: 3px; background: #ef6632; margin: 0 auto 36px auto; border-radius: 2px; }
  .cd-trk-trust__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
  .cd-trk-trust__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 26px 22px; text-align: center; box-shadow: 0 10px 28px rgba(28,51,112,0.06); display: flex; flex-direction: column; align-items: center; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-trk-trust__card:hover { transform: translateY(-3px); box-shadow: 0 16px 38px rgba(28,51,112,0.12); }
  .cd-trk-trust__icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 14px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-trk-trust__card:nth-child(2) .cd-trk-trust__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-trk-trust__card:nth-child(3) .cd-trk-trust__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-trk-trust__card:nth-child(4) .cd-trk-trust__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.22); }
  .cd-trk-trust__icon .material-icons { font-size: 28px; }
  .cd-trk-trust__metric { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.75rem; font-weight: 800; color: #1c3370; line-height: 1.1; margin: 0 0 6px 0; letter-spacing: -0.01em; }
  .cd-trk-trust__label { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; line-height: 1.5; color: #525f7f; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-trk-trust__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 520px) {
    .cd-trk-trust__grid { grid-template-columns: 1fr; }
  }
</style>
<div class="cd-trk-trust">
  <div class="cd-trk-trust__inner">
    <p class="cd-trk-trust__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-trk-trust__title" data-field="title">{{title}}</h2>
    <div class="cd-trk-trust__rule"></div>
    <div class="cd-trk-trust__grid">
      <div class="cd-trk-trust__card" data-repeat="badges">
        <div class="cd-trk-trust__icon"><span class="material-icons">{{badges.icon}}</span></div>
        <p class="cd-trk-trust__metric">{{badges.metric}}</p>
        <p class="cd-trk-trust__label">{{badges.label}}</p>
      </div>
    </div>
  </div>
</div>
`.trim();

const TRUST_DEFAULTS = {
  eyebrow: 'Why truckers choose Cardiff',
  title: 'A lender built for the long haul',
  badges: [
    { icon: 'verified', metric: 'A+ Rated', label: 'BBB accredited business with a track record of transparent lending.' },
    { icon: 'payments', metric: '$1B+ Funded', label: 'Over one billion dollars deployed to small businesses nationwide.' },
    { icon: 'groups', metric: '20,000+', label: 'Owner-operators and fleet owners financed since 2008.' },
    { icon: 'schedule', metric: 'Same-Day', label: 'Most approved trucking applications fund within 24 hours.' },
  ],
} as const;

const trustBlock = {
  id: TRUST_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: TRUST_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: TRUST_DEFAULTS.eyebrow },
    { name: 'title', label: 'Title', type: 'text', default: TRUST_DEFAULTS.title },
    {
      name: 'badges',
      label: 'Trust badges',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text', default: 'verified' },
        { name: 'metric', label: 'Metric / headline', type: 'text', default: '' },
        { name: 'label', label: 'Description', type: 'textarea', default: '' },
      ],
      default: TRUST_DEFAULTS.badges,
    },
  ],
  values: { ...TRUST_DEFAULTS, badges: TRUST_DEFAULTS.badges.map((b) => ({ ...b })) },
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

  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === TRUST_BLOCK_ID);
  if (existingIdx !== -1) {
    parsed.blocks[existingIdx] = { ...parsed.blocks[existingIdx], ...trustBlock };
    console.log(`Post ${POST_ID}: rewrote existing ${TRUST_BLOCK_ID} (idx ${existingIdx}).`);
  } else {
    const anchorIdx = parsed.blocks.findIndex((b: any) => b?.id === ANCHOR_BEFORE_ID);
    const insertAt = anchorIdx === -1 ? parsed.blocks.length : anchorIdx;
    parsed.blocks.splice(insertAt, 0, trustBlock);
    console.log(`Post ${POST_ID}: inserted ${TRUST_BLOCK_ID} at idx ${insertAt} (before ${ANCHOR_BEFORE_ID}).`);
  }

  // Re-number order to match positions for renderers that honor `order`.
  parsed.blocks.forEach((b: any, i: number) => {
    if (b && typeof b === 'object') b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: trust strip in place.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
