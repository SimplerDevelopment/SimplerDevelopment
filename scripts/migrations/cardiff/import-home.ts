/**
 * Cardiff migration — Step 5: Home page
 *
 * Builds the Cardiff home page as a block-based draft post.
 * Idempotent — re-running updates the existing /home post in place.
 *
 * Run:  npx tsx scripts/migrations/cardiff/import-home.ts
 */

import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

// Cardiff brand palette
const NAVY = '#25418b';
const NAVY_DEEP = '#1c3370';
const BLUE_BRIGHT = '#3273dc';
const BLUE_LIGHT = '#385cc0';
const ORANGE = '#ef6632';
const ORANGE_DEEP = '#d54d1f';
const GREEN_SUCCESS = '#3cb968';
const TEXT_DARK = '#0a0a0a';
const TEXT_MUTED = '#525f7f';
const TEXT_LIGHT_NAVY = '#8297ca';
const LIGHT_BLUE_BG = '#f6f9fc';
const LIGHTER_BLUE_BG = '#fbfcfe';
const WHITE = '#ffffff';

const HEADING_FONT = "Raleway, -apple-system, BlinkMacSystemFont, sans-serif";
const BODY_FONT = "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const HERO_IMG = 'https://cardiff.b-cdn.net/img/home-header-full.png';
const APPLY_URL = 'https://cardiff.co/business/apply';
const CONTACT_URL = '/contact-us';
const LEARN_URL = '/learn';

// Decorative orange divider — used between heading and body in light sections
const orangeDivider = (id: string, order: number, color = ORANGE, width = '60px') => ({
  type: 'text' as const,
  id, order,
  content: `<div style="width:${width};height:3px;background:${color};margin:0 auto;border-radius:2px"></div>`,
  style: { textAlign: 'center' as const, margin: '0 auto 28px auto' },
});

async function importHome() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const state = JSON.parse(readFileSync(join(process.cwd(), 'scripts/migrations/cardiff/.state/ids.json'), 'utf-8'));
  const home = JSON.parse(readFileSync(join(process.cwd(), 'scripts/migrations/cardiff/extracted/home.json'), 'utf-8'));

  const blocks = buildBlocks(home);
  const content = JSON.stringify({ blocks, version: '1.0' });
  const seoTitle = home.title;
  const seoDescription = home.metaDescription;

  const existing = await db.select().from(posts)
    .where(and(eq(posts.slug, 'home'), eq(posts.websiteId, state.websiteId))).limit(1);

  if (existing.length) {
    await db.update(posts).set({
      content, title: 'Home', seoTitle, seoDescription,
      ogImage: home.ogImage, updatedAt: new Date(),
    }).where(eq(posts.id, existing[0].id));
    console.log(`✅ Updated home page id=${existing[0].id} (${blocks.length} top-level blocks)`);
  } else {
    const [page] = await db.insert(posts).values({
      title: 'Home',
      slug: 'home',
      postType: 'page',
      content,
      published: false, // draft
      websiteId: state.websiteId,
      seoTitle,
      seoDescription,
      ogImage: home.ogImage,
    }).returning();
    console.log(`✅ Created home page id=${page.id} (${blocks.length} top-level blocks)`);
  }
  process.exit(0);
}

function buildBlocks(home: any): any[] {
  return [
    // ── HERO ─────────────────────────────────────────────────────────────────
    {
      type: 'hero',
      id: 'home-hero',
      order: 1,
      title: 'Borrow Better',
      subtitle: 'SMALL BUSINESS FINANCING UP TO $250,000',
      description: home.hero.subtitle,
      ctaText: 'Check Eligibility',
      ctaLink: APPLY_URL,
      secondaryCtaText: 'See Loan Options',
      secondaryCtaLink: '#products',
      backgroundImage: HERO_IMG,
      style: {
        minHeight: '640px',
        color: WHITE,
        backgroundColor: NAVY,
        backgroundSize: 'cover',
        backgroundPosition: 'center right',
        customCSS: `background-image: linear-gradient(95deg, rgba(28,51,112,0.96) 0%, rgba(37,65,139,0.88) 38%, rgba(56,92,192,0.6) 70%, rgba(56,92,192,0.35) 100%), url('${HERO_IMG}'); background-size: cover; background-position: center right;`,
      },
      elementStyles: {
        subtitle: {
          color: '#ffb798',
          fontSize: '0.75rem',
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          fontFamily: HEADING_FONT,
          fontWeight: '700',
          margin: '0 0 20px 0',
        },
        title: {
          fontFamily: HEADING_FONT,
          fontSize: '4.5rem',
          fontWeight: '800',
          letterSpacing: '-0.02em',
          lineHeight: '1.02',
          color: WHITE,
          textTransform: 'uppercase',
          margin: '0 0 20px 0',
          customCSS: 'text-shadow: 0 2px 24px rgba(0,0,0,0.42)',
        },
        description: {
          fontFamily: BODY_FONT,
          fontSize: '1.1875rem',
          fontWeight: '400',
          lineHeight: '1.55',
          color: 'rgba(255,255,255,0.92)',
          maxWidth: '560px',
          margin: '0 auto 36px auto',
        },
        cta: {
          backgroundColor: ORANGE,
          color: WHITE,
          fontWeight: '700',
          fontSize: '0.875rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          padding: '18px 38px',
          borderRadius: '6px',
          fontFamily: HEADING_FONT,
          customCSS: 'box-shadow: 0 14px 36px rgba(239,102,50,0.45); transition: all 0.25s ease',
        },
        secondaryCta: {
          color: WHITE,
          fontSize: '0.875rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontFamily: HEADING_FONT,
          fontWeight: '600',
          backgroundColor: 'transparent',
          padding: '18px 32px',
          borderRadius: '6px',
          customCSS: 'border: 1.5px solid rgba(255,255,255,0.5); backdrop-filter: blur(6px); background: rgba(255,255,255,0.06)',
        },
      },
    },

    // ── TRUST BADGES STRIP — now as 3-up icon cards (overlapping into hero) ─
    {
      type: 'section',
      id: 'trust-badges',
      order: 2,
      style: {
        backgroundColor: WHITE,
        paddingTop: '0',
        paddingBottom: '72px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '1160px',
      blocks: [
        {
          type: 'card-grid',
          id: 'trust-cards',
          order: 1,
          columns: 3,
          cards: [
            { id: 't1', title: '$12B+ Funded', description: 'Capital deployed to small businesses across the United States.', icon: 'payments' },
            { id: 't2', title: '2-Minute Decisions', description: 'Tell us about your business. Get an answer before your coffee gets cold.', icon: 'bolt' },
            { id: 't3', title: 'Same-Day Funds', description: 'Approved this morning? The cash is in your account before close of business.', icon: 'schedule' },
          ],
          elementStyles: {
            card: { backgroundColor: WHITE, borderRadius: '14px', padding: '32px 28px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e8edf6', customCSS: 'box-shadow: 0 18px 44px rgba(37,65,139,0.10); margin-top: -56px; transition: all 0.25s ease' },
            cardIcon: { color: ORANGE, fontSize: '36px', margin: '0 0 16px 0' },
            cardTitle: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '1.375rem', fontWeight: '800', letterSpacing: '-0.01em', margin: '0 0 10px 0' },
            cardDescription: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '0.9375rem', lineHeight: '1.6', margin: '0' },
          },
        },
      ],
    },

    // ── LOAN AMOUNT SLIDER (signature Cardiff widget — html-render) ────────
    {
      type: 'section',
      id: 'slider-section',
      order: 25, // place between trust-badges (2) and intro (3)
      style: {
        backgroundColor: WHITE,
        paddingTop: '48px',
        paddingBottom: '64px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '780px',
      blocks: [
        {
          type: 'html-render',
          id: 'loan-slider',
          order: 1,
          width: 'contained',
          fields: [
            { name: 'headline',  type: 'text', label: 'Headline',  default: 'How much cash do you need?' },
            { name: 'subtitle',  type: 'text', label: 'Subtitle',  default: 'Slide to estimate. Decisions in under 2 minutes.' },
            { name: 'minAmount', type: 'number', label: 'Min ($)', default: '5000' },
            { name: 'maxAmount', type: 'number', label: 'Max ($)', default: '250000' },
            { name: 'stepAmount',type: 'number', label: 'Step ($)',default: '5000' },
            { name: 'defaultAmount', type: 'number', label: 'Default ($)', default: '50000' },
            { name: 'ctaText',   type: 'text', label: 'CTA Text', default: 'Check Eligibility' },
            { name: 'ctaUrl',    type: 'url',  label: 'CTA URL',  default: APPLY_URL },
            { name: 'note',      type: 'text', label: 'Trust note', default: 'No collateral. No prepay penalty. Same-day funding.' },
            { name: 'minLabel',  type: 'text', label: 'Min display', default: '$5,000' },
            { name: 'maxLabel',  type: 'text', label: 'Max display', default: '$250,000' },
          ],
          values: {
            headline: 'How much cash do you need?',
            subtitle: 'Slide to estimate. Decisions in under 2 minutes.',
            minAmount: '5000',
            maxAmount: '250000',
            stepAmount: '5000',
            defaultAmount: '50000',
            ctaText: 'Check Eligibility',
            ctaUrl: APPLY_URL,
            note: 'No collateral. No prepay penalty. Same-day funding.',
            minLabel: '$5,000',
            maxLabel: '$250,000',
          },
          html: `<div class="cardiff-loan-slider" style="background:linear-gradient(135deg,#ffffff 0%,#fbfcfe 100%);border:1px solid #e8edf6;border-radius:18px;padding:36px 32px 32px 32px;box-shadow:0 22px 60px rgba(37,65,139,0.14);margin-top:-100px;position:relative;z-index:5">
  <div style="text-align:center">
    <div data-field="headline" style="font-family:${HEADING_FONT};font-size:1.5rem;font-weight:800;color:${NAVY};letter-spacing:-0.012em;margin:0 0 8px 0">How much cash do you need?</div>
    <div data-field="subtitle" style="font-family:${BODY_FONT};font-size:0.9375rem;color:${TEXT_MUTED};margin:0 0 28px 0">Slide to estimate. Decisions in under 2 minutes.</div>
  </div>
  <div style="text-align:center">
    <div id="cls-display" style="font-family:${HEADING_FONT};font-size:3.5rem;font-weight:800;color:${ORANGE};letter-spacing:-0.025em;line-height:1;margin:0 0 24px 0;text-shadow:0 0 30px rgba(239,102,50,0.18)">$50,000</div>
  </div>
  <input id="cls-range" type="range" min="{{minAmount}}" max="{{maxAmount}}" step="{{stepAmount}}" value="{{defaultAmount}}"
         oninput="(function(s){var v=Number(s.value);var d=document.getElementById('cls-display');if(d){d.textContent='$'+v.toLocaleString();}var c=document.getElementById('cls-cta');if(c){var u=new URL(c.href,location.href);u.searchParams.set('amount',v);c.href=u.toString();}var p=((v-{{minAmount}})/({{maxAmount}}-{{minAmount}}))*100;s.style.background='linear-gradient(to right, ${ORANGE} 0%, ${ORANGE} '+p+'%, #e8edf6 '+p+'%, #e8edf6 100%)';})(this)"
         style="width:100%;height:8px;background:linear-gradient(to right,${ORANGE} 0%,${ORANGE} 20%,#e8edf6 20%,#e8edf6 100%);border-radius:8px;outline:none;-webkit-appearance:none;appearance:none;cursor:pointer;margin:0 0 12px 0" />
  <div style="display:flex;justify-content:space-between;font-family:${BODY_FONT};font-size:0.75rem;color:${TEXT_MUTED};font-weight:600;letter-spacing:0.04em;margin:0 0 28px 0">
    <span data-field="minLabel">$5,000</span>
    <span data-field="maxLabel">$250,000</span>
  </div>
  <div style="text-align:center;margin:0 0 18px 0">
    <a id="cls-cta" href="{{ctaUrl}}" data-field="ctaText" style="display:inline-block;background:${ORANGE};color:#ffffff;font-family:${HEADING_FONT};font-weight:700;font-size:0.9375rem;letter-spacing:0.12em;text-transform:uppercase;padding:18px 44px;border-radius:8px;text-decoration:none;box-shadow:0 14px 36px rgba(239,102,50,0.42);transition:all 0.2s ease">Check Eligibility</a>
  </div>
  <div data-field="note" style="text-align:center;font-family:${BODY_FONT};font-size:0.8125rem;color:${TEXT_MUTED};margin:0">No collateral. No prepay penalty. Same-day funding.</div>
  <style>
    .cardiff-loan-slider input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance:none; appearance:none;
      width:28px; height:28px; border-radius:50%;
      background:#ffffff; border:3px solid ${ORANGE};
      box-shadow:0 6px 16px rgba(239,102,50,0.4);
      cursor:pointer; transition: transform 0.15s ease;
    }
    .cardiff-loan-slider input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.12); }
    .cardiff-loan-slider input[type="range"]::-moz-range-thumb {
      width:28px; height:28px; border-radius:50%;
      background:#ffffff; border:3px solid ${ORANGE};
      box-shadow:0 6px 16px rgba(239,102,50,0.4);
      cursor:pointer;
    }
    .cardiff-loan-slider a[id="cls-cta"]:hover { transform: translateY(-2px); box-shadow:0 18px 42px rgba(239,102,50,0.5); }
  </style>
</div>`,
        },
      ],
    },

    // ── INTRO ────────────────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'intro',
      order: 3,
      style: {
        backgroundColor: WHITE,
        paddingTop: '96px',
        paddingBottom: '64px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '760px',
      blocks: [
        {
          type: 'heading',
          id: 'intro-overline',
          order: 1,
          level: 6,
          content: 'A SMARTER WAY TO BORROW',
          alignment: 'center',
          style: {
            color: ORANGE,
            fontFamily: HEADING_FONT,
            fontSize: '0.6875rem',
            fontWeight: '700',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            margin: '0 0 18px 0',
            textAlign: 'center',
          },
        },
        {
          type: 'heading',
          id: 'intro-title',
          order: 2,
          level: 2,
          content: home.intro.title,
          alignment: 'center',
          style: {
            color: NAVY,
            fontFamily: HEADING_FONT,
            fontSize: '2.75rem',
            fontWeight: '800',
            letterSpacing: '-0.018em',
            lineHeight: '1.15',
            margin: '0 0 28px 0',
            textAlign: 'center',
          },
        },
        orangeDivider('intro-div', 3),
        {
          type: 'text',
          id: 'intro-body',
          order: 4,
          content: home.intro.body,
          style: {
            color: TEXT_MUTED,
            fontFamily: BODY_FONT,
            fontSize: '1.125rem',
            lineHeight: '1.7',
            textAlign: 'center',
            margin: '0 auto',
          },
        },
      ],
    },

    // ── PROCESS / 5-STEP TIMELINE ───────────────────────────────────────────
    {
      type: 'section',
      id: 'process',
      order: 4,
      style: {
        backgroundColor: WHITE,
        paddingTop: '24px',
        paddingBottom: '96px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '1280px',
      blocks: [
        {
          type: 'heading', alignment: 'center', id: 'proc-overline', order: 1, level: 6,
          content: 'OUR PROCESS',
          style: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0', textAlign: 'center' },
        },
        {
          type: 'heading', alignment: 'center', id: 'proc-title', order: 2, level: 2,
          content: 'Funded in five simple steps',
          style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.018em', lineHeight: '1.18', margin: '0 0 20px 0', textAlign: 'center' },
        },
        {
          type: 'text', id: 'proc-sub', order: 3,
          content: 'From application to cash in your account — built for the way you actually run your business.',
          style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.65', textAlign: 'center', maxWidth: '640px', margin: '0 auto 56px auto' },
        },
        {
          type: 'card-grid',
          id: 'process-cards',
          order: 4,
          columns: 5 as any,
          cards: home.process.steps.map((s: any, i: number) => ({
            id: `step-${i + 1}`,
            title: s.title,
            description: s.body,
            icon: ['edit_note', 'verified', 'account_balance', 'autorenew', 'rocket_launch'][i] || 'check_circle',
          })),
          elementStyles: {
            card: { backgroundColor: WHITE, borderRadius: '14px', padding: '28px 22px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e8edf6', customCSS: `box-shadow: 0 6px 20px rgba(37,65,139,0.06); position: relative; transition: all 0.25s ease;` },
            cardIcon: { color: ORANGE, fontSize: '32px', margin: '0 0 14px 0', customCSS: `background: rgba(239,102,50,0.08); width: 56px; height: 56px; display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; padding: 0;` },
            cardTitle: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '1rem', fontWeight: '800', letterSpacing: '-0.005em', lineHeight: '1.25', margin: '0 0 8px 0' },
            cardDescription: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '0.8125rem', lineHeight: '1.55', margin: '0' },
          },
        },
      ],
    },

    // ── STATS BAND (dark navy — high contrast feature band) ────────────────
    {
      type: 'section',
      id: 'stats-band',
      order: 5,
      style: {
        backgroundColor: NAVY_DEEP,
        paddingTop: '88px',
        paddingBottom: '88px',
        paddingLeft: '24px',
        paddingRight: '24px',
        color: WHITE,
        customCSS: `background-image: radial-gradient(ellipse at 50% 0%, rgba(56,92,192,0.32) 0%, transparent 65%), linear-gradient(180deg, ${NAVY_DEEP} 0%, ${NAVY} 100%);`,
      },
      maxWidth: '1080px',
      blocks: [
        {
          type: 'heading',
          alignment: 'center',
          id: 'stats-overline',
          order: 1,
          level: 6,
          content: 'CARDIFF BY THE NUMBERS',
          style: { color: '#ffb798', fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0', textAlign: 'center' },
        },
        {
          type: 'heading',
          alignment: 'center',
          id: 'stats-title',
          order: 2,
          level: 2,
          content: 'Built for businesses that move fast',
          style: { color: WHITE, fontFamily: HEADING_FONT, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.018em', margin: '0 0 64px 0', textAlign: 'center' },
        },
        {
          type: 'stats',
          id: 'stats-grid',
          order: 3,
          columns: 4,
          stats: home.stats.map((s: any, i: number) => ({ id: `kpi-${i + 1}`, value: s.value, label: s.label })),
          elementStyles: {
            statValue: { color: '#ffb798', fontFamily: HEADING_FONT, fontSize: '3.5rem', fontWeight: '800', letterSpacing: '-0.025em', customCSS: 'text-shadow: 0 0 30px rgba(239,102,50,0.25)' },
            statLabel: { color: 'rgba(255,255,255,0.72)', fontFamily: BODY_FONT, fontSize: '0.875rem', lineHeight: '1.5', marginTop: '10px' },
          },
        },
      ],
    },

    // ── ALTERNATIVE LENDING (white) ─────────────────────────────────────────
    {
      type: 'section',
      id: 'alt-lending',
      order: 6,
      style: {
        backgroundColor: WHITE,
        paddingTop: '96px',
        paddingBottom: '64px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '880px',
      blocks: [
        {
          type: 'heading',
          alignment: 'center',
          id: 'alt-overline',
          order: 1,
          level: 6,
          content: 'ALTERNATIVE BUSINESS LENDING',
          style: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0', textAlign: 'center' },
        },
        {
          type: 'heading',
          alignment: 'center',
          id: 'alt-title',
          order: 2,
          level: 2,
          content: home.alternativeLending.title,
          style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.018em', lineHeight: '1.18', margin: '0 0 28px 0', textAlign: 'center' },
        },
        orangeDivider('alt-div', 3),
        {
          type: 'text',
          id: 'alt-body',
          order: 4,
          content: home.alternativeLending.body,
          style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.75', textAlign: 'center' },
        },
      ],
    },

    // ── PRODUCTS CARD GRID ──────────────────────────────────────────────────
    {
      type: 'section',
      id: 'products',
      order: 7,
      style: {
        backgroundColor: WHITE,
        paddingTop: '32px',
        paddingBottom: '96px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '1180px',
      blocks: [
        {
          type: 'heading',
          alignment: 'center',
          id: 'products-overline',
          order: 1,
          level: 6,
          content: 'BORROW THE WAY YOU NEED TO',
          style: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0', textAlign: 'center' },
        },
        {
          type: 'heading',
          alignment: 'center',
          id: 'products-title',
          order: 2,
          level: 2,
          content: 'Six ways Cardiff funds small businesses',
          style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.018em', margin: '0 0 56px 0', textAlign: 'center' },
        },
        {
          type: 'card-grid',
          id: 'products-grid',
          order: 3,
          columns: 3,
          iconSize: '32px',
          cards: [
            { id: 'p1', title: 'Working Capital Loans', description: 'Cash you can deploy today — payroll, inventory, equipment, opportunity capital. Repay on a schedule that matches your revenue.', icon: 'account_balance_wallet', link: '/business-loans/products/working-capital/' },
            { id: 'p2', title: 'Business Line of Credit', description: 'Draw what you need, when you need it. Only pay interest on the balance you actually use.', icon: 'savings', link: '/business-loans/products/line-of-credit/' },
            { id: 'p3', title: 'Equipment Financing', description: 'Title or non-title. New, used, or refurbished. Fund the equipment that grows your operation.', icon: 'precision_manufacturing', link: '/business-loans/products/equipment-leasing/' },
            { id: 'p4', title: 'Merchant Cash Advance', description: 'Turn future card sales into working capital today. Payments rise and fall with your revenue.', icon: 'point_of_sale', link: '/business-loans/products/merchant-cash-advance/' },
            { id: 'p5', title: 'SBA Loans', description: 'Long terms, low rates, government-backed. We help you navigate the paperwork and the timeline.', icon: 'verified', link: '/business-loans/products/sba-loans/' },
            { id: 'p6', title: 'Business Credit Cards', description: 'Day-to-day spend on terms built for businesses — not consumer programs in a different wrapper.', icon: 'credit_card', link: '/business-loans/products/business-cards/' },
          ],
          elementStyles: {
            card: { backgroundColor: WHITE, borderRadius: '16px', padding: '36px 30px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e8edf6', customCSS: 'box-shadow: 0 8px 28px rgba(37,65,139,0.08); transition: all 0.25s ease; border-top: 3px solid ' + ORANGE },
            cardIcon: { color: NAVY, fontSize: '36px', margin: '0 0 20px 0', customCSS: `background: linear-gradient(135deg, rgba(239,102,50,0.12), rgba(37,65,139,0.06)); width: 64px; height: 64px; display: inline-flex; align-items: center; justify-content: center; border-radius: 14px; padding: 0;` },
            cardTitle: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '1.375rem', fontWeight: '800', margin: '0 0 14px 0', letterSpacing: '-0.012em' },
            cardDescription: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '0.9375rem', lineHeight: '1.65', margin: '0' },
          },
        },
      ],
    },

    // ── DESIGNED FOR YOUR BUSINESS (white, two-column with bullet list) ─────
    {
      type: 'section',
      id: 'designed',
      order: 8,
      style: {
        backgroundColor: LIGHT_BLUE_BG,
        paddingTop: '96px',
        paddingBottom: '96px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '1080px',
      blocks: [
        {
          type: 'columns',
          id: 'designed-cols',
          order: 1,
          gap: 'lg',
          stackOnMobile: true,
          columns: [
            {
              id: 'col-left',
              width: '50%',
              verticalAlign: 'center',
              blocks: [
                { type: 'heading', id: 'd-overline', order: 1, level: 6, content: 'BUILT FOR HOW YOU RUN', style: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0' } },
                { type: 'heading', id: 'd-title', order: 2, level: 2, content: home.designed.title, style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.25rem', fontWeight: '800', letterSpacing: '-0.018em', lineHeight: '1.18', margin: '0 0 24px 0' } },
                { type: 'text', id: 'd-body1', order: 3, content: home.designed.paragraphs[0], style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.7', margin: '0 0 18px 0' } },
                { type: 'text', id: 'd-body2', order: 4, content: home.designed.paragraphs[3], style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.7', margin: '0' } },
              ],
            },
            {
              id: 'col-right',
              width: '50%',
              verticalAlign: 'center',
              blocks: [
                {
                  type: 'card-grid',
                  id: 'd-bullets',
                  order: 1,
                  columns: 2,
                  cards: [
                    { id: 'b1', title: 'Retail', description: 'Inventory, seasonal swings, location buildouts.', icon: 'storefront' },
                    { id: 'b2', title: 'Healthcare', description: 'Equipment, expansions, payroll bridges.', icon: 'local_hospital' },
                    { id: 'b3', title: 'Construction', description: 'Materials, payroll, project-cycle bridges.', icon: 'construction' },
                    { id: 'b4', title: 'Hospitality', description: 'Renovations, supply, slow-season cash flow.', icon: 'restaurant' },
                    { id: 'b5', title: 'Auto Repair', description: 'Lifts, diagnostics, partner buyouts.', icon: 'directions_car' },
                    { id: 'b6', title: 'Trucking', description: 'Trucks, trailers, maintenance, fuel float.', icon: 'local_shipping' },
                  ],
                  elementStyles: {
                    card: { backgroundColor: WHITE, borderRadius: '10px', padding: '20px 18px', customCSS: 'box-shadow: 0 2px 10px rgba(37,65,139,0.06)' },
                    cardIcon: { color: ORANGE, fontSize: '24px', margin: '0 0 10px 0' },
                    cardTitle: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '0.9375rem', fontWeight: '700', margin: '0 0 6px 0', letterSpacing: '0' },
                    cardDescription: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '0.8125rem', lineHeight: '1.5', margin: '0' },
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    // ── BETTER CREDIT OPTIONS (white) ───────────────────────────────────────
    {
      type: 'section',
      id: 'better-credit',
      order: 9,
      style: {
        backgroundColor: WHITE,
        paddingTop: '96px',
        paddingBottom: '96px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '860px',
      blocks: [
        { type: 'heading', alignment: 'center', id: 'bc-overline', order: 1, level: 6, content: 'WHEN BANKS SAY NO', style: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0', textAlign: 'center' } },
        { type: 'heading', alignment: 'center', id: 'bc-title', order: 2, level: 2, content: home.betterCredit.title, style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.018em', lineHeight: '1.18', margin: '0 0 28px 0', textAlign: 'center' } },
        orangeDivider('bc-div', 3),
        { type: 'text', id: 'bc-p1', order: 4, content: home.betterCredit.paragraphs[0], style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.75', margin: '0 0 20px 0', textAlign: 'center' } },
        { type: 'text', id: 'bc-p2', order: 5, content: home.betterCredit.paragraphs[1], style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.75', margin: '0 0 20px 0', textAlign: 'center' } },
        { type: 'text', id: 'bc-p3', order: 6, content: home.betterCredit.paragraphs[2], style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.75', margin: '0', textAlign: 'center' } },
      ],
    },

    // ── MID CTA (solid navy) ────────────────────────────────────────────────
    {
      type: 'section',
      id: 'mid-cta',
      order: 10,
      style: {
        backgroundColor: NAVY,
        paddingTop: '96px',
        paddingBottom: '96px',
        paddingLeft: '24px',
        paddingRight: '24px',
        color: WHITE,
        customCSS: `background-image: radial-gradient(ellipse at 50% 0%, rgba(56,92,192,0.35) 0%, transparent 60%);`,
      },
      maxWidth: '880px',
      blocks: [
        {
          type: 'heading',
          alignment: 'center',
          id: 'midcta-overline',
          order: 1,
          level: 6,
          content: 'STOP SHOPPING. START GROWING.',
          style: { color: '#ffd9c6', fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 18px 0', textAlign: 'center' },
        },
        {
          type: 'heading',
          alignment: 'center',
          id: 'midcta-title',
          order: 2,
          level: 2,
          content: home.midCta.title,
          style: { color: WHITE, fontFamily: HEADING_FONT, fontSize: '3rem', fontWeight: '800', letterSpacing: '-0.02em', lineHeight: '1.12', margin: '0 0 28px 0', textAlign: 'center' },
        },
        {
          type: 'text',
          id: 'midcta-body',
          order: 3,
          content: home.midCta.lines.join(' '),
          style: { color: 'rgba(255,255,255,0.84)', fontFamily: BODY_FONT, fontSize: '1.1875rem', lineHeight: '1.65', textAlign: 'center', margin: '0 0 40px 0' },
        },
        {
          type: 'button',
          id: 'midcta-btn',
          order: 4,
          text: 'Apply In 2 Minutes',
          url: APPLY_URL,
          variant: 'primary',
          size: 'lg',
          alignment: 'center',
          icon: 'arrow_forward',
          iconPosition: 'right',
          hoverEffect: 'lift',
          style: { margin: '0 auto' },
        },
      ],
    },

    // ── WHY CARDIFF ─────────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'why',
      order: 11,
      style: {
        backgroundColor: WHITE,
        paddingTop: '96px',
        paddingBottom: '96px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '760px',
      blocks: [
        { type: 'heading', alignment: 'center', id: 'why-overline', order: 1, level: 6, content: 'WHY CARDIFF', style: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0', textAlign: 'center' } },
        { type: 'heading', alignment: 'center', id: 'why-title', order: 2, level: 2, content: 'When you\'re ready to move, we make it possible.', style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.018em', lineHeight: '1.15', margin: '0 0 28px 0', textAlign: 'center' } },
        orangeDivider('why-div', 3),
        { type: 'text', id: 'why-p1', order: 4, content: home.whyCardiff.paragraphs[0], style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.125rem', lineHeight: '1.7', margin: '0 0 20px 0', textAlign: 'center' } },
        { type: 'text', id: 'why-p2', order: 5, content: home.whyCardiff.paragraphs[1], style: { color: NAVY, fontFamily: BODY_FONT, fontSize: '1.25rem', lineHeight: '1.6', fontWeight: '600', textAlign: 'center', margin: '0' } },
      ],
    },

    // ── FAQ ACCORDION ───────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'faq',
      order: 12,
      style: {
        backgroundColor: LIGHT_BLUE_BG,
        paddingTop: '96px',
        paddingBottom: '96px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '860px',
      blocks: [
        { type: 'heading', alignment: 'center', id: 'faq-overline', order: 1, level: 6, content: 'YOU ASKED. WE ANSWERED.', style: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0', textAlign: 'center' } },
        { type: 'heading', alignment: 'center', id: 'faq-title', order: 2, level: 2, content: 'Frequently asked questions', style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.018em', margin: '0 0 48px 0', textAlign: 'center' } },
        {
          type: 'accordion',
          id: 'faq-acc',
          order: 3,
          items: home.faq.map((f: any, i: number) => ({
            id: `q-${i + 1}`,
            title: f.q,
            content: f.a,
          })),
        },
      ],
    },

    // ── PREMIUM TESTIMONIALS (html-render with avatar + stars) ─────────────
    {
      type: 'section',
      id: 'testimonials',
      order: 13,
      style: {
        backgroundColor: WHITE,
        paddingTop: '96px',
        paddingBottom: '96px',
        paddingLeft: '24px',
        paddingRight: '24px',
      },
      maxWidth: '1200px',
      blocks: [
        { type: 'heading', alignment: 'center', id: 't-overline', order: 1, level: 6, content: 'FROM THE OWNERS WE FUND', style: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0', textAlign: 'center' } },
        { type: 'heading', alignment: 'center', id: 't-title', order: 2, level: 2, content: 'Trusted by small businesses across the country', style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.25rem', fontWeight: '800', letterSpacing: '-0.018em', lineHeight: '1.2', margin: '0 0 56px 0', textAlign: 'center' } },
        {
          type: 'html-render',
          id: 't-grid',
          order: 3,
          width: 'full',
          fields: [
            { name: 'cardBg',     type: 'color', label: 'Card background', default: LIGHTER_BLUE_BG },
            { name: 'accentColor',type: 'color', label: 'Accent color',    default: ORANGE },
            {
              name: 'testimonials',
              type: 'array',
              label: 'Testimonials',
              itemFields: [
                { name: 'avatar',  type: 'image', label: 'Photo' },
                { name: 'author',  type: 'text',  label: 'Author' },
                { name: 'role',    type: 'text',  label: 'Role / Business' },
                { name: 'quote',   type: 'textarea', label: 'Quote' },
                { name: 'rating',  type: 'select', label: 'Stars', options: [
                  { label: '5 stars', value: '5' }, { label: '4.5 stars', value: '4.5' }, { label: '4 stars', value: '4' }
                ], default: '5' },
              ],
            },
          ],
          values: {
            cardBg: LIGHTER_BLUE_BG,
            accentColor: ORANGE,
            testimonials: home.testimonials.map((t: any) => ({
              avatar: t.image,
              author: t.author,
              role: 'Small Business Owner',
              quote: t.quote,
              rating: '5',
            })),
          },
          html: `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:28px;margin:0 auto;max-width:1180px">
  <div data-repeat="testimonials" style="background:${LIGHTER_BLUE_BG};border-radius:18px;padding:36px 30px;border:1px solid #e8edf6;box-shadow:0 8px 28px rgba(37,65,139,0.07);display:flex;flex-direction:column;position:relative;transition:all 0.25s ease">
    <div style="position:absolute;top:24px;right:28px;font-family:Georgia,serif;font-size:5rem;line-height:1;color:${ORANGE};opacity:0.18;font-weight:700">"</div>
    <div style="display:flex;align-items:center;gap:16px;margin:0 0 22px 0;position:relative;z-index:2">
      <img src="{{testimonials.avatar}}" alt="{{testimonials.author}}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid #ffffff;box-shadow:0 4px 12px rgba(37,65,139,0.18)" />
      <div>
        <div data-field="author" style="font-family:${HEADING_FONT};font-weight:800;font-size:1.0625rem;color:${NAVY};letter-spacing:-0.005em">Author</div>
        <div data-field="role" style="font-family:${BODY_FONT};font-size:0.8125rem;color:${TEXT_MUTED};margin-top:2px">Role</div>
      </div>
    </div>
    <div style="display:flex;gap:3px;margin:0 0 16px 0;position:relative;z-index:2">
      <span style="color:${ORANGE};font-size:1.0625rem">★★★★★</span>
    </div>
    <div data-field="quote" style="font-family:${BODY_FONT};font-size:0.9375rem;line-height:1.65;color:${TEXT_DARK};font-style:italic;flex:1;position:relative;z-index:2;margin:0">Quote text</div>
    <div style="display:flex;align-items:center;gap:8px;margin:24px 0 0 0;padding-top:18px;border-top:1px solid #e8edf6;position:relative;z-index:2">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${ORANGE};color:#fff;font-size:11px;font-weight:700">✓</span>
      <span style="font-family:${BODY_FONT};font-size:0.75rem;color:${TEXT_MUTED};font-weight:600;letter-spacing:0.04em;text-transform:uppercase">Verified Customer</span>
    </div>
  </div>
</div>`,
        },
        {
          type: 'text',
          id: 't-disclaimer',
          order: 4,
          content: '*Actual customer testimonials. Photos are illustrative only.',
          style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '0.75rem', textAlign: 'center', margin: '40px auto 0 auto', opacity: '0.85' },
        },
      ],
    },

    // ── FINAL CTA ────────────────────────────────────────────────────────────
    {
      type: 'cta',
      id: 'final-cta',
      order: 14,
      title: 'Ready to borrow better?',
      description: 'Apply in under two minutes. No collateral required. Decisions in minutes, funds the same day.',
      primaryButtonText: 'Check Eligibility',
      primaryButtonUrl: APPLY_URL,
      secondaryButtonText: 'Talk to a Lending Specialist',
      secondaryButtonUrl: CONTACT_URL,
      backgroundStyle: 'solid',
      style: {
        backgroundColor: NAVY_DEEP,
        paddingTop: '96px',
        paddingBottom: '96px',
        paddingLeft: '24px',
        paddingRight: '24px',
        color: WHITE,
        customCSS: `background-image: linear-gradient(135deg, ${NAVY_DEEP} 0%, ${NAVY} 100%);`,
      },
      elementStyles: {
        title: { color: WHITE, fontFamily: HEADING_FONT, fontSize: '2.75rem', fontWeight: '800', letterSpacing: '-0.018em', textAlign: 'center', margin: '0 0 20px 0' },
        description: { color: 'rgba(255,255,255,0.82)', fontFamily: BODY_FONT, fontSize: '1.125rem', lineHeight: '1.6', textAlign: 'center', maxWidth: '640px', margin: '0 auto 40px auto' },
        primaryButton: { backgroundColor: ORANGE, color: WHITE, fontFamily: HEADING_FONT, fontWeight: '700', fontSize: '0.9375rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '18px 40px', borderRadius: '6px', customCSS: 'box-shadow: 0 12px 30px rgba(239,102,50,0.4)' },
        secondaryButton: { backgroundColor: 'transparent', color: WHITE, fontFamily: HEADING_FONT, fontWeight: '600', fontSize: '0.9375rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '18px 36px', borderRadius: '6px', customCSS: 'border: 1.5px solid rgba(255,255,255,0.55); background: rgba(255,255,255,0.06); backdrop-filter: blur(4px)' },
      },
    },
  ];
}

importHome().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
