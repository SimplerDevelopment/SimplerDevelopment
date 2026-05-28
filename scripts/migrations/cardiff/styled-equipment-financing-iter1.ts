/**
 * Iter 1: Equipment Financing page (slug: `equipment-financing`).
 *
 * Discovery: There is NO existing equipment-financing page in the
 * cardiff-main tenant (websiteId 405). cardiff.co/equipment-financing/
 * actually falls through to the generic "BORROW BETTER" homepage on the
 * original site too — so the page does not really exist anywhere. That
 * is the single biggest gap by miles.
 *
 * NB: `equipment-leasing` is a SEPARATE page (post 802) that already has
 * 13 styled iters. This page is the FINANCING variant — emphasis on
 * ownership at end-of-term, asset-secured loans, Section 179 deductions,
 * and OEM/dealer dynamics — to differentiate it from the leasing page.
 *
 * Fix in this iter: create the post (idempotent), giving it the same
 * canonical hero + 3-up icon-card trust band recipe used by every other
 * styled Cardiff industry / product page, plus a definition card +
 * 3-up benefits grid sec-3 (lifted from styled-equipment-leasing-iter13)
 * and a closing CTA. Brand palette only: deep blue (#1c3370 / #25418b),
 * green (#5ac96f), orange (#ef6632 / #ffb798). Raleway (headings) +
 * Open Sans (body). Material Icons — never emojis. CTAs route to /apply.
 *
 * Structure shipped in iter1:
 *   1. section `hero-equipment-financing` — deep-blue gradient hero
 *      with H1 + sub + Apply Now / Talk to a Specialist buttons.
 *   2. section `sec-hero-features` — 3-up icon-card band carrying
 *      financing-specific trust stats (vehicles, machinery, tech).
 *   3. section `sec-3` — "What Is Equipment Financing?" definition card
 *      + 3-up benefits grid (preserve cash, build equity, Sec. 179).
 *   4. cta  `final-cta` — gradient closer.
 *
 * Idempotent: if a post with slug `equipment-financing` exists for
 * websiteId 405, we replace the four named blocks in-place (preserving
 * any blocks added by subsequent iters). If the post does not exist, we
 * INSERT it. Safe to re-run.
 *
 * RENDERER QUIRK: putting data-repeat on the grid wrapper collapses to
 * a single column. Hard-code 3 sibling tiles in the features grid
 * (matches beauty-salon-iter1). For sec-3 benefits we keep data-repeat
 * on the INNER tile only (matches leasing-iter13).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { and, eq } from 'drizzle-orm';

const WEBSITE_ID = 405;
const SLUG = 'equipment-financing';
const TITLE = 'Equipment Financing';
const SEO_TITLE = 'Equipment Financing for Small Businesses | Cardiff';
const SEO_DESC =
  'Finance vehicles, machinery, tech, medical, and restaurant equipment with Cardiff. Asset-secured loans with low rates, terms up to five years, and same-day approvals — keep working capital, own the equipment at payoff.';

const HERO_ID = 'hero-equipment-financing';
const FEATURES_ID = 'sec-hero-features';
const DEF_SECTION_ID = 'sec-3';
const FINAL_CTA_ID = 'final-cta';

const FEATURES_HTML = `
<style>
  .cd-ef-feat { max-width: 1140px; margin: 0 auto; }
  .cd-ef-feat__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-ef-feat__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 30px 28px; box-shadow: 0 14px 36px rgba(28,51,112,0.08); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; align-items: flex-start; }
  .cd-ef-feat__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.14); }
  .cd-ef-feat__icon { width: 60px; height: 60px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.24); }
  .cd-ef-feat__card:nth-child(2) .cd-ef-feat__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.28); }
  .cd-ef-feat__card:nth-child(3) .cd-ef-feat__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.28); }
  .cd-ef-feat__icon .material-icons { font-size: 32px; }
  .cd-ef-feat__stat { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.875rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.015em; line-height: 1.15; }
  .cd-ef-feat__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-ef-feat__grid { grid-template-columns: repeat(2, 1fr); }
    .cd-ef-feat__card:nth-child(3) { grid-column: 1 / -1; max-width: 480px; margin: 0 auto; width: 100%; }
  }
  @media (max-width: 620px) {
    .cd-ef-feat__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ef-feat__card { padding: 24px 22px; }
    .cd-ef-feat__card:nth-child(3) { max-width: none; }
    .cd-ef-feat__stat { font-size: 1.625rem; }
  }
</style>
<div class="cd-ef-feat">
  <div class="cd-ef-feat__grid">
    <div class="cd-ef-feat__card">
      <div class="cd-ef-feat__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <p class="cd-ef-feat__stat" data-field="stat1">{{stat1}}</p>
      <p class="cd-ef-feat__desc" data-field="desc1">{{desc1}}</p>
    </div>
    <div class="cd-ef-feat__card">
      <div class="cd-ef-feat__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <p class="cd-ef-feat__stat" data-field="stat2">{{stat2}}</p>
      <p class="cd-ef-feat__desc" data-field="desc2">{{desc2}}</p>
    </div>
    <div class="cd-ef-feat__card">
      <div class="cd-ef-feat__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <p class="cd-ef-feat__stat" data-field="stat3">{{stat3}}</p>
      <p class="cd-ef-feat__desc" data-field="desc3">{{desc3}}</p>
    </div>
  </div>
</div>
`.trim();

const FEATURES_DEFAULTS = {
  icon1: 'local_shipping',
  stat1: 'Up to 100% Financed',
  desc1: 'Roll in soft costs like delivery, installation, and training. Finance the full project, not just the sticker price — preserve cash for inventory and payroll.',
  icon2: 'schedule',
  stat2: '2 – 5 Year Terms',
  desc2: 'Match payments to the productive life of the asset. Stretch the term on heavy equipment, compress it on tech that depreciates fast.',
  icon3: 'bolt',
  stat3: 'Same Day Approvals',
  desc3: 'Get a decision before the vendor closes for the day. Approved funds can hit the dealer within 24 hours so you do not miss the unit.',
} as const;

const DEF_HTML = `
<style>
  .cd-ef-def { max-width: 1140px; margin: 0 auto; }
  .cd-ef-def__card { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 24px; align-items: start; background: #ffffff; border: 1px solid #e6ecf5; border-left: 4px solid #ef6632; border-radius: 14px; padding: 32px 36px; box-shadow: 0 14px 36px rgba(28,51,112,0.07); margin: 0 auto 48px auto; max-width: 960px; }
  .cd-ef-def__chip { width: 72px; height: 72px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.24); }
  .cd-ef-def__chip .material-icons { font-size: 38px; }
  .cd-ef-def__body { min-width: 0; }
  .cd-ef-def__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.7rem; letter-spacing: 0.28em; text-transform: uppercase; color: #ef6632; font-weight: 700; margin: 0 0 10px 0; }
  .cd-ef-def__text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  .cd-ef-def__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-ef-def__bcard { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-ef-def__bcard:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-ef-def__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-ef-def__bcard:nth-child(3n+2) .cd-ef-def__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-ef-def__bcard:nth-child(3n+3) .cd-ef-def__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-ef-def__icon .material-icons { font-size: 30px; }
  .cd-ef-def__btitle { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-ef-def__bdesc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-ef-def__card { grid-template-columns: 1fr; gap: 18px; padding: 26px 24px; }
    .cd-ef-def__chip { width: 60px; height: 60px; border-radius: 14px; }
    .cd-ef-def__chip .material-icons { font-size: 32px; }
    .cd-ef-def__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ef-def__bcard { padding: 26px 22px; }
  }
</style>
<div class="cd-ef-def">
  <div class="cd-ef-def__card">
    <div class="cd-ef-def__chip"><span class="material-icons" data-field="defIcon">{{defIcon}}</span></div>
    <div class="cd-ef-def__body">
      <p class="cd-ef-def__eyebrow" data-field="defEyebrow">{{defEyebrow}}</p>
      <p class="cd-ef-def__text" data-field="defText">{{defText}}</p>
    </div>
  </div>
  <div class="cd-ef-def__grid">
    <div class="cd-ef-def__bcard" data-repeat="benefits">
      <div class="cd-ef-def__icon"><span class="material-icons" data-field="icon">{{benefits.icon}}</span></div>
      <h3 class="cd-ef-def__btitle" data-field="title">{{benefits.title}}</h3>
      <p class="cd-ef-def__bdesc" data-field="desc">{{benefits.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const DEF_DEFAULTS = {
  defIcon: 'precision_manufacturing',
  defEyebrow: 'The definition',
  defText:
    'Equipment financing is an asset-secured business loan that lets you purchase the equipment you need today and pay for it in fixed monthly installments over two to five years. The equipment itself serves as collateral, which usually means lower rates than unsecured loans. At payoff you own the asset outright — vehicle, machine, tech stack, medical or restaurant gear — and keep it on your balance sheet.',
  benefits: [
    {
      icon: 'savings',
      title: 'Preserve Working Capital',
      desc: 'Skip the lump-sum check at the dealer. Fixed monthly payments keep cash available for payroll, inventory, and the next opportunity.',
    },
    {
      icon: 'account_balance',
      title: 'Build Equity & Own It',
      desc: 'Unlike a lease, every payment moves you toward outright ownership. At payoff the equipment is yours — sell it, trade it, or run it until the wheels fall off.',
    },
    {
      icon: 'receipt_long',
      title: 'Section 179 Tax Benefits',
      desc: 'Most financed equipment qualifies for Section 179 expensing, letting you deduct the full purchase price the year you put it in service. (Ask your tax advisor for specifics.)',
    },
  ],
} as const;

function buildHeroSection(order: number) {
  return {
    type: 'section' as const,
    id: HERO_ID,
    order,
    maxWidth: '1080px',
    style: {
      backgroundColor: '#25418b',
      paddingTop: '80px',
      paddingBottom: '64px',
      paddingLeft: '24px',
      paddingRight: '24px',
      color: '#ffffff',
      customCSS:
        'background-image: radial-gradient(ellipse at 60% 0%, rgba(56,92,192,0.45) 0%, transparent 65%), linear-gradient(135deg, #1c3370 0%, #25418b 60%, #385cc0 100%);',
    },
    blocks: [
      {
        type: 'heading' as const,
        alignment: 'center',
        id: 'h-title',
        order: 2,
        level: 1,
        content: 'Equipment Financing',
        style: {
          color: '#ffffff',
          fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: '3rem',
          fontWeight: '800',
          letterSpacing: '-0.02em',
          lineHeight: '1.1',
          margin: '0 0 18px 0',
          textAlign: 'center',
          customCSS: 'text-shadow: 0 2px 16px rgba(0,0,0,0.32)',
        },
      },
      {
        type: 'text' as const,
        id: 'h-sub',
        order: 3,
        content:
          'Finance the vehicles, machines, tech, and tools your business runs on. Asset-secured loans with low rates, terms up to five years, and same-day approvals — keep your working capital, own the equipment at payoff.',
        style: {
          color: 'rgba(255,255,255,0.85)',
          fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: '1.0625rem',
          lineHeight: '1.6',
          textAlign: 'center',
          maxWidth: '720px',
          margin: '0 auto 32px auto',
        },
      },
      {
        type: 'columns' as const,
        id: 'h-btns',
        order: 4,
        gap: 'sm',
        stackOnMobile: true,
        columns: [
          {
            id: 'hb-l',
            width: 'auto',
            padding: 'none',
            blocks: [
              {
                type: 'button' as const,
                id: 'hb-apply',
                order: 1,
                text: 'Apply Now',
                url: '/apply',
                variant: 'primary',
                size: 'md',
                alignment: 'right',
                icon: 'arrow_forward',
                iconPosition: 'right',
                hoverEffect: 'lift',
                style: {
                  backgroundColor: '#ef6632',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '0.875rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '14px 30px',
                  borderRadius: '6px',
                  fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
                  customCSS: 'box-shadow: 0 10px 24px rgba(239,102,50,0.4)',
                },
              },
            ],
          },
          {
            id: 'hb-r',
            width: 'auto',
            padding: 'none',
            blocks: [
              {
                type: 'button' as const,
                id: 'hb-contact',
                order: 1,
                text: 'Talk to a Specialist',
                url: '/contact-us',
                variant: 'secondary',
                size: 'md',
                alignment: 'left',
                hoverEffect: 'fill',
                style: {
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '14px 26px',
                  borderRadius: '6px',
                  fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
                  customCSS:
                    'border: 1.5px solid rgba(255,255,255,0.5); background: rgba(255,255,255,0.05); backdrop-filter: blur(4px)',
                },
              },
            ],
          },
        ],
        style: { margin: '0 auto', maxWidth: '460px' },
      },
    ],
  };
}

function buildFeaturesSection(order: number) {
  return {
    type: 'section' as const,
    id: FEATURES_ID,
    order,
    maxWidth: '1200px',
    style: {
      backgroundColor: '#ffffff',
      paddingTop: '60px',
      paddingBottom: '60px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [
      {
        id: 'sec-hero-features-html',
        type: 'html-render' as const,
        width: 'full' as const,
        order: 1,
        html: FEATURES_HTML,
        fields: [
          { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: FEATURES_DEFAULTS.icon1 },
          { name: 'stat1', label: 'Card 1 — stat headline', type: 'text', default: FEATURES_DEFAULTS.stat1 },
          { name: 'desc1', label: 'Card 1 — description', type: 'textarea', default: FEATURES_DEFAULTS.desc1 },
          { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: FEATURES_DEFAULTS.icon2 },
          { name: 'stat2', label: 'Card 2 — stat headline', type: 'text', default: FEATURES_DEFAULTS.stat2 },
          { name: 'desc2', label: 'Card 2 — description', type: 'textarea', default: FEATURES_DEFAULTS.desc2 },
          { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: FEATURES_DEFAULTS.icon3 },
          { name: 'stat3', label: 'Card 3 — stat headline', type: 'text', default: FEATURES_DEFAULTS.stat3 },
          { name: 'desc3', label: 'Card 3 — description', type: 'textarea', default: FEATURES_DEFAULTS.desc3 },
        ],
        values: { ...FEATURES_DEFAULTS },
      },
    ],
  };
}

function buildDefSection(order: number) {
  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-3-title',
    order: 1,
    level: 2 as const,
    content: 'What Is Equipment Financing?',
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
    id: 'sec-3-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  const defBlock = {
    id: 'sec-3-def',
    type: 'html-render' as const,
    width: 'full' as const,
    order: 3,
    html: DEF_HTML,
    fields: [
      { name: 'defIcon', label: 'Definition icon', type: 'text', default: DEF_DEFAULTS.defIcon },
      { name: 'defEyebrow', label: 'Definition eyebrow', type: 'text', default: DEF_DEFAULTS.defEyebrow },
      { name: 'defText', label: 'Definition body', type: 'textarea', default: DEF_DEFAULTS.defText },
      {
        name: 'benefits',
        label: 'Benefits',
        type: 'collection',
        default: DEF_DEFAULTS.benefits,
        fields: [
          { name: 'icon', label: 'Material icon', type: 'text' },
          { name: 'title', label: 'Title', type: 'text' },
          { name: 'desc', label: 'Description', type: 'textarea' },
        ],
      },
    ],
    values: { ...DEF_DEFAULTS },
  };
  return {
    type: 'section' as const,
    id: DEF_SECTION_ID,
    order,
    maxWidth: '1200px',
    style: {
      backgroundColor: '#f6f9fc',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, defBlock],
  };
}

function buildFinalCta(order: number) {
  return {
    type: 'cta' as const,
    id: FINAL_CTA_ID,
    order,
    heading: 'Ready to finance your next piece of equipment?',
    subheading:
      'Tell us a little about your business and the asset you are after. Get a real approval amount in minutes — no obligation, no impact to your personal credit to check eligibility.',
    primaryButton: { text: 'Apply Now', url: '/apply' },
    secondaryButton: { text: 'Talk to a Specialist', url: '/contact-us' },
    style: {
      backgroundColor: '#1c3370',
      color: '#ffffff',
      paddingTop: '64px',
      paddingBottom: '64px',
      paddingLeft: '24px',
      paddingRight: '24px',
      customCSS:
        'background-image: linear-gradient(135deg, #1c3370 0%, #25418b 60%, #385cc0 100%);',
    },
  };
}

function freshBlocks() {
  return [buildHeroSection(1), buildFeaturesSection(2), buildDefSection(3), buildFinalCta(4)];
}

async function main() {
  const [existing] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, SLUG)))
    .limit(1);

  if (!existing) {
    const content = JSON.stringify({ blocks: freshBlocks() });
    const inserted = await db
      .insert(posts)
      .values({
        title: TITLE,
        slug: SLUG,
        postType: 'page',
        content,
        excerpt:
          'Asset-secured equipment loans — finance vehicles, machinery, tech, medical, and restaurant equipment. Low rates, terms up to five years, same-day approvals.',
        published: true,
        publishedAt: new Date(),
        seoTitle: SEO_TITLE,
        seoDescription: SEO_DESC,
        noIndex: false,
        websiteId: WEBSITE_ID,
      })
      .returning({ id: posts.id });
    console.log(`Inserted post id=${inserted[0]?.id} slug=${SLUG} websiteId=${WEBSITE_ID}.`);
    process.exit(0);
  }

  console.log(`Found existing post id=${existing.id} slug=${SLUG}.`);
  const parsed = JSON.parse(existing.content);
  if (!Array.isArray(parsed.blocks)) parsed.blocks = [];

  const upsert = (id: string, build: (order: number) => any, fallbackIdx: number) => {
    const idx = parsed.blocks.findIndex((b: any) => b?.id === id);
    if (idx !== -1) {
      const order = parsed.blocks[idx].order ?? idx + 1;
      parsed.blocks[idx] = build(order);
      console.log(`  Replaced ${id} at index ${idx} (order=${order}).`);
    } else {
      const insertAt = Math.min(fallbackIdx, parsed.blocks.length);
      parsed.blocks.splice(insertAt, 0, build(insertAt + 1));
      for (let i = insertAt + 1; i < parsed.blocks.length; i++) {
        const b = parsed.blocks[i];
        if (b && typeof b === 'object') b.order = i + 1;
      }
      console.log(`  Inserted ${id} at index ${insertAt}.`);
    }
  };

  upsert(HERO_ID, buildHeroSection, 0);
  upsert(FEATURES_ID, buildFeaturesSection, 1);
  upsert(DEF_SECTION_ID, buildDefSection, 2);
  // Only seed final-cta if the page has no closing CTA at all (keeps later
  // iters in control of the bottom of the page).
  if (!parsed.blocks.some((b: any) => b?.id === FINAL_CTA_ID)) {
    parsed.blocks.push(buildFinalCta(parsed.blocks.length + 1));
    console.log(`  Appended ${FINAL_CTA_ID} (no closing CTA was present).`);
  }

  await db
    .update(posts)
    .set({
      title: TITLE,
      seoTitle: SEO_TITLE,
      seoDescription: SEO_DESC,
      published: true,
      content: JSON.stringify(parsed),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, existing.id));
  console.log(`Updated post ${existing.id}: equipment-financing iter1 blocks installed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
