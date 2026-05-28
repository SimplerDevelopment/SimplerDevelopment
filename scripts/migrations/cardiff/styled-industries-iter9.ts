/**
 * Iter 9: Industries hub (post id 818) — insert a fast-scan "industries
 * directory" tile grid BETWEEN trust (idx 1) and the 10 long-form industry
 * strips (idx 2).
 *
 * Iters 1-8 built: hero -> trust -> 10 alternating strips -> 12-card more
 * grid -> how-to-apply -> faq. Today the only way for a visitor who already
 * knows their vertical to land on the right dedicated industry page (e.g.
 * /industries-trucking, /industries-medical, /agriculture) is to scroll
 * 10 long alternating strips and click a small inline heading link. There
 * is no skim layer above the fold.
 *
 * This iter inserts ONE new block — `industries-directory` (html-render) —
 * a centered 4x2 icon-tile grid surfacing the 8 dedicated vertical pages
 * that already exist on this site (Restaurants, Trucking, Auto Repair,
 * Medical, Retail, Construction, Beauty-Salon, Agriculture). Each tile is
 * a real anchor link to the internal slug (not the external cardiff.co
 * URL), with Material Icon chip + name + 1-line teaser + caret.
 *
 * Pattern note: per the renderer quirk, `data-repeat` on a grid container
 * collapses to 1-col. We hard-code 8 sibling tiles inside the grid wrapper
 * (same recipe as styled-equipment-leasing-iter3) so the editor can still
 * field-edit each tile (icon/title/teaser/href) but the layout stays 4-col
 * on desktop, 2-col tablet, 1-col mobile.
 *
 * New flow:
 *   hero -> trust -> DIRECTORY -> strips -> more -> apply -> faq
 *
 * Brand palette only (#1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798),
 * Material Icons (no emojis), Raleway titles, Open Sans body. All links
 * point to existing internal slugs on websiteId 405.
 *
 * Idempotent: detects existing `industries-directory` by id; rewrites html
 * + fields (preserving user-edited values whenever the field shape is
 * intact), otherwise inserts before the strips block (falls back to before
 * more, then apply, then faq, then append). Re-sequences `order` across
 * all blocks so the editor stays tidy. Safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 818;
const DIRECTORY_BLOCK_ID = 'industries-directory';
const STRIPS_BLOCK_ID = 'industries-strips';
const MORE_BLOCK_ID = 'industries-more';
const APPLY_BLOCK_ID = 'industries-how-to-apply';
const FAQ_BLOCK_ID = 'industries-faq';

const DIRECTORY_HTML = `
<style>
  .cd-ind-dir {
    background: #ffffff;
    padding: 84px 24px 92px 24px;
    border-top: 1px solid #e6ecf5;
  }
  .cd-ind-dir__inner { max-width: 1200px; margin: 0 auto; }
  .cd-ind-dir__eyebrow {
    text-align: center;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #ef6632;
    margin: 0 0 10px 0;
  }
  .cd-ind-dir__title {
    text-align: center;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 2.25rem;
    font-weight: 800;
    color: #1c3370;
    letter-spacing: -0.015em;
    line-height: 1.18;
    margin: 0 auto 14px auto;
    max-width: 820px;
  }
  .cd-ind-dir__divider {
    width: 56px;
    height: 3px;
    background: #ef6632;
    margin: 0 auto 22px auto;
    border-radius: 2px;
  }
  .cd-ind-dir__sub {
    text-align: center;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.0625rem;
    color: #525f7f;
    line-height: 1.65;
    margin: 0 auto 52px auto;
    max-width: 760px;
  }
  .cd-ind-dir__grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 22px;
  }
  .cd-ind-dir__tile {
    background: #ffffff;
    border: 1px solid #e6ecf5;
    border-radius: 14px;
    padding: 28px 24px 26px 24px;
    box-shadow: 0 10px 24px rgba(28,51,112,0.05);
    display: flex;
    flex-direction: column;
    text-decoration: none;
    color: inherit;
    position: relative;
    transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
  }
  .cd-ind-dir__tile:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 40px rgba(28,51,112,0.12);
    border-color: #c9d6ea;
  }
  .cd-ind-dir__tile:hover .cd-ind-dir__caret { transform: translateX(4px); color: #ef6632; }
  .cd-ind-dir__icon {
    width: 52px;
    height: 52px;
    border-radius: 13px;
    background: linear-gradient(135deg, #25418b 0%, #1c3370 100%);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 0 18px 0;
    box-shadow: 0 8px 18px rgba(28,51,112,0.22);
  }
  .cd-ind-dir__tile:nth-child(4n+2) .cd-ind-dir__icon {
    background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%);
    box-shadow: 0 8px 18px rgba(239,102,50,0.28);
  }
  .cd-ind-dir__tile:nth-child(4n+3) .cd-ind-dir__icon {
    background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%);
    box-shadow: 0 8px 18px rgba(58,168,86,0.28);
  }
  .cd-ind-dir__tile:nth-child(4n+4) .cd-ind-dir__icon {
    background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%);
    box-shadow: 0 8px 18px rgba(255,183,152,0.34);
  }
  .cd-ind-dir__icon .material-icons { font-size: 26px; }
  .cd-ind-dir__name {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.1875rem;
    font-weight: 800;
    color: #1c3370;
    letter-spacing: -0.005em;
    line-height: 1.22;
    margin: 0 0 8px 0;
  }
  .cd-ind-dir__teaser {
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.875rem;
    line-height: 1.6;
    color: #525f7f;
    margin: 0 0 18px 0;
    flex: 1 1 auto;
  }
  .cd-ind-dir__cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.8125rem;
    font-weight: 800;
    color: #25418b;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .cd-ind-dir__caret {
    transition: transform .2s ease, color .2s ease;
  }
  .cd-ind-dir__caret .material-icons { font-size: 16px; }
  .cd-ind-dir__footnote {
    margin: 48px auto 0 auto;
    max-width: 720px;
    text-align: center;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.9375rem;
    color: #525f7f;
    line-height: 1.65;
  }
  .cd-ind-dir__footnote a {
    color: #ef6632;
    font-weight: 700;
    text-decoration: none;
    border-bottom: 1px solid rgba(239,102,50,0.35);
    padding-bottom: 1px;
  }
  .cd-ind-dir__footnote a:hover {
    color: #d8501e;
    border-bottom-color: #d8501e;
  }
  @media (max-width: 1024px) {
    .cd-ind-dir__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-ind-dir { padding: 64px 16px 72px 16px; }
    .cd-ind-dir__title { font-size: 1.75rem; }
    .cd-ind-dir__sub { font-size: 1rem; }
    .cd-ind-dir__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-ind-dir__tile { padding: 24px 22px; }
  }
</style>
<section class="cd-ind-dir">
  <div class="cd-ind-dir__inner">
    <p class="cd-ind-dir__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-ind-dir__title" data-field="title">{{title}}</h2>
    <div class="cd-ind-dir__divider"></div>
    <p class="cd-ind-dir__sub" data-field="subtitle">{{subtitle}}</p>
    <div class="cd-ind-dir__grid">
      <a class="cd-ind-dir__tile" href="{{t1Href}}">
        <div class="cd-ind-dir__icon"><span class="material-icons" data-field="t1Icon">{{t1Icon}}</span></div>
        <h3 class="cd-ind-dir__name" data-field="t1Name">{{t1Name}}</h3>
        <p class="cd-ind-dir__teaser" data-field="t1Teaser">{{t1Teaser}}</p>
        <span class="cd-ind-dir__cta"><span data-field="t1Cta">{{t1Cta}}</span><span class="cd-ind-dir__caret"><span class="material-icons">arrow_forward</span></span></span>
      </a>
      <a class="cd-ind-dir__tile" href="{{t2Href}}">
        <div class="cd-ind-dir__icon"><span class="material-icons" data-field="t2Icon">{{t2Icon}}</span></div>
        <h3 class="cd-ind-dir__name" data-field="t2Name">{{t2Name}}</h3>
        <p class="cd-ind-dir__teaser" data-field="t2Teaser">{{t2Teaser}}</p>
        <span class="cd-ind-dir__cta"><span data-field="t2Cta">{{t2Cta}}</span><span class="cd-ind-dir__caret"><span class="material-icons">arrow_forward</span></span></span>
      </a>
      <a class="cd-ind-dir__tile" href="{{t3Href}}">
        <div class="cd-ind-dir__icon"><span class="material-icons" data-field="t3Icon">{{t3Icon}}</span></div>
        <h3 class="cd-ind-dir__name" data-field="t3Name">{{t3Name}}</h3>
        <p class="cd-ind-dir__teaser" data-field="t3Teaser">{{t3Teaser}}</p>
        <span class="cd-ind-dir__cta"><span data-field="t3Cta">{{t3Cta}}</span><span class="cd-ind-dir__caret"><span class="material-icons">arrow_forward</span></span></span>
      </a>
      <a class="cd-ind-dir__tile" href="{{t4Href}}">
        <div class="cd-ind-dir__icon"><span class="material-icons" data-field="t4Icon">{{t4Icon}}</span></div>
        <h3 class="cd-ind-dir__name" data-field="t4Name">{{t4Name}}</h3>
        <p class="cd-ind-dir__teaser" data-field="t4Teaser">{{t4Teaser}}</p>
        <span class="cd-ind-dir__cta"><span data-field="t4Cta">{{t4Cta}}</span><span class="cd-ind-dir__caret"><span class="material-icons">arrow_forward</span></span></span>
      </a>
      <a class="cd-ind-dir__tile" href="{{t5Href}}">
        <div class="cd-ind-dir__icon"><span class="material-icons" data-field="t5Icon">{{t5Icon}}</span></div>
        <h3 class="cd-ind-dir__name" data-field="t5Name">{{t5Name}}</h3>
        <p class="cd-ind-dir__teaser" data-field="t5Teaser">{{t5Teaser}}</p>
        <span class="cd-ind-dir__cta"><span data-field="t5Cta">{{t5Cta}}</span><span class="cd-ind-dir__caret"><span class="material-icons">arrow_forward</span></span></span>
      </a>
      <a class="cd-ind-dir__tile" href="{{t6Href}}">
        <div class="cd-ind-dir__icon"><span class="material-icons" data-field="t6Icon">{{t6Icon}}</span></div>
        <h3 class="cd-ind-dir__name" data-field="t6Name">{{t6Name}}</h3>
        <p class="cd-ind-dir__teaser" data-field="t6Teaser">{{t6Teaser}}</p>
        <span class="cd-ind-dir__cta"><span data-field="t6Cta">{{t6Cta}}</span><span class="cd-ind-dir__caret"><span class="material-icons">arrow_forward</span></span></span>
      </a>
      <a class="cd-ind-dir__tile" href="{{t7Href}}">
        <div class="cd-ind-dir__icon"><span class="material-icons" data-field="t7Icon">{{t7Icon}}</span></div>
        <h3 class="cd-ind-dir__name" data-field="t7Name">{{t7Name}}</h3>
        <p class="cd-ind-dir__teaser" data-field="t7Teaser">{{t7Teaser}}</p>
        <span class="cd-ind-dir__cta"><span data-field="t7Cta">{{t7Cta}}</span><span class="cd-ind-dir__caret"><span class="material-icons">arrow_forward</span></span></span>
      </a>
      <a class="cd-ind-dir__tile" href="{{t8Href}}">
        <div class="cd-ind-dir__icon"><span class="material-icons" data-field="t8Icon">{{t8Icon}}</span></div>
        <h3 class="cd-ind-dir__name" data-field="t8Name">{{t8Name}}</h3>
        <p class="cd-ind-dir__teaser" data-field="t8Teaser">{{t8Teaser}}</p>
        <span class="cd-ind-dir__cta"><span data-field="t8Cta">{{t8Cta}}</span><span class="cd-ind-dir__caret"><span class="material-icons">arrow_forward</span></span></span>
      </a>
    </div>
    <p class="cd-ind-dir__footnote" data-field="footnote">{{footnote}}</p>
  </div>
</section>
`.trim();

// Tiles map 1:1 to dedicated vertical pages that already exist on websiteId 405.
const DIRECTORY_DEFAULTS = {
  eyebrow: 'PICK YOUR VERTICAL',
  title: 'Find the loan program built for your industry.',
  subtitle:
    'Every Cardiff industry program is tuned to the cash-flow rhythm, equipment cycle, and seasonal pressure of that specific vertical. Jump straight to your industry below — or scroll down for the long version.',
  // Tile 1 — Restaurants
  t1Icon: 'restaurant',
  t1Name: 'Restaurants',
  t1Teaser: 'Working capital, equipment, and renovation loans tuned to thin restaurant margins.',
  t1Cta: 'See restaurant loans',
  t1Href: '/industries-restaurants',
  // Tile 2 — Trucking
  t2Icon: 'local_shipping',
  t2Name: 'Trucking',
  t2Teaser: 'Fuel, repair, payroll, and tractor financing for owner-operators and fleets.',
  t2Cta: 'See trucking loans',
  t2Href: '/industries-trucking',
  // Tile 3 — Auto Repair
  t3Icon: 'build',
  t3Name: 'Auto Repair',
  t3Teaser: 'Lifts, diagnostics, technician hiring, and parts inventory funding for shops.',
  t3Cta: 'See auto repair loans',
  t3Href: '/industries-auto-repair',
  // Tile 4 — Medical & Healthcare
  t4Icon: 'medical_services',
  t4Name: 'Medical & Healthcare',
  t4Teaser: 'Practice expansion, equipment, payroll bridges, and clinic build-out capital.',
  t4Cta: 'See medical loans',
  t4Href: '/industries-medical',
  // Tile 5 — Retail
  t5Icon: 'storefront',
  t5Name: 'Retail',
  t5Teaser: 'Inventory, POS, store fit-out, and seasonal working-capital lines for retailers.',
  t5Cta: 'See retail loans',
  t5Href: '/industries-retail',
  // Tile 6 — Construction
  t6Icon: 'engineering',
  t6Name: 'Construction',
  t6Teaser: 'Bridge capital, equipment financing, and payroll lines for contractors.',
  t6Cta: 'See construction loans',
  t6Href: '/industries-construction',
  // Tile 7 — Beauty Salon
  t7Icon: 'content_cut',
  t7Name: 'Beauty Salons',
  t7Teaser: 'Chair financing, suite buildouts, team hiring, and product inventory loans.',
  t7Cta: 'See salon loans',
  t7Href: '/industries-beauty-salon',
  // Tile 8 — Agriculture
  t8Icon: 'agriculture',
  t8Name: 'Agriculture',
  t8Teaser: 'Equipment, livestock, seed, and seasonal cash-flow lines for farms and ranches.',
  t8Cta: 'See agriculture loans',
  t8Href: '/agriculture',
  footnote:
    "Don't see your vertical? Cardiff funds operators across <a href=\"#more-industries\">700+ industries</a> — or just <a href=\"/apply\">start your free application</a> and we'll match you to the right program in minutes.",
};

const directoryBlock = {
  id: DIRECTORY_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 999, // re-sequenced below
  html: DIRECTORY_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: DIRECTORY_DEFAULTS.eyebrow },
    { name: 'title', label: 'Title', type: 'textarea' as const, default: DIRECTORY_DEFAULTS.title },
    { name: 'subtitle', label: 'Subtitle', type: 'textarea' as const, default: DIRECTORY_DEFAULTS.subtitle },
    // 8 tiles × 5 fields each (icon, name, teaser, cta, href)
    ...Array.from({ length: 8 }, (_, i) => i + 1).flatMap((n) => [
      { name: `t${n}Icon`, label: `Tile ${n} — Material icon`, type: 'text' as const, default: '' },
      { name: `t${n}Name`, label: `Tile ${n} — Industry name`, type: 'text' as const, default: '' },
      { name: `t${n}Teaser`, label: `Tile ${n} — One-line teaser`, type: 'textarea' as const, default: '' },
      { name: `t${n}Cta`, label: `Tile ${n} — CTA label`, type: 'text' as const, default: '' },
      { name: `t${n}Href`, label: `Tile ${n} — Internal href`, type: 'text' as const, default: '' },
    ]),
    { name: 'footnote', label: 'Footnote (HTML allowed)', type: 'textarea' as const, default: DIRECTORY_DEFAULTS.footnote },
  ],
  values: { ...DIRECTORY_DEFAULTS },
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
    (b: { id?: string }) => b?.id === DIRECTORY_BLOCK_ID,
  );

  let action: 'inserted' | 'updated';

  if (existingIdx !== -1) {
    const existing = parsed.blocks[existingIdx];
    // Preserve user-edited values when shape is intact (all 8 tiles have a Name).
    const valuesShapeIntact =
      existing.values &&
      typeof existing.values === 'object' &&
      Array.from({ length: 8 }, (_, i) => i + 1).every(
        (n) =>
          typeof existing.values[`t${n}Name`] === 'string' &&
          existing.values[`t${n}Name`].length > 0,
      );
    parsed.blocks[existingIdx] = {
      ...existing,
      type: 'html-render',
      width: 'full',
      html: DIRECTORY_HTML,
      fields: directoryBlock.fields,
      values: valuesShapeIntact ? existing.values : directoryBlock.values,
    };
    action = 'updated';
  } else {
    // Insert before strips; fall back to before more, apply, faq, then append.
    const insertBeforeIds = [
      STRIPS_BLOCK_ID,
      MORE_BLOCK_ID,
      APPLY_BLOCK_ID,
      FAQ_BLOCK_ID,
    ];
    let insertIdx = -1;
    for (const id of insertBeforeIds) {
      insertIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === id);
      if (insertIdx !== -1) break;
    }
    if (insertIdx === -1) {
      parsed.blocks.push(directoryBlock);
    } else {
      parsed.blocks.splice(insertIdx, 0, directoryBlock);
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
    `Post ${POST_ID}: ${action} "${DIRECTORY_BLOCK_ID}" 8-tile industries directory grid. Block count now: ${parsed.blocks.length}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
