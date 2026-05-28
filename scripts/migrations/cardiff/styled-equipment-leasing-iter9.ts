/**
 * Iter 9: Restyle the "What Is Business Equipment Financing?" section on
 * post 802 (equipment-leasing). This is sec-4 — currently a heading +
 * orange divider + two long plain paragraphs back-to-back. The first
 * paragraph defines the product; the second lists example industries.
 *
 * Iters 1-8 styled hero / sec-2 / sec-5 / sec-6 / sec-7 / sec-8 / sec-9 /
 * sec-10 / sec-12. The single remaining visual gap is sec-4: its existing
 * content is dense but unstructured, breaking the visual rhythm between
 * the heavily-treated sec-2 (comparison) and sec-5 (lease-vs-loan).
 *
 * We replace sec-4 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as prior iters)
 *   2. A single html-render block carrying:
 *      - a "definition" card with an icon chip and the primary explainer
 *        paragraph as a lead-in,
 *      - a 4-up "use cases" grid driven by data-repeat="cases" so future
 *        examples can be added by editing the values array only.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632) accents — no emojis, Material Icons only,
 * Raleway headings / Open Sans body.
 *
 * Idempotent: re-running rewrites sec-4.blocks in place; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-4';

const WHAT_HTML = `
<style>
  .cd-eq-what { max-width: 1140px; margin: 0 auto; }
  .cd-eq-what__def { display: flex; gap: 22px; align-items: flex-start; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 30px 32px; box-shadow: 0 14px 36px rgba(28,51,112,0.08); margin: 0 0 40px 0; }
  .cd-eq-what__def-icon { flex: 0 0 64px; width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.24); }
  .cd-eq-what__def-icon .material-icons { font-size: 32px; }
  .cd-eq-what__def-body { flex: 1 1 auto; min-width: 0; }
  .cd-eq-what__def-eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #ef6632; margin: 0 0 8px 0; }
  .cd-eq-what__def-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; color: #364158; margin: 0; }
  .cd-eq-what__use-label { display: flex; align-items: center; gap: 12px; margin: 0 0 22px 0; }
  .cd-eq-what__use-label::before, .cd-eq-what__use-label::after { content: ''; flex: 1 1 auto; height: 1px; background: linear-gradient(90deg, transparent 0%, #c9d3e4 50%, transparent 100%); }
  .cd-eq-what__use-label-text { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #25418b; white-space: nowrap; }
  .cd-eq-what__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.7; max-width: 720px; margin: 0 auto 28px auto; }
  .cd-eq-what__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
  .cd-eq-what__case { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 22px 20px; box-shadow: 0 8px 22px rgba(28,51,112,0.05); transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; display: flex; flex-direction: column; gap: 12px; }
  .cd-eq-what__case:hover { transform: translateY(-3px); box-shadow: 0 16px 36px rgba(28,51,112,0.12); border-color: #c9d3e4; }
  .cd-eq-what__case-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(90,201,111,0.16) 0%, rgba(90,201,111,0.08) 100%); color: #2f8a47; }
  .cd-eq-what__case:nth-child(2) .cd-eq-what__case-icon { background: linear-gradient(135deg, rgba(239,102,50,0.16) 0%, rgba(239,102,50,0.08) 100%); color: #c5491b; }
  .cd-eq-what__case:nth-child(3) .cd-eq-what__case-icon { background: linear-gradient(135deg, rgba(37,65,139,0.16) 0%, rgba(37,65,139,0.08) 100%); color: #1c3370; }
  .cd-eq-what__case:nth-child(4) .cd-eq-what__case-icon { background: linear-gradient(135deg, rgba(255,183,152,0.32) 0%, rgba(255,183,152,0.16) 100%); color: #b5491e; }
  .cd-eq-what__case-icon .material-icons { font-size: 24px; }
  .cd-eq-what__case-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 800; color: #1c3370; margin: 0; line-height: 1.3; letter-spacing: -0.005em; }
  .cd-eq-what__case-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9rem; line-height: 1.6; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-eq-what__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-eq-what__def { flex-direction: column; gap: 16px; padding: 24px 22px; }
    .cd-eq-what__grid { grid-template-columns: 1fr; gap: 14px; }
  }
</style>
<div class="cd-eq-what">
  <div class="cd-eq-what__def">
    <div class="cd-eq-what__def-icon"><span class="material-icons" data-field="defIcon">{{defIcon}}</span></div>
    <div class="cd-eq-what__def-body">
      <span class="cd-eq-what__def-eyebrow" data-field="defEyebrow">{{defEyebrow}}</span>
      <p class="cd-eq-what__def-text" data-field="defText">{{defText}}</p>
    </div>
  </div>
  <div class="cd-eq-what__use-label">
    <span class="cd-eq-what__use-label-text" data-field="useLabel">{{useLabel}}</span>
  </div>
  <p class="cd-eq-what__intro" data-field="useIntro">{{useIntro}}</p>
  <div class="cd-eq-what__grid">
    <div class="cd-eq-what__case" data-repeat="cases">
      <div class="cd-eq-what__case-icon"><span class="material-icons">{{cases.icon}}</span></div>
      <h3 class="cd-eq-what__case-title">{{cases.title}}</h3>
      <p class="cd-eq-what__case-desc">{{cases.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const WHAT_DEFAULTS = {
  defIcon: 'account_balance',
  defEyebrow: 'The basics',
  defText: 'Business equipment financing can be a loan or lease that helps you spread out the high cost of new or used equipment over time. You secure the asset today and make predictable payments until you repay the loan or lease. Equipment financing is often more accessible than traditional business loans because it is a secured loan — the equipment itself serves as collateral, reducing the lender’s risk.',
  useLabel: 'What it funds',
  useIntro: 'From day-one launches to mid-cycle upgrades, equipment financing through Cardiff puts the asset to work driving revenue right away.',
  cases: [
    { icon: 'medical_services', title: 'Veterinary & medical', desc: 'Exam tables, imaging systems, dental chairs — outfit a new clinic or refresh aging gear without draining cash reserves.' },
    { icon: 'spa', title: 'Spa & wellness', desc: 'Lease modern treatment machines with a low upfront investment so your menu of services stays competitive.' },
    { icon: 'construction', title: 'Construction & trades', desc: 'Finance heavy machinery, trucks, and jobsite tools so you can take on bigger contracts without tying up working capital.' },
    { icon: 'point_of_sale', title: 'Retail, auto & food service', desc: 'POS systems, lifts and diagnostic gear, kitchen equipment — keep operations running smoothly and customers moving.' },
  ],
} as const;

const whatBlock = {
  id: 'sec-4-what',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: WHAT_HTML,
  fields: [
    { name: 'defIcon', label: 'Definition — icon', type: 'text', default: WHAT_DEFAULTS.defIcon },
    { name: 'defEyebrow', label: 'Definition — eyebrow label', type: 'text', default: WHAT_DEFAULTS.defEyebrow },
    { name: 'defText', label: 'Definition — paragraph', type: 'textarea', default: WHAT_DEFAULTS.defText },
    { name: 'useLabel', label: 'Use-cases — divider label', type: 'text', default: WHAT_DEFAULTS.useLabel },
    { name: 'useIntro', label: 'Use-cases — intro paragraph', type: 'textarea', default: WHAT_DEFAULTS.useIntro },
    {
      name: 'cases',
      label: 'Use cases',
      type: 'repeater',
      default: WHAT_DEFAULTS.cases,
      fields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
    },
  ],
  values: { ...WHAT_DEFAULTS, cases: WHAT_DEFAULTS.cases.map((c) => ({ ...c })) },
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

  // Widen so the 4-up case grid breathes.
  sec.maxWidth = '1200px';
  // Keep the soft blue-tinted backdrop consistent with sibling explainer bands.
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-4-title',
    order: 1,
    level: 2,
    content: 'What Is Business Equipment Financing?',
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
    id: 'sec-4-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, whatBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-4 -> styled definition card + 4-up use-case grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
