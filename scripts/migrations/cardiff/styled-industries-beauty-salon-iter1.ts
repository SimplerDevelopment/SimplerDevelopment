/**
 * Iter 1: Beauty / Salon industry page (slug: `industries-beauty-salon`).
 *
 * Discovery: There is NO existing beauty / salon page in the cardiff-main
 * tenant (websiteId 405). cardiff.co/beauty-salon/ on the original site
 * falls through to the generic "BORROW BETTER" home content — the
 * original site does not currently publish a beauty / salon vertical.
 * That's the biggest gap by far: the page literally does not exist.
 *
 * Fix in this iter: create the post (idempotent), giving it the same
 * canonical hero + 3-up icon-card trust band that every other styled
 * Cardiff industry page now uses (recipe lifted from
 * styled-industries-restaurants-iter1.ts + the canonical icon-card
 * grid from styled-equipment-leasing-iter3.ts). Brand palette only:
 * deep blue (#1c3370 / #25418b), green (#5ac96f), orange (#ef6632 /
 * #ffb798). Raleway (headings) + Open Sans (body). Material Icons —
 * never emojis. CTAs route to /apply (per site-wide rewrite).
 *
 * Structure shipped in iter1:
 *   1. section `hero-industries-beauty-salon` — deep-blue gradient hero
 *      with H1 + sub + Apply Now / Talk to a Specialist buttons.
 *   2. section `sec-hero-features` — 3-up icon-card band carrying
 *      Cardiff's signature trust stats, tailored to beauty / salon
 *      operator concerns (chair-rental cash flow, equipment funding,
 *      same-day funding for product / supply restocking).
 *
 * Idempotent: if a post with slug `industries-beauty-salon` exists for
 * websiteId 405, we replace `hero-industries-beauty-salon` and
 * `sec-hero-features` blocks in-place (preserving any blocks added by
 * subsequent iters). If the post does not exist, we INSERT it with
 * just these two blocks + a placeholder final CTA so the route renders.
 * Safe to re-run.
 *
 * NOTE: The data-repeat renderer quirk — putting data-repeat on the
 * grid container collapses the whole grid to a single-column stack —
 * is avoided by hard-coding three card siblings inside one grid wrapper.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { and, eq } from 'drizzle-orm';

const WEBSITE_ID = 405;
const SLUG = 'industries-beauty-salon';
const TITLE = 'Loans for Beauty Salons';
const SEO_TITLE = 'Beauty Salon Business Loans & Salon Financing | Cardiff';
const SEO_DESC =
  'Flexible business loans and working capital for beauty salons, spas, and barber shops. Fund chairs, product inventory, and seasonal cash flow with same-day approval from Cardiff.';

const HERO_ID = 'hero-industries-beauty-salon';
const FEATURES_ID = 'sec-hero-features';
const FINAL_CTA_ID = 'final-cta';

const FEATURES_HTML = `
<style>
  .cd-bs-feat { max-width: 1140px; margin: 0 auto; }
  .cd-bs-feat__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bs-feat__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 30px 28px; box-shadow: 0 14px 36px rgba(28,51,112,0.08); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; align-items: flex-start; }
  .cd-bs-feat__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.14); }
  .cd-bs-feat__icon { width: 60px; height: 60px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.24); }
  .cd-bs-feat__card:nth-child(2) .cd-bs-feat__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.28); }
  .cd-bs-feat__card:nth-child(3) .cd-bs-feat__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.28); }
  .cd-bs-feat__icon .material-icons { font-size: 32px; }
  .cd-bs-feat__stat { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.875rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.015em; line-height: 1.15; }
  .cd-bs-feat__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-bs-feat__grid { grid-template-columns: repeat(2, 1fr); }
    .cd-bs-feat__card:nth-child(3) { grid-column: 1 / -1; max-width: 480px; margin: 0 auto; width: 100%; }
  }
  @media (max-width: 620px) {
    .cd-bs-feat__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bs-feat__card { padding: 24px 22px; }
    .cd-bs-feat__card:nth-child(3) { max-width: none; }
    .cd-bs-feat__stat { font-size: 1.625rem; }
  }
</style>
<div class="cd-bs-feat">
  <div class="cd-bs-feat__grid">
    <div class="cd-bs-feat__card">
      <div class="cd-bs-feat__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <p class="cd-bs-feat__stat" data-field="stat1">{{stat1}}</p>
      <p class="cd-bs-feat__desc" data-field="desc1">{{desc1}}</p>
    </div>
    <div class="cd-bs-feat__card">
      <div class="cd-bs-feat__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <p class="cd-bs-feat__stat" data-field="stat2">{{stat2}}</p>
      <p class="cd-bs-feat__desc" data-field="desc2">{{desc2}}</p>
    </div>
    <div class="cd-bs-feat__card">
      <div class="cd-bs-feat__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <p class="cd-bs-feat__stat" data-field="stat3">{{stat3}}</p>
      <p class="cd-bs-feat__desc" data-field="desc3">{{desc3}}</p>
    </div>
  </div>
</div>
`.trim();

const FEATURES_DEFAULTS = {
  icon1: 'content_cut',
  stat1: 'Salons & Spas Funded',
  desc1: 'From single-chair barber shops to multi-location day spas, Cardiff funds beauty operators of every shape — over $12B funded across small businesses to date.',
  icon2: 'schedule',
  stat2: '5 Minute Approvals',
  desc2: 'Get a funding decision before your next color appointment finishes. No two-week wait, no piles of paperwork — just an answer when you need it.',
  icon3: 'bolt',
  stat3: 'Same Day Funds',
  desc3: 'Restock product, cover payroll, or take advantage of a chair-rental opportunity. Approved funds can land in your account within 24 hours.',
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
        content: 'Loans for Beauty Salons',
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
          "Fund the chairs, the product, and the team. Flexible working capital and equipment financing for beauty salons, barber shops, and spas — approved in minutes, funded in days.",
        style: {
          color: 'rgba(255,255,255,0.85)',
          fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: '1.0625rem',
          lineHeight: '1.6',
          textAlign: 'center',
          maxWidth: '680px',
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

function buildFinalCta(order: number) {
  return {
    type: 'cta' as const,
    id: FINAL_CTA_ID,
    order,
    heading: 'Ready to fund your salon?',
    subheading:
      "Tell us a little about your business and get a real approval amount in minutes. No obligation, no impact to your personal credit to check eligibility.",
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
  return [buildHeroSection(1), buildFeaturesSection(2), buildFinalCta(3)];
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
          'Flexible business loans for beauty salons, barber shops, and spas — fund chairs, products, and payroll with same-day approval.',
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
  console.log(`Updated post ${existing.id}: industries-beauty-salon hero + features installed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
