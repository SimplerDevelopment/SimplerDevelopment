/**
 * Iter 11 — post 817 (Industries · Trucking).
 *
 * Iters 1-10 covered hero, intro+stats, qualification matrix, loan-product
 * options grid (sec-2), what-can-you-fund uses grid (sec-uses), persona
 * band (sec-who, iter10), reviews, why-Cardiff, FAQ, trust strip, final CTA.
 *
 * Skim of post 817 against peer industry pages (805 auto-repair sec-9
 * "Choosing the Right Type of Funding for Your Goal", 806 construction
 * sec-9 "How to Choose the Right Financing Option", 807 contracting
 * sec-6 "The Right Funding Structure for Your Goals") reveals the one
 * remaining structural gap: there is no decision-guide that bridges
 * the persona band (sec-who, "who is this for?") to the product band
 * (sec-2, "what are the products?"). The reader is told who Cardiff
 * funds and what products exist, but not which product matches which
 * real-world trucking scenario. Peers carry this beat and trucking
 * does not.
 *
 * Without the decision-guide, an owner-operator buying their second
 * tractor and a regional fleet refinancing equipment debt are left to
 * guess which of the four products in sec-2 (Short-Term, LOC, Equipment,
 * SBA) fits — and many bounce to a competitor that just tells them.
 *
 * Fix: insert a new section `sec-match` immediately after `sec-who`
 * (persona band) and before `sec-3` (reviews). Reuses the icon-card
 * grid pattern from scripts/migrations/cardiff/styled-equipment-leasing-
 * iter3.ts but driven by `data-repeat="scenarios"` so the matcher is
 * editable from the visual editor. Each card pairs a real trucking
 * scenario (the "if you...") with the Cardiff product that fits (the
 * "...choose this") and one line of why.
 *
 * Idempotent: re-running replaces any existing `sec-match` in place;
 * otherwise splices it directly after `sec-who` (anchor) and re-numbers
 * top-level `order` to match the new positions.
 *
 * Sits on a soft blue-tinted band (#f6f9fc) to contrast iter10's white
 * sec-who directly above and sec-3 reviews (also #f6f9fc) below — we
 * push sec-3 to white in this iter to maintain the alternating rhythm.
 *
 * Brand palette only: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798.
 * Raleway + Open Sans. No emojis (Material Icons).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const NEW_SECTION_ID = 'sec-match';
const ANCHOR_AFTER_ID = 'sec-who';
const NEXT_SECTION_ID = 'sec-3';

const MATCH_HTML = `
<style>
  .cd-trk-match { max-width: 1140px; margin: 0 auto; }
  .cd-trk-match__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 800px; margin: 0 auto 44px auto; }
  .cd-trk-match__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px; }
  .cd-trk-match__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 30px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: grid; grid-template-columns: 64px 1fr; gap: 22px; align-items: start; position: relative; overflow: hidden; }
  .cd-trk-match__card:hover { transform: translateY(-3px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-trk-match__card::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 4px; background: linear-gradient(180deg, #25418b 0%, #1c3370 100%); }
  .cd-trk-match__card:nth-child(4n+2)::before { background: linear-gradient(180deg, #ef6632 0%, #d8501e 100%); }
  .cd-trk-match__card:nth-child(4n+3)::before { background: linear-gradient(180deg, #5ac96f 0%, #3aa856 100%); }
  .cd-trk-match__card:nth-child(4n)::before { background: linear-gradient(180deg, #ffb798 0%, #ef6632 100%); }
  .cd-trk-match__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-trk-match__card:nth-child(4n+2) .cd-trk-match__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-trk-match__card:nth-child(4n+3) .cd-trk-match__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-trk-match__card:nth-child(4n) .cd-trk-match__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.32); }
  .cd-trk-match__icon .material-icons { font-size: 28px; }
  .cd-trk-match__body { min-width: 0; }
  .cd-trk-match__scenario { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78125rem; font-weight: 700; color: #ef6632; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 6px 0; }
  .cd-trk-match__product { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.28; }
  .cd-trk-match__why { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-trk-match__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-trk-match__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 820px) {
    .cd-trk-match__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-trk-match__card { padding: 26px 22px; grid-template-columns: 52px 1fr; gap: 18px; }
    .cd-trk-match__icon { width: 52px; height: 52px; }
    .cd-trk-match__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-trk-match">
  <p class="cd-trk-match__intro" data-field="intro">{{intro}}</p>
  <div class="cd-trk-match__grid">
    <div class="cd-trk-match__card" data-repeat="scenarios">
      <div class="cd-trk-match__icon"><span class="material-icons">{{scenarios.icon}}</span></div>
      <div class="cd-trk-match__body">
        <p class="cd-trk-match__scenario">{{scenarios.scenario}}</p>
        <h3 class="cd-trk-match__product">{{scenarios.product}}</h3>
        <p class="cd-trk-match__why">{{scenarios.why}}</p>
      </div>
    </div>
  </div>
  <div class="cd-trk-match__closer">
    <p class="cd-trk-match__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const MATCH_DEFAULTS = {
  intro:
    "Trucking financing isn't one-size-fits-all — the right Cardiff product depends on what you're actually trying to do this quarter. Use this matcher to find the structure that fits your scenario, then talk to a specialist to confirm.",
  scenarios: [
    {
      icon: 'local_shipping',
      scenario: 'If you’re buying a tractor or trailer',
      product: 'Equipment Financing',
      why: 'The truck itself secures the loan, so approval is easier and rates stay competitive. Terms match the useful life of the equipment — typically 3 to 7 years.',
    },
    {
      icon: 'sync_alt',
      scenario: 'If you’re waiting on broker payments',
      product: 'Business Line of Credit',
      why: 'Draw what you need to cover fuel, payroll, and tolls between settlements, then pay it back as invoices clear. Only pay interest on what you actually use.',
    },
    {
      icon: 'bolt',
      scenario: 'If you need cash this week',
      product: 'Short-Term Loan',
      why: 'Lump-sum funding with same-day decisions for urgent repairs, a sudden contract win, or a driver you can’t afford to lose. Fixed daily or weekly payments.',
    },
    {
      icon: 'account_balance',
      scenario: 'If you’re expanding the terminal',
      product: 'SBA Loan',
      why: 'Larger amounts, lower rates, and longer repayment terms for real estate, major fleet expansion, or refinancing existing equipment debt into one payment.',
    },
    {
      icon: 'trending_up',
      scenario: 'If credit is rebuilding but revenue is strong',
      product: 'Revenue-Based Lending',
      why: 'Approval is based on your monthly deposits, not your FICO score. Repayments flex with your settlement volume so a slow week doesn’t become a missed payment.',
    },
    {
      icon: 'inventory_2',
      scenario: 'If you hold a DSP or last-mile contract',
      product: 'Equipment + Working Capital',
      why: 'Finance Sprinter vans and box trucks against the contract you already hold, with a working-capital line to bridge weekly payroll until the contract pays.',
    },
  ],
  closer:
    'Most trucking operators end up combining two of these structures — equipment financing for the rigs plus a line of credit for the operating gap. Cardiff specialists structure both in one conversation.',
} as const;

const matchBlock = {
  id: 'sec-match-grid',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: MATCH_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: MATCH_DEFAULTS.intro },
    {
      name: 'scenarios',
      label: 'Scenario-to-product matches',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text', default: 'local_shipping' },
        { name: 'scenario', label: 'Scenario (the "if you...")', type: 'text', default: '' },
        { name: 'product', label: 'Matching Cardiff product', type: 'text', default: '' },
        { name: 'why', label: 'Why this fits', type: 'textarea', default: '' },
      ],
      default: MATCH_DEFAULTS.scenarios,
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: MATCH_DEFAULTS.closer },
  ],
  values: {
    intro: MATCH_DEFAULTS.intro,
    scenarios: MATCH_DEFAULTS.scenarios.map((s) => ({ ...s })),
    closer: MATCH_DEFAULTS.closer,
  },
};

function buildMatchSection() {
  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-match-title',
    order: 1,
    level: 2,
    content: 'Match Your Scenario to the Right Loan',
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
    type: 'text' as const,
    id: 'sec-match-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  return {
    id: NEW_SECTION_ID,
    type: 'section' as const,
    maxWidth: '1240px',
    style: {
      backgroundColor: '#f6f9fc',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, matchBlock],
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

  const newSection = buildMatchSection();
  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === NEW_SECTION_ID);
  if (existingIdx !== -1) {
    parsed.blocks[existingIdx] = newSection;
    console.log(`Post ${POST_ID}: rewrote existing ${NEW_SECTION_ID} (idx ${existingIdx}).`);
  } else {
    const anchorIdx = parsed.blocks.findIndex((b: any) => b?.id === ANCHOR_AFTER_ID);
    const insertAt = anchorIdx === -1 ? parsed.blocks.length : anchorIdx + 1;
    parsed.blocks.splice(insertAt, 0, newSection);
    console.log(
      `Post ${POST_ID}: inserted ${NEW_SECTION_ID} at idx ${insertAt} (after ${ANCHOR_AFTER_ID}).`
    );
  }

  // Push sec-3 (reviews) to white so the alternating rhythm holds:
  // sec-uses(#f6f9fc) -> sec-who(#fff) -> sec-match(#f6f9fc) -> sec-3(#fff).
  // Idempotent: just sets backgroundColor on sec-3 if it exists.
  const sec3 = parsed.blocks.find((b: any) => b?.id === NEXT_SECTION_ID);
  if (sec3 && sec3.type === 'section') {
    sec3.style = { ...(sec3.style || {}), backgroundColor: '#ffffff' };
  }

  // Re-number top-level order to match positions.
  parsed.blocks.forEach((b: any, i: number) => {
    if (b && typeof b === 'object') b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: scenario-to-product matcher in place between ${ANCHOR_AFTER_ID} and ${NEXT_SECTION_ID}.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
