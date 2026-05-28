/**
 * Iter 11 — Working Capital page (post 837).
 *
 * Biggest remaining unstyled gap: nothing reinforces the hero's three core
 * trust signals ($250K cap, same-day funding, no collateral) before the
 * reader gets dragged into the long "How Much / What Kinds" prose of
 * sec-1-2col. The hero copy makes the promises; the body assumes the reader
 * remembers them. Cardiff.co's product pages bridge that gap with a 4-up
 * stat / trust band immediately under the hero — concrete numbers + Material
 * Icon chips on a tinted band so the eye locks the offer before scrolling
 * into prose.
 *
 * This iter inserts a new section `sec-1a-stats` between `hero-working-capital`
 * (idx 0) and `sec-1-2col`. Section wraps a single html-render block carrying
 * a 4-card grid built with the iter3 icon-card recipe + the data-repeat
 * pattern already used by every other body section on this page
 * (sec-1b/sec-2/sec-3/sec-4/sec-4b). Editors can add/remove/reorder stats
 * from the portal without code changes.
 *
 * Mirrors scripts/migrations/cardiff/styled-equipment-leasing-iter3.ts'
 * card-grid recipe — Raleway titles, Open Sans body, deep-blue/orange/green
 * icon-chip gradients alternating across cards, soft blue band backdrop.
 *
 * Brand: #1c3370 / #25418b headings, #5ac96f green chip, #ef6632 orange chip,
 * Raleway titles, Open Sans body.
 *
 * Idempotent: detects existing `sec-1a-stats` section and rewrites its
 * html-render child in place. Preserves scalar intro / kicker overrides if
 * already present in values; stats array is intentionally re-seeded if the
 * block previously did not exist (first-run).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;
const SECTION_ID = 'sec-1a-stats';
const TARGET_BLOCK_ID = 'sec-1a-stats-grid';
const HERO_ID = 'hero-working-capital';

const STATS_HTML = `
<style>
  .cd-wc-stats { max-width: 1140px; margin: 0 auto; }
  .cd-wc-stats__kicker { text-align: center; color: #ef6632; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; margin: 0 0 10px 0; }
  .cd-wc-stats__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; max-width: 720px; margin: 0 auto 40px auto; }
  .cd-wc-stats__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
  .cd-wc-stats__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 28px 22px; box-shadow: 0 10px 26px rgba(28,51,112,0.06); transition: transform .22s ease, box-shadow .22s ease; display: flex; flex-direction: column; align-items: flex-start; }
  .cd-wc-stats__card:hover { transform: translateY(-4px); box-shadow: 0 16px 36px rgba(28,51,112,0.12); }
  .cd-wc-stats__icon { width: 52px; height: 52px; border-radius: 13px; display: inline-flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-wc-stats__card:nth-child(2) .cd-wc-stats__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-wc-stats__card:nth-child(3) .cd-wc-stats__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-wc-stats__card:nth-child(4) .cd-wc-stats__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.22); }
  .cd-wc-stats__icon .material-icons { font-size: 28px; }
  .cd-wc-stats__value { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.875rem; font-weight: 800; color: #1c3370; margin: 0 0 6px 0; letter-spacing: -0.018em; line-height: 1.1; }
  .cd-wc-stats__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; font-weight: 700; color: #25418b; margin: 0 0 8px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-wc-stats__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9rem; line-height: 1.55; color: #525f7f; margin: 0; }
  @media (max-width: 1024px) {
    .cd-wc-stats__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-wc-stats__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-wc-stats__card { padding: 24px 20px; }
  }
</style>
<div class="cd-wc-stats">
  <p class="cd-wc-stats__kicker" data-field="kicker">{{kicker}}</p>
  <p class="cd-wc-stats__intro" data-field="intro">{{intro}}</p>
  <div class="cd-wc-stats__grid">
    <div class="cd-wc-stats__card" data-repeat="stats">
      <div class="cd-wc-stats__icon"><span class="material-icons">{{stats.icon}}</span></div>
      <p class="cd-wc-stats__value">{{stats.value}}</p>
      <p class="cd-wc-stats__label">{{stats.label}}</p>
      <p class="cd-wc-stats__desc">{{stats.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const STATS_DEFAULTS = {
  kicker: 'WHY CARDIFF WORKING CAPITAL',
  intro:
    'Cardiff finances small businesses on speed, not red tape. The numbers below define what every approved working capital loan looks like.',
  stats: [
    {
      icon: 'payments',
      value: '$250K',
      label: 'Max loan amount',
      desc: 'Working capital financing up to a quarter-million dollars per business, sized to one full operating cycle.',
    },
    {
      icon: 'bolt',
      value: '24 hrs',
      label: 'Funds in your account',
      desc: 'Once approved and paperwork is in order, funds typically hit your business checking within one business day.',
    },
    {
      icon: 'verified',
      value: 'Same day',
      label: 'Decision on your application',
      desc: 'Most applicants get a same-day yes or no — no two-week underwriting limbo while bills pile up.',
    },
    {
      icon: 'lock_open',
      value: '$0',
      label: 'Collateral required',
      desc: 'Approval rides on business revenue and cash-flow health, not on pledged equipment, real estate, or personal assets.',
    },
  ],
} as const;

const statsBlock = {
  id: TARGET_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: STATS_HTML,
  fields: [
    { name: 'kicker', label: 'Kicker line', type: 'text', default: STATS_DEFAULTS.kicker },
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: STATS_DEFAULTS.intro },
    {
      name: 'stats',
      label: 'Stat cards',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'value', label: 'Big number / value', type: 'text' },
        { name: 'label', label: 'Stat label', type: 'text' },
        { name: 'desc', label: 'Supporting description', type: 'textarea' },
      ],
    },
  ],
  values: {
    kicker: STATS_DEFAULTS.kicker,
    intro: STATS_DEFAULTS.intro,
    stats: STATS_DEFAULTS.stats.map((s) => ({ ...s })),
  },
};

function makeSection() {
  return {
    type: 'section' as const,
    id: SECTION_ID,
    order: 1,
    maxWidth: '1200px',
    style: {
      backgroundColor: '#f6f9fc',
      paddingTop: '72px',
      paddingBottom: '72px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [statsBlock],
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

  const heroIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === HERO_ID);
  if (heroIdx === -1) {
    console.error(`Post ${POST_ID}: hero ${HERO_ID} not found; aborting`);
    process.exit(1);
  }

  const existingSecIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === SECTION_ID);

  const pickStr = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim().length > 0 ? v : fallback;

  if (existingSecIdx !== -1) {
    // Re-run path: rewrite the html-render child in place, preserving scalar overrides.
    const sec = parsed.blocks[existingSecIdx];
    if (sec.type !== 'section' || !Array.isArray(sec.blocks)) {
      console.error(`Post ${POST_ID}: block ${SECTION_ID} is not a section with blocks[]; aborting`);
      process.exit(1);
    }
    const childIdx = sec.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
    const existing = childIdx === -1 ? null : sec.blocks[childIdx];
    if (existing) {
      statsBlock.values.kicker = pickStr(existing.values?.kicker, STATS_DEFAULTS.kicker);
      statsBlock.values.intro = pickStr(existing.values?.intro, STATS_DEFAULTS.intro);
    }
    sec.maxWidth = '1200px';
    sec.style = {
      ...(sec.style || {}),
      backgroundColor: '#f6f9fc',
      paddingTop: '72px',
      paddingBottom: '72px',
      paddingLeft: '24px',
      paddingRight: '24px',
    };
    if (childIdx === -1) sec.blocks.push(statsBlock);
    else sec.blocks[childIdx] = statsBlock;
    console.log(`Updated post ${POST_ID}: refreshed ${SECTION_ID} > ${TARGET_BLOCK_ID}.`);
  } else {
    // First-run path: insert a brand-new section directly after the hero.
    parsed.blocks.splice(heroIdx + 1, 0, makeSection());
    // Bump downstream block orders so the editor renders them in the right slot.
    for (let i = heroIdx + 2; i < parsed.blocks.length; i++) {
      const b = parsed.blocks[i];
      if (typeof b?.order === 'number') b.order = i + 1;
    }
    console.log(
      `Updated post ${POST_ID}: inserted ${SECTION_ID} after ${HERO_ID} (4-stat trust band).`,
    );
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
