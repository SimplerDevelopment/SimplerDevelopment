/**
 * Iter 4: Industries hub (post id 818) — add a single compact "trust band"
 * between the minimal hero and the industry strips.
 *
 * Iters 1-3 produced: minimal centered hero + alternating industry strips,
 * and removed the redundant final CTA. The page now reads as Hero -> Strips
 * with no breathing room or social-proof between them.
 *
 * This iter inserts ONE new block — `industries-trust` (html-render) — at
 * order between the hero and strips. It is a compact 4-up stat grid on a
 * cream backdrop (`#ffb798` brand peach at low alpha) that gives the eye
 * something to land on and signals credibility (industries served, avg
 * funding speed, typical loan size, customer rating) before the user
 * scrolls into the long strips section. No new CTA — keeps the hub clean.
 *
 * Repeats via data-repeat="stats" so the editor can re-order or extend
 * without code edits — values use {{stats.field}} inside the repeat node.
 *
 * Idempotent: detects existing `industries-trust` block by id; rewrites
 * if present, otherwise splices in at position 1 (after hero, before
 * strips). Re-running is safe.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 818;
const TRUST_BLOCK_ID = 'industries-trust';
const HERO_BLOCK_ID = 'hero-industries-min';
const STRIPS_BLOCK_ID = 'industries-strips';

const TRUST_HTML = `
<style>
  .cd-ind-trust {
    background: linear-gradient(180deg, #ffffff 0%, rgba(255,183,152,0.18) 100%);
    padding: 48px 24px 56px 24px;
    border-bottom: 1px solid #e6ecf5;
  }
  .cd-ind-trust__inner { max-width: 1100px; margin: 0 auto; }
  .cd-ind-trust__eyebrow {
    text-align: center;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #ef6632;
    margin: 0 0 8px 0;
  }
  .cd-ind-trust__title {
    text-align: center;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.5rem;
    font-weight: 800;
    color: #1c3370;
    letter-spacing: -0.01em;
    line-height: 1.25;
    margin: 0 auto 28px auto;
    max-width: 760px;
  }
  .cd-ind-trust__grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  .cd-ind-trust__tile {
    background: #ffffff;
    border: 1px solid #e6ecf5;
    border-radius: 12px;
    padding: 22px 18px;
    text-align: center;
    box-shadow: 0 6px 18px rgba(28,51,112,0.05);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .cd-ind-trust__icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #25418b 0%, #1c3370 100%);
    color: #ffffff;
    box-shadow: 0 6px 14px rgba(28,51,112,0.22);
    margin-bottom: 4px;
  }
  .cd-ind-trust__tile:nth-child(2) .cd-ind-trust__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 6px 14px rgba(239,102,50,0.28); }
  .cd-ind-trust__tile:nth-child(3) .cd-ind-trust__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 6px 14px rgba(58,168,86,0.28); }
  .cd-ind-trust__tile:nth-child(4) .cd-ind-trust__icon { background: linear-gradient(135deg, #385cc0 0%, #25418b 100%); box-shadow: 0 6px 14px rgba(56,92,192,0.28); }
  .cd-ind-trust__icon .material-icons { font-size: 22px; }
  .cd-ind-trust__stat {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.65rem;
    font-weight: 800;
    color: #1c3370;
    letter-spacing: -0.015em;
    line-height: 1.1;
    margin: 0;
  }
  .cd-ind-trust__label {
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    color: #525f7f;
    line-height: 1.35;
    margin: 0;
  }
  @media (max-width: 900px) {
    .cd-ind-trust__grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .cd-ind-trust__title { font-size: 1.3rem; }
  }
  @media (max-width: 480px) {
    .cd-ind-trust { padding: 36px 16px 40px 16px; }
    .cd-ind-trust__stat { font-size: 1.4rem; }
  }
</style>
<section class="cd-ind-trust">
  <div class="cd-ind-trust__inner">
    <p class="cd-ind-trust__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-ind-trust__title" data-field="title">{{title}}</h2>
    <div class="cd-ind-trust__grid">
      <div class="cd-ind-trust__tile" data-repeat="stats">
        <div class="cd-ind-trust__icon"><span class="material-icons" data-field="icon">{{stats.icon}}</span></div>
        <p class="cd-ind-trust__stat" data-field="stat">{{stats.stat}}</p>
        <p class="cd-ind-trust__label" data-field="label">{{stats.label}}</p>
      </div>
    </div>
  </div>
</section>
`.trim();

const TRUST_DEFAULTS = {
  eyebrow: 'TRUSTED BY OPERATORS NATIONWIDE',
  title: 'Industry-specific funding, built around how your business actually runs.',
  stats: [
    { icon: 'business_center', stat: '25+', label: 'Industries funded' },
    { icon: 'bolt', stat: 'Same day', label: 'Typical decision' },
    { icon: 'payments', stat: '$65K+', label: 'Average approval' },
    { icon: 'star_rate', stat: '4.8 / 5', label: 'Customer rating' },
  ],
};

const trustBlock = {
  id: TRUST_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: TRUST_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: TRUST_DEFAULTS.eyebrow },
    { name: 'title', label: 'Title', type: 'textarea' as const, default: TRUST_DEFAULTS.title },
    {
      name: 'stats',
      label: 'Stat tiles',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const, default: 'business_center' },
        { name: 'stat', label: 'Stat value', type: 'text' as const, default: '25+' },
        { name: 'label', label: 'Stat label', type: 'text' as const, default: 'Industries funded' },
      ],
      default: TRUST_DEFAULTS.stats,
    },
  ],
  values: { ...TRUST_DEFAULTS },
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

  const existingIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === TRUST_BLOCK_ID,
  );

  let action: 'inserted' | 'updated';

  if (existingIdx !== -1) {
    // Update in place — preserve any user edits to values/fields where possible,
    // but rewrite html so style/markup improvements land.
    const existing = parsed.blocks[existingIdx];
    parsed.blocks[existingIdx] = {
      ...existing,
      type: 'html-render',
      width: 'full',
      html: TRUST_HTML,
      fields: trustBlock.fields,
      values: existing.values && existing.values.stats ? existing.values : trustBlock.values,
    };
    action = 'updated';
  } else {
    // Insert after hero, before strips.
    const heroIdx = parsed.blocks.findIndex(
      (b: { id?: string }) => b?.id === HERO_BLOCK_ID,
    );
    const stripsIdx = parsed.blocks.findIndex(
      (b: { id?: string }) => b?.id === STRIPS_BLOCK_ID,
    );
    if (heroIdx === -1 || stripsIdx === -1) {
      console.error(
        `Post ${POST_ID}: expected blocks ${HERO_BLOCK_ID} and ${STRIPS_BLOCK_ID} to exist; aborting.`,
      );
      process.exit(1);
    }
    const insertAt = Math.min(stripsIdx, heroIdx + 1);
    parsed.blocks.splice(insertAt, 0, trustBlock);
    action = 'inserted';
  }

  // Re-sequence order across all blocks so the editor stays tidy.
  parsed.blocks.forEach((b: { order?: number }, i: number) => {
    b.order = i;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `Post ${POST_ID}: ${action} "${TRUST_BLOCK_ID}" trust band. Block count now: ${parsed.blocks.length}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
