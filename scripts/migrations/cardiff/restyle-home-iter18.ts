/**
 * Iter 18 — Restyle the trust-badges band (post 793, block id=trust-badges).
 *
 * Currently a generic 3-up card-grid with a flat Material Icon, sitting
 * on white and overlapping the hero with margin-top: -56px. The cards
 * are the first thing the eye lands on after the hero, but every other
 * polished band on the page (process, intro, equipment-leasing) uses
 * gradient icon tiles + Raleway titles + structured proof copy.
 *
 * Replace sec.blocks with a single full-width html-render that:
 *   - Preserves the overlap-with-hero negative margin
 *   - Promotes each badge: gradient icon tile (blue / orange / green),
 *     big stat number on top, supporting label + 1-line proof under
 *   - Uses data-repeat="badge" so the row remains editable in the portal
 *   - Adds a subtle hover lift to match the rest of the page
 *
 * Idempotent — overwrites trust-badges.blocks every run, no duplication.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const TARGET_BLOCK_ID = 'trust-badges';

const BADGES_HTML = `
<style>
  .cd-tb { max-width: 1160px; margin: -72px auto 0 auto; position: relative; z-index: 2; }
  .cd-tb__row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-tb__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 16px; padding: 32px 30px 30px 30px; box-shadow: 0 22px 50px rgba(28,51,112,0.10); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; overflow: hidden; }
  .cd-tb__card::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #25418b 0%, #1c3370 100%); }
  .cd-tb__card:nth-child(2)::after { background: linear-gradient(90deg, #ef6632 0%, #d8501e 100%); }
  .cd-tb__card:nth-child(3)::after { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }
  .cd-tb__card:hover { transform: translateY(-4px); box-shadow: 0 30px 64px rgba(28,51,112,0.16); }
  .cd-tb__head { display: flex; align-items: center; gap: 16px; margin: 0 0 18px 0; }
  .cd-tb__icon { flex: 0 0 auto; width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-tb__card:nth-child(2) .cd-tb__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-tb__card:nth-child(3) .cd-tb__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-tb__icon .material-icons { font-size: 26px; }
  .cd-tb__stat { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; color: #1c3370; font-size: 1.875rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1; margin: 0; }
  .cd-tb__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; color: #ef6632; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; margin: 14px 0 8px 0; }
  .cd-tb__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #525f7f; font-size: 0.9375rem; line-height: 1.6; margin: 0; }
  @media (max-width: 900px) {
    .cd-tb__row { grid-template-columns: 1fr; gap: 16px; }
    .cd-tb { margin-top: -48px; max-width: 560px; }
    .cd-tb__card { padding: 26px 24px; }
    .cd-tb__stat { font-size: 1.625rem; }
  }
</style>
<div class="cd-tb">
  <div class="cd-tb__row">
    <div class="cd-tb__card" data-repeat="badge">
      <div class="cd-tb__head">
        <div class="cd-tb__icon"><span class="material-icons">{{badge.icon}}</span></div>
        <div class="cd-tb__stat">{{badge.stat}}</div>
      </div>
      <div class="cd-tb__label">{{badge.label}}</div>
      <p class="cd-tb__desc">{{badge.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const BADGES_DEFAULTS = {
  badges: [
    {
      icon: 'payments',
      stat: '$12B+',
      label: 'Capital Funded',
      desc: 'Deployed to small businesses in every state — across retail, healthcare, construction, and beyond.',
    },
    {
      icon: 'bolt',
      stat: '2 min',
      label: 'To a Real Decision',
      desc: 'Tell us about your business. Get an answer before your coffee gets cold.',
    },
    {
      icon: 'schedule',
      stat: 'Same Day',
      label: 'Funds in Account',
      desc: 'Approved this morning? The cash is in your account before close of business.',
    },
  ],
} as const;

const badgesBlock = {
  id: 'trust-badges-render',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: BADGES_HTML,
  fields: [
    {
      name: 'badges',
      label: 'Trust badges',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'stat', label: 'Stat / headline number', type: 'text' },
        { name: 'label', label: 'Label (overline)', type: 'text' },
        { name: 'desc', label: 'Proof line', type: 'textarea' },
      ],
      default: BADGES_DEFAULTS.badges,
    },
  ],
  values: {
    badges: BADGES_DEFAULTS.badges.map((b) => ({ ...b })),
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

  // The html-render owns its own top-negative-margin overlap with the hero now,
  // so flatten the section's vertical padding.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
    paddingTop: '0',
    paddingBottom: '72px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  sec.blocks = [badgesBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: trust-badges -> gradient-tile 3-up with stat + label + proof.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
