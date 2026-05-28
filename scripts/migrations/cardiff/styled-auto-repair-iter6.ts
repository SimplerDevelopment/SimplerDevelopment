/**
 * Iter 6: Restyle the "Who Uses Auto Repair Business Loans?" section
 * (sec-5) on post 805 (industries-auto-repair).
 *
 * Source: an intro paragraph + 3 long paragraphs describing distinct
 * borrower personas (growing general/specialty shops, owner-run shops
 * professionalizing, shops with thin paper profits), currently rendered
 * as a tall stack of plain text with no visual structure.
 *
 * Port: a responsive icon-card persona grid (3-up auto-fit) on a
 * brand-tinted band, with a centered H2 + orange underline, an intro
 * paragraph, and a 3-persona repeater card. Each card has a circular
 * brand-gradient icon chip, a persona title, and the supporting copy.
 * Brand palette only — deep blue / orange / green / peach accents,
 * no emojis (Material Icons in the chips).
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-5-personas` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const TARGET_BLOCK_ID = 'sec-5';

const PERSONAS_HTML = `
<style>
  .cd-ar-who { max-width: 1180px; margin: 0 auto; }
  .cd-ar-who__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-ar-who__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-ar-who__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-ar-who__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-ar-who__icon { width: 58px; height: 58px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-ar-who__card:nth-child(2) .cd-ar-who__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-ar-who__card:nth-child(3) .cd-ar-who__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-ar-who__icon .material-icons { font-size: 30px; }
  .cd-ar-who__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-ar-who__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-ar-who__closer { margin: 48px auto 0 auto; max-width: 860px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 14px; border: 1px solid #e6ecf5; }
  .cd-ar-who__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-ar-who__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-ar-who__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ar-who__card { padding: 26px 22px; }
    .cd-ar-who__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-ar-who">
  <p class="cd-ar-who__intro" data-field="intro">{{intro}}</p>
  <div class="cd-ar-who__grid">
    <div class="cd-ar-who__card" data-repeat="personas">
      <div class="cd-ar-who__icon"><span class="material-icons" data-field="icon">{{personas.icon}}</span></div>
      <h3 class="cd-ar-who__title" data-field="title">{{personas.title}}</h3>
      <p class="cd-ar-who__desc" data-field="desc">{{personas.desc}}</p>
    </div>
  </div>
  <div class="cd-ar-who__closer">
    <p class="cd-ar-who__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const PERSONAS_DATA = [
  {
    icon: 'build',
    title: 'Growing General & Specialty Shops',
    desc: "You're a strong fit if you run a shop with growing demand and you want to improve stability or capacity. That includes general repair, fleet services, diagnostics, tires, brakes, transmission work, collision-related services, and specialty work. Our lenders can recommend loans that work with your operations and goals.",
  },
  {
    icon: 'groups',
    title: 'Owner-Run Shops Going Pro',
    desc: "You're also a good fit if you're moving from an owner-run operation to a structured business. That transition takes capital to hire new technicians and invest in tools. This situation causes many owners to explore auto body repair shop business loan solutions that give them room to professionalize operations without stalling growth.",
  },
  {
    icon: 'shield',
    title: 'Shops With Tight Cash Flow',
    desc: "You may even qualify for industry-specific funding if your shop doesn't look profitable on paper. We know insurance delays, seasonal volume, and invoice timing can squeeze cash flow. While that might lead to rejections from traditional lenders, Cardiff offers small business financing designed to help you manage financial pressures.",
  },
];

const DEFAULTS = {
  intro: 'At Cardiff, auto shops facing real-world roadblocks to real-world success are welcome. We provide a wide range of products to meet a variety of needs quickly and use flexible approval criteria so shops at all stages of growth can access capital.',
  personas: PERSONAS_DATA,
  closer: "Whether you run one bay or a multi-location operation, if your shop is moving — Cardiff has a funding fit. The application takes minutes and most decisions land same day.",
};

const personasBlock = {
  id: 'sec-5-personas',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: PERSONAS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: DEFAULTS.intro },
    {
      name: 'personas',
      label: 'Persona cards',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'desc', label: 'Card description', type: 'textarea' },
      ],
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: DEFAULTS.closer },
  ],
  values: { ...DEFAULTS },
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

  // Widen so the 3-up persona grid breathes.
  sec.maxWidth = '1240px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-5-title',
    order: 1,
    level: 2,
    content: 'Who Uses Auto Repair Business Loans?',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
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
    id: 'sec-5-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, personasBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-5 -> styled 3-card "Who Uses Auto Repair Business Loans" persona grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
