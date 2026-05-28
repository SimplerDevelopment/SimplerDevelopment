/**
 * Iter 10 — post 817 (Industries · Trucking).
 *
 * Iters 1-9 covered hero, intro+stats, qualification matrix, loan-product
 * options grid, what-can-you-fund uses grid, customer reviews, why-Cardiff,
 * FAQ accordion, trust strip, and final CTA. Audit of the assembled page
 * (skimmed with `bun -e`) against peer industry pages reveals one remaining
 * structural gap: there is no "audience / persona" band that tells the
 * reader which kinds of trucking operators these loans are actually built
 * for. Every other peer carries this beat — auto-repair (post 805) has
 * "Who Uses Auto Repair Business Loans?" (sec-5), construction (806) has
 * "The Contractors That Benefit From Financing", contracting (807) has
 * "Who Contractor Financing Helps", hospitality (810) breaks down the
 * sub-industries it serves. Trucking jumps from "what can you fund" (uses)
 * straight into reviews without ever naming the operator.
 *
 * Without the persona band, an owner-operator with one truck and a 100-unit
 * regional carrier both have to imagine themselves into the same generic
 * pitch — and many bounce. This iter inserts a 6-card persona grid between
 * `sec-uses` (uses-grid) and `sec-3` (reviews) so the reader can self-
 * identify before the social-proof hits.
 *
 * Fix: insert a new section `sec-who` immediately after `sec-uses`.
 * Reuses the icon-card grid pattern from
 * scripts/migrations/cardiff/styled-equipment-leasing-iter3.ts and the
 * sibling trucking iter9 — section wrapper with centered H2 + orange rule,
 * then an html-render child carrying a `data-repeat="personas"` grid on a
 * white band (to contrast iter9's blue band sitting directly above it).
 * Each card has a circular Material-Icon chip, persona title, and short
 * copy describing how Cardiff structures the loan for that operator.
 *
 * Idempotent: re-running replaces any existing `sec-who` in place;
 * otherwise splices it directly after `sec-uses` (anchor) and re-numbers
 * top-level `order` to match the new positions.
 *
 * Brand palette only: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798.
 * Raleway + Open Sans. No emojis (Material Icons).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const NEW_SECTION_ID = 'sec-who';
const ANCHOR_AFTER_ID = 'sec-uses';

const WHO_HTML = `
<style>
  .cd-trk-who { max-width: 1140px; margin: 0 auto; }
  .cd-trk-who__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 44px auto; }
  .cd-trk-who__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-trk-who__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .cd-trk-who__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-trk-who__card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #25418b 0%, #1c3370 100%); }
  .cd-trk-who__card:nth-child(3n+2)::before { background: linear-gradient(90deg, #ef6632 0%, #d8501e 100%); }
  .cd-trk-who__card:nth-child(3n)::before { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }
  .cd-trk-who__icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: #eaf1fb; color: #25418b; }
  .cd-trk-who__card:nth-child(3n+2) .cd-trk-who__icon { background: #fdeae0; color: #ef6632; }
  .cd-trk-who__card:nth-child(3n) .cd-trk-who__icon { background: #e6f7eb; color: #3aa856; }
  .cd-trk-who__icon .material-icons { font-size: 28px; }
  .cd-trk-who__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-trk-who__card-fit { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 700; color: #ef6632; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 12px 0; }
  .cd-trk-who__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-trk-who__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-trk-who__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-trk-who__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-trk-who__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-trk-who__card { padding: 26px 22px; }
    .cd-trk-who__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-trk-who">
  <p class="cd-trk-who__intro" data-field="intro">{{intro}}</p>
  <div class="cd-trk-who__grid">
    <div class="cd-trk-who__card" data-repeat="personas">
      <div class="cd-trk-who__icon"><span class="material-icons">{{personas.icon}}</span></div>
      <h3 class="cd-trk-who__card-title">{{personas.title}}</h3>
      <p class="cd-trk-who__card-fit">{{personas.fit}}</p>
      <p class="cd-trk-who__card-desc">{{personas.desc}}</p>
    </div>
  </div>
  <div class="cd-trk-who__closer">
    <p class="cd-trk-who__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const WHO_DEFAULTS = {
  intro:
    "Cardiff funds trucking operators across the full spectrum — from a single owner-operator buying a second tractor to multi-state fleets refinancing equipment. The right product depends less on industry and more on where you sit in this list.",
  personas: [
    {
      icon: 'person',
      title: 'Owner-Operators',
      fit: 'Best fit · Equipment financing + LOC',
      desc: 'Driving your own truck and ready for a second rig, a newer tractor, or a heavier-duty trailer. We finance the equipment and keep a line of credit open for fuel and repairs between settlements.',
    },
    {
      icon: 'groups',
      title: 'Small Fleets (2–10 trucks)',
      fit: 'Best fit · Equipment + working capital',
      desc: 'Growing past the owner-operator phase with hired drivers, dispatch, and a small back office. We structure financing that matches your settlement cycle so payroll never competes with fuel.',
    },
    {
      icon: 'local_shipping',
      title: 'Mid-Sized Carriers (10–50 trucks)',
      fit: 'Best fit · SBA + fleet refinance',
      desc: 'Running a regional operation with terminals, multiple lanes, and a maintenance shop. We refinance existing equipment debt and underwrite SBA loans for facility upgrades.',
    },
    {
      icon: 'agriculture',
      title: 'Specialized Haulers',
      fit: 'Best fit · Equipment + bridge capital',
      desc: 'Flatbed, reefer, heavy haul, tanker, auto transport, or oversize/overweight — specialty equipment is more expensive, harder to insure, and Cardiff knows the underwriting profile.',
    },
    {
      icon: 'inventory_2',
      title: 'Last-Mile & Box Truck Operators',
      fit: 'Best fit · Equipment + LOC',
      desc: 'Amazon DSPs, FedEx contractors, and independent box-truck delivery businesses. We finance Sprinter vans, 26-foot box trucks, and lift gates against the contract you already hold.',
    },
    {
      icon: 'engineering',
      title: 'Startup & Rebuilding Carriers',
      fit: 'Best fit · Revenue-based + secured',
      desc: 'New authority, recovering from a downturn, or rebuilding credit after a tough year. Revenue-based lending and equipment-secured loans get you back on the road when traditional banks decline.',
    },
  ],
  closer:
    'Not sure where you fit? Talk to a Cardiff specialist — most trucking operators end up combining two of these products to match how their revenue actually flows.',
} as const;

const whoBlock = {
  id: 'sec-who-grid',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: WHO_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: WHO_DEFAULTS.intro },
    {
      name: 'personas',
      label: 'Operator personas',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text', default: 'local_shipping' },
        { name: 'title', label: 'Persona title', type: 'text', default: '' },
        { name: 'fit', label: 'Best-fit tagline', type: 'text', default: '' },
        { name: 'desc', label: 'Description', type: 'textarea', default: '' },
      ],
      default: WHO_DEFAULTS.personas,
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: WHO_DEFAULTS.closer },
  ],
  values: {
    intro: WHO_DEFAULTS.intro,
    personas: WHO_DEFAULTS.personas.map((p) => ({ ...p })),
    closer: WHO_DEFAULTS.closer,
  },
};

function buildWhoSection() {
  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-who-title',
    order: 1,
    level: 2,
    content: 'Who Are Trucking Loans Built For?',
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
    id: 'sec-who-div',
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
      backgroundColor: '#ffffff',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, whoBlock],
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

  const newSection = buildWhoSection();
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
  console.log(`Updated post ${POST_ID}: persona grid in place between ${ANCHOR_AFTER_ID} and sec-3.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
