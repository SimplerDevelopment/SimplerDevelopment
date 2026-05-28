/**
 * Cardiff migration — Custom About page builder
 *
 * The generic marketing importer missed the 4 stat cards and team photos
 * because they were rendered inside non-standard Divi modules. This script
 * builds a hand-tuned About page with:
 *   - Compact hero
 *   - Cardiff intro paragraph
 *   - "The Cardiff Difference" — 4 stat cards in a row
 *   - Leadership grid with photos
 *   - Final CTA
 *
 * Run:  npx tsx scripts/migrations/cardiff/import-about.ts
 */

import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const NAVY = '#25418b';
const NAVY_DEEP = '#1c3370';
const ORANGE = '#ef6632';
const TEXT_DARK = '#0a0a0a';
const TEXT_MUTED = '#525f7f';
const LIGHT_BLUE_BG = '#f6f9fc';
const WHITE = '#ffffff';
const HEADING_FONT = "Raleway, -apple-system, BlinkMacSystemFont, sans-serif";
const BODY_FONT = "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const APPLY_URL = 'https://cardiff.co/business/apply';

const TEAM = [
  { name: 'William Stern',     title: 'Founder and CEO',      photo: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/william-stern-cardiff-ceo-and-founder.jpg',     link: '/team-william-stern' },
  { name: 'Dean Lyulkin',      title: 'CEO',                  photo: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/dean-lyulkin-cardiff-ceo-and-founder.jpg',      link: '/team-dean-lyulkin' },
  { name: 'Ali Irani-Tehrani', title: 'Managing Partner',     photo: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/ali-irani-tehrani-cardiff-managing-founder.jpg', link: '/team-ali-irani-tehrani' },
  { name: 'Mo Irani-Tehrani',  title: 'Managing Partner',     photo: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/mo-irani-tehrani-cardiff-managing-founder.jpg',  link: '/team-mo-irani-tehrani' },
];

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const state = JSON.parse(readFileSync(join(process.cwd(), 'scripts/migrations/cardiff/.state/ids.json'), 'utf-8'));

  const blocks = buildBlocks();
  const content = JSON.stringify({ blocks, version: '1.0' });

  const existing = await db.select().from(posts)
    .where(and(eq(posts.slug, 'about'), eq(posts.websiteId, state.websiteId))).limit(1);

  if (existing.length) {
    await db.update(posts).set({
      content,
      title: 'About Cardiff',
      seoTitle: 'About Cardiff — A trusted leader in small business lending',
      seoDescription: 'Cardiff has funded over $12 billion to small businesses across the US. Meet the leadership team behind a smarter way to borrow.',
      ogImage: 'https://cardiff.b-cdn.net/img/cardiff-logo-opengraph-meta.png',
      updatedAt: new Date(),
    }).where(eq(posts.id, existing[0].id));
    console.log(`✅ updated about page id=${existing[0].id} (${blocks.length} top-level blocks)`);
  } else {
    const [p] = await db.insert(posts).values({
      title: 'About Cardiff',
      slug: 'about',
      postType: 'page',
      content,
      published: true,
      websiteId: state.websiteId,
      seoTitle: 'About Cardiff — A trusted leader in small business lending',
      seoDescription: 'Cardiff has funded over $12 billion to small businesses across the US.',
      ogImage: 'https://cardiff.b-cdn.net/img/cardiff-logo-opengraph-meta.png',
    }).returning();
    console.log(`✅ created about page id=${p.id} (${blocks.length} top-level blocks)`);
  }
  process.exit(0);
}

function buildBlocks(): any[] {
  return [
    // ── HERO ─────────────────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'about-hero',
      order: 1,
      style: {
        backgroundColor: NAVY,
        paddingTop: '80px',
        paddingBottom: '64px',
        paddingLeft: '24px',
        paddingRight: '24px',
        color: WHITE,
        customCSS: `background-image: radial-gradient(ellipse at 60% 0%, rgba(56,92,192,0.45) 0%, transparent 65%), linear-gradient(135deg, ${NAVY_DEEP} 0%, ${NAVY} 60%, #385cc0 100%);`,
      },
      maxWidth: '1080px',
      blocks: [
        { type: 'heading', alignment: 'center', id: 'h-over', order: 1, level: 6, content: 'ABOUT CARDIFF',
          style: { color: '#ffb798', fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0', textAlign: 'center' } },
        { type: 'heading', alignment: 'center', id: 'h-title', order: 2, level: 1, content: 'A trusted leader in small business lending',
          style: { color: WHITE, fontFamily: HEADING_FONT, fontSize: '3rem', fontWeight: '800', letterSpacing: '-0.02em', lineHeight: '1.1', margin: '0 0 18px 0', textAlign: 'center', customCSS: 'text-shadow: 0 2px 16px rgba(0,0,0,0.32)' } },
        { type: 'text', id: 'h-sub', order: 3, content: 'Headquartered in Del Mar, California. Funded over $12 billion to small businesses across the United States since 2004.',
          style: { color: 'rgba(255,255,255,0.85)', fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.6', textAlign: 'center', maxWidth: '680px', margin: '0 auto' } },
      ],
    },

    // ── INTRO PARAGRAPHS ────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'about-intro',
      order: 2,
      style: { backgroundColor: WHITE, paddingTop: '80px', paddingBottom: '64px', paddingLeft: '24px', paddingRight: '24px' },
      maxWidth: '760px',
      blocks: [
        { type: 'text', id: 'intro-p1', order: 1,
          content: 'Cardiff, a small business lender based in San Diego, offers fast, flexible financing solutions tailored to the needs of small businesses throughout the US. Since 2004, the company has funded over $12 billion, providing approval in minutes and same-day funding in most cases.',
          style: { color: TEXT_DARK, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.75', margin: '0 0 24px 0', textAlign: 'center' } },
        { type: 'text', id: 'intro-p2', order: 2,
          content: 'Backed by the latest technology and integrations with partners like Plaid®, Cardiff blends real-time financial analysis with personalized service, to deliver a reliable, transparent experience for business owners across industries like construction, restaurants, trucking, and more.',
          style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1rem', lineHeight: '1.75', margin: '0', textAlign: 'center' } },
      ],
    },

    // ── THE CARDIFF DIFFERENCE — 4 stat cards ──────────────────────────────
    {
      type: 'section',
      id: 'diff',
      order: 3,
      style: { backgroundColor: LIGHT_BLUE_BG, paddingTop: '88px', paddingBottom: '88px', paddingLeft: '24px', paddingRight: '24px' },
      maxWidth: '1180px',
      blocks: [
        { type: 'heading', alignment: 'center', id: 'diff-over', order: 1, level: 6, content: 'THE CARDIFF DIFFERENCE',
          style: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 14px 0', textAlign: 'center' } },
        { type: 'heading', alignment: 'center', id: 'diff-title', order: 2, level: 2, content: 'Real numbers. Real impact.',
          style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.25rem', fontWeight: '800', letterSpacing: '-0.018em', margin: '0 0 16px 0', textAlign: 'center' } },
        { type: 'text', id: 'diff-sub', order: 3, content: 'Here\'s why thousands of businesses choose Cardiff.',
          style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.6', textAlign: 'center', margin: '0 0 56px 0' } },
        {
          type: 'card-grid',
          id: 'diff-grid',
          order: 4,
          columns: 4,
          cards: [
            { id: 'd1', title: '21+',  description: 'More than two decades supporting Main Street.', icon: 'history' },
            { id: 'd2', title: '12B+', description: 'Over $12 Billion funded to thousands of small businesses.', icon: 'payments' },
            { id: 'd3', title: '<24H', description: 'Approvals in minutes. Funding the same day.', icon: 'schedule' },
            { id: 'd4', title: '93%',  description: 'Over 90% of applicants are approved for small business financing.', icon: 'verified' },
          ],
          elementStyles: {
            card: { backgroundColor: WHITE, borderRadius: '16px', padding: '32px 24px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e8edf6', customCSS: `box-shadow: 0 12px 32px rgba(37,65,139,0.10); border-top: 3px solid ${ORANGE}; text-align: center;` },
            cardIcon: { color: NAVY, fontSize: '28px', margin: '0 auto 14px auto', customCSS: `background: linear-gradient(135deg, rgba(239,102,50,0.12), rgba(37,65,139,0.06)); width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 12px;` },
            cardTitle: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.75rem', fontWeight: '800', letterSpacing: '-0.025em', margin: '0 0 10px 0', lineHeight: '1' },
            cardDescription: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '0.875rem', lineHeight: '1.55', margin: '0' },
          },
        },
      ],
    },

    // ── LEADERSHIP ──────────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'leadership',
      order: 4,
      style: { backgroundColor: WHITE, paddingTop: '88px', paddingBottom: '88px', paddingLeft: '24px', paddingRight: '24px' },
      maxWidth: '1180px',
      blocks: [
        { type: 'heading', alignment: 'center', id: 'lead-over', order: 1, level: 6, content: 'LEADERSHIP',
          style: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 14px 0', textAlign: 'center' } },
        { type: 'heading', alignment: 'center', id: 'lead-title', order: 2, level: 2, content: 'Meet the team',
          style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2.25rem', fontWeight: '800', letterSpacing: '-0.018em', margin: '0 0 16px 0', textAlign: 'center' } },
        { type: 'text', id: 'lead-sub', order: 3, content: 'The people guiding our mission to make business funding simple and transparent.',
          style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.6', textAlign: 'center', margin: '0 0 56px 0' } },
        {
          type: 'card-grid',
          id: 'team-grid',
          order: 4,
          columns: 4,
          cards: TEAM.map(t => ({
            id: t.name.toLowerCase().replace(/[^a-z]/g, '-'),
            title: t.name,
            description: t.title,
            image: t.photo,
            link: t.link,
          })),
          elementStyles: {
            card: { backgroundColor: WHITE, borderRadius: '14px', padding: '0', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e8edf6', customCSS: 'box-shadow: 0 8px 28px rgba(37,65,139,0.08); overflow: hidden; transition: all 0.25s ease' },
            cardImage: { width: '100%', height: '280px', objectFit: 'cover' as const, display: 'block' },
            cardTitle: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '1.25rem', fontWeight: '800', margin: '20px 22px 6px 22px', letterSpacing: '-0.005em' },
            cardDescription: { color: ORANGE, fontFamily: HEADING_FONT, fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.18em', textTransform: 'uppercase' as const, margin: '0 22px 22px 22px' },
          },
        },
      ],
    },

    // ── FINAL CTA ────────────────────────────────────────────────────────────
    {
      type: 'cta',
      id: 'final-cta',
      order: 5,
      title: 'Ready to borrow better?',
      description: 'Same-day funding. Decisions in minutes. Up to $250,000 with no collateral required.',
      primaryButtonText: 'Check Eligibility',
      primaryButtonUrl: APPLY_URL,
      secondaryButtonText: 'Talk to a Specialist',
      secondaryButtonUrl: '/contact-us',
      backgroundStyle: 'solid',
      style: {
        backgroundColor: NAVY_DEEP,
        paddingTop: '88px',
        paddingBottom: '88px',
        paddingLeft: '24px',
        paddingRight: '24px',
        color: WHITE,
        customCSS: `background-image: linear-gradient(135deg, ${NAVY_DEEP} 0%, ${NAVY} 100%);`,
      },
      elementStyles: {
        title: { color: WHITE, fontFamily: HEADING_FONT, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.018em', textAlign: 'center', margin: '0 0 18px 0' },
        description: { color: 'rgba(255,255,255,0.82)', fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.6', textAlign: 'center', maxWidth: '640px', margin: '0 auto 32px auto' },
        primaryButton: { backgroundColor: ORANGE, color: WHITE, fontFamily: HEADING_FONT, fontWeight: '700', fontSize: '0.875rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 36px', borderRadius: '6px', customCSS: 'box-shadow: 0 10px 24px rgba(239,102,50,0.4)' },
        secondaryButton: { backgroundColor: 'transparent', color: WHITE, fontFamily: HEADING_FONT, fontWeight: '600', fontSize: '0.875rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 30px', borderRadius: '6px', customCSS: 'border: 1.5px solid rgba(255,255,255,0.55); background: rgba(255,255,255,0.06); backdrop-filter: blur(4px)' },
      },
    },
  ];
}

main().catch(e => { console.error(e); process.exit(1); });
