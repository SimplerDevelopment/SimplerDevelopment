/**
 * Iter 8: Industries hub (post id 818) — insert a "more industries we fund"
 * band BETWEEN the 10 deep-dive industry strips (idx 2) and the How-To-Apply
 * section (idx 3).
 *
 * Iters 1-7 produced: hero -> trust -> 10 alternating industry strips ->
 * how-to-apply -> faq. The remaining gap is that the strips only call out
 * 10 named industries, so any visitor whose business sits outside that list
 * (e.g. a landscaper, a daycare owner, a print shop) sees no signal that
 * Cardiff funds them at all. The FAQ later answers "do you work with my
 * industry" abstractly, but by then visual momentum is gone.
 *
 * This iter inserts ONE new block — `industries-more` (html-render) — a
 * compact 4x3 icon-card grid showing 12 additional industries, capped with
 * a reassurance line ("Don't see your industry? We fund 700+ verticals.")
 * and a CTA. The card pattern mirrors equipment-leasing-iter3 (icon chip +
 * title + short copy) but uses `data-repeat="industries"` with
 * `{{industries.field}}` placeholders so the editor can re-order, add, or
 * remove cards freely.
 *
 * New flow:
 *   hero -> trust -> strips -> MORE INDUSTRIES -> apply -> faq
 *
 * Brand palette only (#1c3370 / #25418b / #5ac96f / #ef6632), Material
 * Icons (no emojis), Raleway titles, Open Sans body.
 *
 * Idempotent: detects existing `industries-more` by id; rewrites html +
 * fields (preserving user-edited values when the industries array shape
 * is intact), otherwise inserts before the how-to-apply block (falls back
 * to before FAQ, then to append). Re-sequences `order` across all blocks
 * so the editor stays tidy. Safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 818;
const MORE_BLOCK_ID = 'industries-more';
const APPLY_BLOCK_ID = 'industries-how-to-apply';
const FAQ_BLOCK_ID = 'industries-faq';

const MORE_HTML = `
<style>
  .cd-ind-more {
    background: #ffffff;
    padding: 80px 24px 88px 24px;
    border-top: 1px solid #e6ecf5;
  }
  .cd-ind-more__inner { max-width: 1200px; margin: 0 auto; }
  .cd-ind-more__eyebrow {
    text-align: center;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #ef6632;
    margin: 0 0 10px 0;
  }
  .cd-ind-more__title {
    text-align: center;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 2.125rem;
    font-weight: 800;
    color: #1c3370;
    letter-spacing: -0.015em;
    line-height: 1.18;
    margin: 0 auto 14px auto;
    max-width: 780px;
  }
  .cd-ind-more__divider {
    width: 56px;
    height: 3px;
    background: #ef6632;
    margin: 0 auto 22px auto;
    border-radius: 2px;
  }
  .cd-ind-more__sub {
    text-align: center;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.0625rem;
    color: #525f7f;
    line-height: 1.65;
    margin: 0 auto 48px auto;
    max-width: 720px;
  }
  .cd-ind-more__grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }
  .cd-ind-more__card {
    background: #ffffff;
    border: 1px solid #e6ecf5;
    border-radius: 12px;
    padding: 22px 20px;
    box-shadow: 0 8px 20px rgba(28,51,112,0.04);
    display: flex;
    align-items: flex-start;
    gap: 14px;
    transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
  }
  .cd-ind-more__card:hover {
    transform: translateY(-3px);
    box-shadow: 0 16px 32px rgba(28,51,112,0.10);
    border-color: #c9d6ea;
  }
  .cd-ind-more__icon {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    border-radius: 11px;
    background: linear-gradient(135deg, #25418b 0%, #1c3370 100%);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 14px rgba(28,51,112,0.18);
  }
  .cd-ind-more__card:nth-child(4n+2) .cd-ind-more__icon {
    background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%);
    box-shadow: 0 6px 14px rgba(239,102,50,0.24);
  }
  .cd-ind-more__card:nth-child(4n+3) .cd-ind-more__icon {
    background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%);
    box-shadow: 0 6px 14px rgba(58,168,86,0.24);
  }
  .cd-ind-more__card:nth-child(4n+4) .cd-ind-more__icon {
    background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%);
    box-shadow: 0 6px 14px rgba(255,183,152,0.32);
  }
  .cd-ind-more__icon .material-icons { font-size: 22px; }
  .cd-ind-more__body { flex: 1 1 auto; min-width: 0; }
  .cd-ind-more__card-title {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1rem;
    font-weight: 800;
    color: #1c3370;
    letter-spacing: -0.005em;
    line-height: 1.25;
    margin: 0 0 4px 0;
  }
  .cd-ind-more__card-desc {
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.8125rem;
    line-height: 1.55;
    color: #525f7f;
    margin: 0;
  }
  .cd-ind-more__closer {
    margin: 56px auto 0 auto;
    max-width: 880px;
    text-align: center;
    padding: 30px 36px;
    background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%);
    border-radius: 14px;
    border: 1px solid #e6ecf5;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .cd-ind-more__closer-text {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.1875rem;
    font-weight: 700;
    color: #1c3370;
    margin: 0;
    line-height: 1.4;
    letter-spacing: -0.005em;
  }
  .cd-ind-more__closer-sub {
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: #525f7f;
    margin: 0;
    max-width: 620px;
  }
  .cd-ind-more__cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: #ef6632;
    color: #ffffff;
    text-decoration: none;
    padding: 13px 26px;
    border-radius: 8px;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.9375rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    box-shadow: 0 8px 18px rgba(239,102,50,0.28);
    transition: transform .2s ease, background .2s ease, box-shadow .2s ease;
  }
  .cd-ind-more__cta-btn:hover {
    transform: translateY(-2px);
    background: #d8501e;
    box-shadow: 0 12px 24px rgba(239,102,50,0.38);
  }
  .cd-ind-more__cta-btn .material-icons { font-size: 18px; }
  @media (max-width: 1024px) {
    .cd-ind-more__grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 760px) {
    .cd-ind-more__grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
  }
  @media (max-width: 480px) {
    .cd-ind-more { padding: 60px 16px 68px 16px; }
    .cd-ind-more__title { font-size: 1.6875rem; }
    .cd-ind-more__sub { font-size: 1rem; }
    .cd-ind-more__grid { grid-template-columns: 1fr; }
    .cd-ind-more__closer { padding: 24px 22px; }
    .cd-ind-more__closer-text { font-size: 1.0625rem; }
  }
</style>
<section class="cd-ind-more">
  <div class="cd-ind-more__inner">
    <p class="cd-ind-more__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-ind-more__title" data-field="title">{{title}}</h2>
    <div class="cd-ind-more__divider"></div>
    <p class="cd-ind-more__sub" data-field="subtitle">{{subtitle}}</p>
    <div class="cd-ind-more__grid">
      <div class="cd-ind-more__card" data-repeat="industries">
        <div class="cd-ind-more__icon"><span class="material-icons" data-field="icon">{{industries.icon}}</span></div>
        <div class="cd-ind-more__body">
          <h3 class="cd-ind-more__card-title" data-field="title">{{industries.title}}</h3>
          <p class="cd-ind-more__card-desc" data-field="desc">{{industries.desc}}</p>
        </div>
      </div>
    </div>
    <div class="cd-ind-more__closer">
      <p class="cd-ind-more__closer-text" data-field="closerText">{{closerText}}</p>
      <p class="cd-ind-more__closer-sub" data-field="closerSub">{{closerSub}}</p>
      <a class="cd-ind-more__cta-btn" data-field="ctaHref" href="{{ctaHref}}">
        <span data-field="ctaLabel">{{ctaLabel}}</span>
        <span class="material-icons">arrow_forward</span>
      </a>
    </div>
  </div>
</section>
`.trim();

const MORE_DEFAULTS = {
  eyebrow: 'WE FUND MANY MORE',
  title: 'Additional industries Cardiff backs every day.',
  subtitle:
    "The ten verticals above are our most-funded categories, but they are far from the whole list. If your business runs revenue and serves customers, there is a strong chance we have funded an operator like you this quarter.",
  industries: [
    {
      icon: 'local_florist',
      title: 'Landscaping & Lawn Care',
      desc: 'Seasonal cash-flow lines, mowers, trucks, and irrigation equipment.',
    },
    {
      icon: 'child_care',
      title: 'Childcare & Daycare',
      desc: 'Payroll bridges, classroom build-outs, and licensing capital.',
    },
    {
      icon: 'print',
      title: 'Print & Sign Shops',
      desc: 'Presses, wide-format equipment, and material inventory financing.',
    },
    {
      icon: 'fitness_center',
      title: 'Gyms & Fitness Studios',
      desc: 'Equipment refresh, new locations, and member-growth working capital.',
    },
    {
      icon: 'pets',
      title: 'Veterinary & Pet Services',
      desc: 'Diagnostic gear, kennel expansions, and mobile-clinic vehicles.',
    },
    {
      icon: 'local_laundry_service',
      title: 'Laundromats & Dry Cleaners',
      desc: 'Equipment replacement, store refits, and second-location funding.',
    },
    {
      icon: 'home_repair_service',
      title: 'HVAC, Plumbing & Electrical',
      desc: 'Service vans, tools, technician hiring, and material lines.',
    },
    {
      icon: 'two_wheeler',
      title: 'Towing & Transportation',
      desc: 'Tow trucks, fleet additions, fuel cards, and dispatcher payroll.',
    },
    {
      icon: 'spa',
      title: 'Medical Spas & Wellness',
      desc: 'Lasers, injectables inventory, and luxury-room build-outs.',
    },
    {
      icon: 'liquor',
      title: 'Liquor & Convenience Stores',
      desc: 'Inventory expansion, cooler upgrades, and license acquisition.',
    },
    {
      icon: 'directions_boat',
      title: 'Marine & Recreation',
      desc: 'Boat repair lifts, slip improvements, and seasonal working capital.',
    },
    {
      icon: 'engineering',
      title: 'Specialty Trades',
      desc: 'Welders, machinists, locksmiths, and any high-skill service shop.',
    },
  ],
  closerText: "Don't see your industry?",
  closerSub:
    "We have funded operators across 700+ verticals. If you run revenue and have been in business at least six months, the application is free, won't impact your credit, and takes most owners under five minutes.",
  ctaLabel: 'Check your fit',
  ctaHref: '/apply',
};

const moreBlock = {
  id: MORE_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 999, // re-sequenced below
  html: MORE_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: MORE_DEFAULTS.eyebrow },
    { name: 'title', label: 'Title', type: 'textarea' as const, default: MORE_DEFAULTS.title },
    { name: 'subtitle', label: 'Subtitle', type: 'textarea' as const, default: MORE_DEFAULTS.subtitle },
    {
      name: 'industries',
      label: 'Industries',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const, default: '' },
        { name: 'title', label: 'Industry name', type: 'text' as const, default: '' },
        { name: 'desc', label: 'One-line description', type: 'textarea' as const, default: '' },
      ],
      default: MORE_DEFAULTS.industries,
    },
    { name: 'closerText', label: 'Closer headline', type: 'text' as const, default: MORE_DEFAULTS.closerText },
    { name: 'closerSub', label: 'Closer subtext', type: 'textarea' as const, default: MORE_DEFAULTS.closerSub },
    { name: 'ctaLabel', label: 'CTA button label', type: 'text' as const, default: MORE_DEFAULTS.ctaLabel },
    { name: 'ctaHref', label: 'CTA button href', type: 'text' as const, default: MORE_DEFAULTS.ctaHref },
  ],
  values: { ...MORE_DEFAULTS },
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
    (b: { id?: string }) => b?.id === MORE_BLOCK_ID,
  );

  let action: 'inserted' | 'updated';

  if (existingIdx !== -1) {
    const existing = parsed.blocks[existingIdx];
    parsed.blocks[existingIdx] = {
      ...existing,
      type: 'html-render',
      width: 'full',
      html: MORE_HTML,
      fields: moreBlock.fields,
      values:
        existing.values &&
        Array.isArray(existing.values.industries) &&
        existing.values.industries.length > 0
          ? existing.values
          : moreBlock.values,
    };
    action = 'updated';
  } else {
    // Insert before the how-to-apply block (falling back to FAQ, then append).
    let insertIdx = parsed.blocks.findIndex(
      (b: { id?: string }) => b?.id === APPLY_BLOCK_ID,
    );
    if (insertIdx === -1) {
      insertIdx = parsed.blocks.findIndex(
        (b: { id?: string }) => b?.id === FAQ_BLOCK_ID,
      );
    }
    if (insertIdx === -1) {
      parsed.blocks.push(moreBlock);
    } else {
      parsed.blocks.splice(insertIdx, 0, moreBlock);
    }
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
    `Post ${POST_ID}: ${action} "${MORE_BLOCK_ID}" 12-card additional-industries grid. Block count now: ${parsed.blocks.length}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
