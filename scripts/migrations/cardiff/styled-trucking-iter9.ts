/**
 * Iter 9 — post 817 (Industries · Trucking).
 *
 * Iters 1-8 covered hero, intro+stats, qualification matrix, loan-product
 * options grid, customer reviews, why-Cardiff, FAQ accordion, trust strip,
 * and final CTA. Audit of the assembled page (skimmed with `bun -e`) shows
 * one remaining content gap that every peer industry page (e.g. post 805
 * auto-repair `sec-6-uses-grid`) carries but trucking does not: a
 * "What Can You Fund with a Trucking Loan?" uses-grid that translates the
 * abstract loan-type list (sec-2) into concrete buyable line items
 * (trucks, trailers, fuel cards, ELDs, maintenance, insurance, drivers,
 * permits). That bridge between loan-types and social-proof is what
 * converts intent — without it the page asks the reader to invent their
 * own use case between sec-2 and sec-3.
 *
 * Fix: insert a new section `sec-uses` between `sec-2` (loan products)
 * and `sec-3` (reviews). Reuses the icon-card grid pattern from
 * scripts/migrations/cardiff/styled-equipment-leasing-iter3.ts:
 *   - section wrapper with centered H2 + orange rule
 *   - html-render child with a `data-repeat="uses"` 4-col card grid on a
 *     light-blue band; inside the repeat we reference `{{uses.field}}`
 *     so editors can add/remove use cases without touching this script
 *   - each card has a circular Material-Icon chip, title, and short copy
 *
 * Idempotent: re-running replaces any existing `sec-uses` in place;
 * otherwise splices it directly after `sec-2`.
 *
 * Brand palette only: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798.
 * Raleway + Open Sans. No emojis (Material Icons).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const NEW_SECTION_ID = 'sec-uses';
const ANCHOR_AFTER_ID = 'sec-2';

const USES_HTML = `
<style>
  .cd-trk-uses { max-width: 1140px; margin: 0 auto; }
  .cd-trk-uses__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 44px auto; }
  .cd-trk-uses__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-trk-uses__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 28px 24px; box-shadow: 0 10px 28px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-trk-uses__card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.12); }
  .cd-trk-uses__icon { width: 54px; height: 54px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-trk-uses__card:nth-child(4n+2) .cd-trk-uses__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-trk-uses__card:nth-child(4n+3) .cd-trk-uses__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-trk-uses__card:nth-child(4n) .cd-trk-uses__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.22); }
  .cd-trk-uses__icon .material-icons { font-size: 28px; }
  .cd-trk-uses__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-trk-uses__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-trk-uses__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 30px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-trk-uses__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 1080px) {
    .cd-trk-uses__grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 820px) {
    .cd-trk-uses__grid { grid-template-columns: repeat(2, 1fr); gap: 18px; }
  }
  @media (max-width: 520px) {
    .cd-trk-uses__grid { grid-template-columns: 1fr; }
    .cd-trk-uses__card { padding: 24px 22px; }
    .cd-trk-uses__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-trk-uses">
  <p class="cd-trk-uses__intro" data-field="intro">{{intro}}</p>
  <div class="cd-trk-uses__grid">
    <div class="cd-trk-uses__card" data-repeat="uses">
      <div class="cd-trk-uses__icon"><span class="material-icons">{{uses.icon}}</span></div>
      <h3 class="cd-trk-uses__card-title">{{uses.title}}</h3>
      <p class="cd-trk-uses__card-desc">{{uses.desc}}</p>
    </div>
  </div>
  <div class="cd-trk-uses__closer">
    <p class="cd-trk-uses__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const USES_DEFAULTS = {
  intro:
    "From the rig itself to the small line items that keep wheels turning, a Cardiff trucking loan covers the full operating picture — not just the headline purchase.",
  uses: [
    {
      icon: 'local_shipping',
      title: 'Trucks & Tractors',
      desc: 'Down payments or full purchases on new or used Class 8 tractors, day cabs, and sleepers — including upgrades to newer, more fuel-efficient models.',
    },
    {
      icon: 'rv_hookup',
      title: 'Trailers & Specialty Equipment',
      desc: 'Reefers, flatbeds, dry vans, dump trailers, and specialty equipment that lets you bid on higher-margin loads without parking the rest of the fleet.',
    },
    {
      icon: 'local_gas_station',
      title: 'Fuel & Operating Costs',
      desc: 'Cover fuel cards, IFTA, tolls, and parking between settlements so a slow-pay broker never forces you to skip a load you already booked.',
    },
    {
      icon: 'build',
      title: 'Maintenance & Repairs',
      desc: 'Tires, engine rebuilds, brake jobs, DPF service, and roadside emergencies — fund the repair today, repay it across the months it earns you back.',
    },
    {
      icon: 'memory',
      title: 'ELDs & Telematics',
      desc: 'FMCSA-compliant electronic logging devices, dashcams, and fleet-management software that lower your insurance premium and protect your CSA score.',
    },
    {
      icon: 'health_and_safety',
      title: 'Insurance & Bonding',
      desc: 'Down payments on primary auto liability, cargo, and physical-damage policies — including renewals when premiums spike at the start of a new term.',
    },
    {
      icon: 'badge',
      title: 'Drivers & Payroll',
      desc: 'Sign-on bonuses, recruiting, CDL training reimbursement, and payroll runs that keep your best drivers seated when freight markets tighten.',
    },
    {
      icon: 'description',
      title: 'Permits & Compliance',
      desc: 'IRP plates, oversize permits, DOT renewals, and drug-and-alcohol consortium fees — the unglamorous costs that keep your authority active.',
    },
  ],
  closer:
    'If a cost is part of running your trucking business, Cardiff can usually fund it — talk to a specialist about pairing the right product to the right use.',
} as const;

const usesBlock = {
  id: 'sec-uses-grid',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: USES_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: USES_DEFAULTS.intro },
    {
      name: 'uses',
      label: 'Use cases',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text', default: 'local_shipping' },
        { name: 'title', label: 'Title', type: 'text', default: '' },
        { name: 'desc', label: 'Description', type: 'textarea', default: '' },
      ],
      default: USES_DEFAULTS.uses,
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: USES_DEFAULTS.closer },
  ],
  values: {
    intro: USES_DEFAULTS.intro,
    uses: USES_DEFAULTS.uses.map((u) => ({ ...u })),
    closer: USES_DEFAULTS.closer,
  },
};

function buildUsesSection() {
  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-uses-title',
    order: 1,
    level: 2,
    content: 'What Can You Fund with a Trucking Loan?',
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
    id: 'sec-uses-div',
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
    blocks: [headerBlock, dividerBlock, usesBlock],
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

  const newSection = buildUsesSection();
  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === NEW_SECTION_ID);
  if (existingIdx !== -1) {
    parsed.blocks[existingIdx] = newSection;
    console.log(`Post ${POST_ID}: rewrote existing ${NEW_SECTION_ID} (idx ${existingIdx}).`);
  } else {
    const anchorIdx = parsed.blocks.findIndex((b: any) => b?.id === ANCHOR_AFTER_ID);
    const insertAt = anchorIdx === -1 ? parsed.blocks.length : anchorIdx + 1;
    parsed.blocks.splice(insertAt, 0, newSection);
    console.log(`Post ${POST_ID}: inserted ${NEW_SECTION_ID} at idx ${insertAt} (after ${ANCHOR_AFTER_ID}).`);
  }

  // Re-number top-level order to match positions.
  parsed.blocks.forEach((b: any, i: number) => {
    if (b && typeof b === 'object') b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: uses-grid in place between ${ANCHOR_AFTER_ID} and sec-3.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
