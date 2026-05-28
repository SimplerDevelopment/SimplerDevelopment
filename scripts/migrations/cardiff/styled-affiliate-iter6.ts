/**
 * Iter 6 — Affiliate page (post 796): restyle sec-1, the "Ready To Start
 * Earning As An Affiliate?" intro/value-props band.
 *
 * Prior iters: iter1 hero, iter2 audience grid (sec-3), iter3 3-step (sec-2),
 * iter4 support (sec-5), iter5 service benefits (sec-6).
 *
 * Side-by-side vs cardiff.co/affiliate/ exposes sec-1 as the biggest
 * remaining gap: a tiny "Ready To Start Earning As An Affiliate?" headline,
 * a one-line "Fill out the application below" paragraph, then three
 * orphan H4 cards ("Get Paid For Introductions" / "$12B+ Funded and
 * Counting" / "Strengthen Your Network") sitting bare on a #f6f9fc band
 * with no styling, no icons, no commission/stat callouts.
 *
 * cardiff.co's version of this region is a brand moment: dark-blue gradient
 * with two prominent stat cards ("STRENGTHEN YOUR NETWORK" / "$12B+ FUNDED
 * AND COUNTING") and a green "GET PAID FOR INTRODUCTIONS" call-out, plus an
 * orange CTA. The current port has none of that hierarchy — the three
 * promises just read as a runon below the form CTA.
 *
 * Fix: rewrite sec-1 as a deep-blue gradient band (matching iter1's hero
 * gradient + trucking iter12's process band) with:
 *   - centered headline + orange accent rule
 *   - one-line lead paragraph
 *   - 3-card value-prop grid (icon + stat-style title + supporting desc)
 *     using data-repeat="props" so the editor can tune copy
 *   - orange CTA to the application
 *
 * Brand palette only: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798.
 * Raleway + Open Sans. Material Icons (no emojis).
 *
 * Idempotent: looks up sec-1 by id, rewrites blocks + style each run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 796;
const TARGET_SECTION_ID = 'sec-1';

const PROPS_HTML = `
<style>
  .cd-aff-intro { max-width: 1140px; margin: 0 auto; }
  .cd-aff-intro__lead { text-align: center; color: rgba(255,255,255,0.9); font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; line-height: 1.7; max-width: 760px; margin: 0 auto 44px auto; }
  .cd-aff-intro__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-aff-intro__card { background: #ffffff; border-radius: 14px; padding: 36px 28px 32px 28px; box-shadow: 0 18px 44px rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.16); position: relative; overflow: hidden; transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-aff-intro__card:hover { transform: translateY(-4px); box-shadow: 0 24px 56px rgba(0,0,0,0.32); }
  .cd-aff-intro__card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; opacity: 0.95; }
  .cd-aff-intro__card:nth-child(3n+1)::before { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }
  .cd-aff-intro__card:nth-child(3n+2)::before { background: linear-gradient(90deg, #ef6632 0%, #ffb798 100%); }
  .cd-aff-intro__card:nth-child(3n+3)::before { background: linear-gradient(90deg, #25418b 0%, #5ac96f 100%); }
  .cd-aff-intro__icon { width: 60px; height: 60px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin: 0 0 18px 0; }
  .cd-aff-intro__card:nth-child(3n+1) .cd-aff-intro__icon { background: linear-gradient(135deg, rgba(90,201,111,0.16) 0%, rgba(58,168,86,0.22) 100%); }
  .cd-aff-intro__card:nth-child(3n+1) .cd-aff-intro__icon .material-icons { color: #3aa856; }
  .cd-aff-intro__card:nth-child(3n+2) .cd-aff-intro__icon { background: linear-gradient(135deg, rgba(239,102,50,0.16) 0%, rgba(255,183,152,0.26) 100%); }
  .cd-aff-intro__card:nth-child(3n+2) .cd-aff-intro__icon .material-icons { color: #ef6632; }
  .cd-aff-intro__card:nth-child(3n+3) .cd-aff-intro__icon { background: linear-gradient(135deg, rgba(37,65,139,0.14) 0%, rgba(90,201,111,0.18) 100%); }
  .cd-aff-intro__card:nth-child(3n+3) .cd-aff-intro__icon .material-icons { color: #25418b; }
  .cd-aff-intro__icon .material-icons { font-size: 32px; }
  .cd-aff-intro__stat { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.625rem; font-weight: 800; color: #1c3370; letter-spacing: -0.01em; line-height: 1.15; margin: 0 0 8px 0; }
  .cd-aff-intro__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #ef6632; margin: 0 0 12px 0; }
  .cd-aff-intro__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-aff-intro__cta-wrap { margin: 44px auto 0 auto; text-align: center; }
  .cd-aff-intro__cta { display: inline-flex; align-items: center; gap: 10px; padding: 16px 32px; border-radius: 999px; background: #ef6632; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.9375rem; letter-spacing: 0.05em; text-transform: uppercase; text-decoration: none; box-shadow: 0 14px 32px rgba(239,102,50,0.42); transition: transform .2s ease, box-shadow .2s ease; }
  .cd-aff-intro__cta:hover { transform: translateY(-2px); box-shadow: 0 18px 40px rgba(239,102,50,0.55); }
  .cd-aff-intro__cta .material-icons { font-size: 18px; }
  .cd-aff-intro__sub { display: block; margin-top: 16px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; color: rgba(255,255,255,0.7); }
  @media (max-width: 980px) {
    .cd-aff-intro__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-aff-intro__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-aff-intro__card { padding: 28px 22px; }
  }
</style>
<div class="cd-aff-intro">
  <p class="cd-aff-intro__lead" data-field="lead">{{lead}}</p>
  <div class="cd-aff-intro__grid">
    <div class="cd-aff-intro__card" data-repeat="props">
      <div class="cd-aff-intro__icon"><span class="material-icons" data-field="icon">{{props.icon}}</span></div>
      <div class="cd-aff-intro__label" data-field="label">{{props.label}}</div>
      <div class="cd-aff-intro__stat" data-field="stat">{{props.stat}}</div>
      <p class="cd-aff-intro__desc" data-field="description">{{props.description}}</p>
    </div>
  </div>
  <div class="cd-aff-intro__cta-wrap">
    <a class="cd-aff-intro__cta" data-field="ctaHref" href="{{ctaHref}}"><span data-field="ctaLabel">{{ctaLabel}}</span> <span class="material-icons">arrow_forward</span></a>
    <span class="cd-aff-intro__sub" data-field="ctaSub">{{ctaSub}}</span>
  </div>
</div>
`.trim();

const PROPS_DEFAULTS = {
  lead: "Fill out the application below to get started — or scroll down to see exactly how the Cardiff Affiliate Program turns introductions you're already making into a recurring commission stream.",
  props: [
    {
      icon: 'payments',
      label: 'Get Paid For Introductions',
      stat: 'Commissions On Every Funded Deal',
      description:
        "You don't need to close the deal. Just refer a business that qualifies for funding and we handle the rest — application, underwriting, funding, and renewal.",
    },
    {
      icon: 'trending_up',
      label: 'Proven Scale',
      stat: '$12B+ Funded And Counting',
      description:
        'Cardiff has funded over twelve billion dollars to small businesses across every state — the same underwriting your referrals get the moment you send them over.',
    },
    {
      icon: 'group_add',
      label: 'Strengthen Your Network',
      stat: 'A Reason To Stay In Touch',
      description:
        "Give your clients, vendors, and contacts a same-day funding option they actually need — and become the connector they call back the next time capital matters.",
    },
  ],
  ctaLabel: 'Become An Affiliate',
  ctaHref: '#affiliate-application',
  ctaSub: 'Free to join. Approvals in less than 2 minutes.',
} as const;

const propsBlock = {
  id: 'sec-1-props',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: PROPS_HTML,
  fields: [
    { name: 'lead', label: 'Lead paragraph', type: 'textarea', default: PROPS_DEFAULTS.lead },
    {
      name: 'props',
      label: 'Value-prop cards (3)',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text', default: 'payments' },
        { name: 'label', label: 'Eyebrow label', type: 'text', default: '' },
        { name: 'stat', label: 'Stat / headline', type: 'text', default: '' },
        { name: 'description', label: 'Description', type: 'textarea', default: '' },
      ],
      default: PROPS_DEFAULTS.props,
    },
    { name: 'ctaLabel', label: 'CTA label', type: 'text', default: PROPS_DEFAULTS.ctaLabel },
    { name: 'ctaHref', label: 'CTA href', type: 'text', default: PROPS_DEFAULTS.ctaHref },
    { name: 'ctaSub', label: 'CTA sub-line', type: 'text', default: PROPS_DEFAULTS.ctaSub },
  ],
  values: {
    lead: PROPS_DEFAULTS.lead,
    props: PROPS_DEFAULTS.props.map((p) => ({ ...p })),
    ctaLabel: PROPS_DEFAULTS.ctaLabel,
    ctaHref: PROPS_DEFAULTS.ctaHref,
    ctaSub: PROPS_DEFAULTS.ctaSub,
  },
};

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema/cms');
  const { eq } = await import('drizzle-orm');

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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_SECTION_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_SECTION_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_SECTION_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  // Widen + repaint as a deep-blue brand band (matches iter1 hero gradient).
  sec.maxWidth = '1240px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#1c3370',
    backgroundImage: 'linear-gradient(135deg, #1c3370 0%, #25418b 55%, #1c3370 100%)',
    paddingTop: '88px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-1-title',
    order: 1,
    level: 2,
    content: 'Ready To Start Earning As An Affiliate?',
    alignment: 'center' as const,
    style: {
      color: '#ffffff',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '2.5rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.15',
      margin: '0 auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-1-div',
    order: 2,
    content:
      '<div style="width:64px;height:3px;background:#ffb798;margin:0 auto 32px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, propsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: ${TARGET_SECTION_ID} -> deep-blue value-prop band with 3-card grid (data-repeat="props") + orange CTA.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
