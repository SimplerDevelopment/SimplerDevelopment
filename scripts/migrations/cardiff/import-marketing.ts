/**
 * Cardiff migration — Marketing page importer
 *
 * Reads scripts/migrations/cardiff/extracted/pages/*.json and creates one
 * draft post per page using a consistent Cardiff-branded block template.
 *
 * Idempotent — re-running updates existing posts in place.
 *
 * Run:  npx tsx scripts/migrations/cardiff/import-marketing.ts
 *       npx tsx scripts/migrations/cardiff/import-marketing.ts --slug=about
 */

import * as dotenv from 'dotenv';
import { readFileSync, readdirSync } from 'fs';
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

interface ExtractedPage {
  url: string;
  slug: string;
  title: string;
  h1: string;
  metaDescription: string;
  ogImage: string;
  blocks: Array<{ type: 'h2' | 'h3' | 'h4' | 'p' | 'ul' | 'ol' | 'blockquote'; text: string; items?: string[] }>;
  images: string[];
  template: 'rich' | 'simple';
}

// Group extracted content blocks into sections (each section = 1 h2 + following children until next h2)
function groupSections(blocks: ExtractedPage['blocks']) {
  const sections: Array<{ heading?: string; children: typeof blocks }> = [];
  let current: { heading?: string; children: typeof blocks } | null = null;
  for (const b of blocks) {
    if (b.type === 'h2') {
      if (current) sections.push(current);
      current = { heading: b.text, children: [] };
    } else {
      if (!current) current = { heading: undefined, children: [] };
      current.children.push(b);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function buildBlocks(page: ExtractedPage): any[] {
  const blocks: any[] = [];
  let order = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;
  let idCounter = 0;

  const heroSubtitle = page.metaDescription ? page.metaDescription.slice(0, 160) : '';

  // ── COMPACT PAGE HERO ──────────────────────────────────────────────────
  blocks.push({
    type: 'section',
    id: `hero-${page.slug}`,
    order: ++order,
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
      ...(page.navLabel ? [{
        type: 'heading' as const, alignment: 'center' as const, id: 'h-over', order: 1, level: 6,
        content: page.navLabel.toUpperCase(),
        style: { color: '#ffb798', fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase' as const, margin: '0 0 16px 0', textAlign: 'center' as const },
      }] : []),
      {
        type: 'heading', alignment: 'center', id: 'h-title', order: 2, level: 1,
        content: page.h1 || page.title,
        style: { color: WHITE, fontFamily: HEADING_FONT, fontSize: '3rem', fontWeight: '800', letterSpacing: '-0.02em', lineHeight: '1.1', margin: '0 0 18px 0', textAlign: 'center', customCSS: 'text-shadow: 0 2px 16px rgba(0,0,0,0.32)' },
      },
      ...(heroSubtitle ? [{
        type: 'text' as const, id: 'h-sub', order: 3,
        content: heroSubtitle,
        style: { color: 'rgba(255,255,255,0.85)', fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.6', textAlign: 'center' as const, maxWidth: '680px', margin: '0 auto 32px auto' },
      }] : []),
      {
        type: 'columns', id: 'h-btns', order: 4, gap: 'sm', stackOnMobile: true,
        columns: [
          { id: 'hb-l', width: 'auto' as any, padding: 'none' as const, blocks: [
            { type: 'button', id: 'hb-apply', order: 1, text: 'Apply Now', url: APPLY_URL, variant: 'primary', size: 'md', alignment: 'right', icon: 'arrow_forward', iconPosition: 'right', hoverEffect: 'lift',
              style: { backgroundColor: ORANGE, color: WHITE, fontWeight: '700', fontSize: '0.875rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '14px 30px', borderRadius: '6px', fontFamily: HEADING_FONT, customCSS: 'box-shadow: 0 10px 24px rgba(239,102,50,0.4)' } },
          ] },
          { id: 'hb-r', width: 'auto' as any, padding: 'none' as const, blocks: [
            { type: 'button', id: 'hb-contact', order: 1, text: 'Talk to a Specialist', url: '/contact-us', variant: 'secondary', size: 'md', alignment: 'left', hoverEffect: 'fill',
              style: { backgroundColor: 'transparent', color: WHITE, fontWeight: '600', fontSize: '0.875rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '14px 26px', borderRadius: '6px', fontFamily: HEADING_FONT, customCSS: 'border: 1.5px solid rgba(255,255,255,0.5); background: rgba(255,255,255,0.05); backdrop-filter: blur(4px)' } },
          ] },
        ],
        style: { margin: '0 auto', maxWidth: '460px' },
      },
    ],
  });

  // ── BODY SECTIONS ───────────────────────────────────────────────────────
  const sections = groupSections(page.blocks);
  // Less monotone bg rhythm: every 3rd section gets the tinted bg
  const sectionBg = (idx: number): string => (idx % 3 === 1 ? LIGHT_BLUE_BG : WHITE);
  let sectionIdx = 0;
  for (const sec of sections) {
    if (sec.children.length === 0 && !sec.heading) continue;
    // Skip footer-style sections
    const text = (sec.heading || '') + ' ' + sec.children.map(c => c.text).join(' ');
    if (/california lender license|copyright|all rights reserved/i.test(text)) continue;
    sectionIdx++;
    const bg = sectionBg(sectionIdx);

    const children: any[] = [];
    let childOrder = 0;
    if (sec.heading) {
      children.push({
        type: 'heading',
        id: `sec-${sectionIdx}-title`,
        order: ++childOrder,
        level: 2,
        content: sec.heading,
        alignment: 'center',
        style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.015em', lineHeight: '1.2', margin: '0 0 18px 0', textAlign: 'center' },
      });
      // Orange divider
      children.push({
        type: 'text',
        id: `sec-${sectionIdx}-div`,
        order: ++childOrder,
        content: `<div style="width:48px;height:3px;background:${ORANGE};margin:0 auto;border-radius:2px"></div>`,
        style: { textAlign: 'center', margin: '0 auto 28px auto' },
      });
    }

    for (const c of sec.children) {
      if (c.type === 'h3') {
        children.push({
          type: 'heading',
          id: `sec-${sectionIdx}-h3-${childOrder}`,
          order: ++childOrder,
          level: 3,
          content: c.text,
          alignment: 'left',
          style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '1.5rem', fontWeight: '700', letterSpacing: '-0.005em', margin: '32px 0 14px 0' },
        });
      } else if (c.type === 'h4') {
        children.push({
          type: 'heading',
          id: `sec-${sectionIdx}-h4-${childOrder}`,
          order: ++childOrder,
          level: 4,
          content: c.text,
          alignment: 'left',
          style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '1.25rem', fontWeight: '700', margin: '24px 0 10px 0' },
        });
      } else if (c.type === 'p') {
        children.push({
          type: 'text',
          id: `sec-${sectionIdx}-p-${childOrder}`,
          order: ++childOrder,
          content: c.text,
          style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.75', margin: '0 0 18px 0' },
        });
      } else if (c.type === 'blockquote') {
        children.push({
          type: 'quote',
          id: `sec-${sectionIdx}-q-${childOrder}`,
          order: ++childOrder,
          content: c.text,
          style: { borderLeft: `4px solid ${ORANGE}`, paddingLeft: '24px', margin: '24px 0', color: NAVY, fontFamily: BODY_FONT, fontSize: '1.1875rem', fontStyle: 'italic', lineHeight: '1.6' },
        });
      } else if (c.type === 'ul' || c.type === 'ol') {
        // Render as a bullet list via card-grid for visual texture
        const items = (c.items || []).slice(0, 8);
        if (items.length === 0) continue;
        if (items.length >= 3 && items.length <= 6) {
          children.push({
            type: 'card-grid',
            id: `sec-${sectionIdx}-grid-${childOrder}`,
            order: ++childOrder,
            columns: items.length === 4 ? 2 : (items.length >= 5 ? 3 : items.length === 3 ? 3 : 2),
            cards: items.map((it, i) => ({
              id: `gc-${sectionIdx}-${i}`,
              title: it.split(/[:—–-]/)[0].trim().slice(0, 80),
              description: (it.split(/[:—–-]/).slice(1).join(' — ') || '').trim().slice(0, 240),
              icon: 'check_circle',
            })),
            elementStyles: {
              card: { backgroundColor: WHITE, borderRadius: '10px', padding: '20px', customCSS: 'box-shadow: 0 2px 10px rgba(37,65,139,0.06); border: 1px solid #e8edf6' },
              cardIcon: { color: ORANGE, fontSize: '22px', margin: '0 0 8px 0' },
              cardTitle: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '0.9375rem', fontWeight: '700', margin: '0 0 4px 0' },
              cardDescription: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '0.8125rem', lineHeight: '1.5', margin: '0' },
            },
          });
        } else {
          // Long lists: render as plain styled list
          const html = `<ul style="list-style:disc;padding-left:24px;margin:0 0 20px 0;color:${TEXT_MUTED};font-family:${BODY_FONT.replace(/'/g, "&apos;")};font-size:1rem;line-height:1.7">` +
            items.map(it => `<li style="margin:0 0 8px 0">${it.replace(/</g, '&lt;')}</li>`).join('') +
            `</ul>`;
          children.push({
            type: 'text',
            id: `sec-${sectionIdx}-ul-${childOrder}`,
            order: ++childOrder,
            content: html,
          });
        }
      }
    }

    blocks.push({
      type: 'section',
      id: `sec-${sectionIdx}`,
      order: ++order,
      style: { backgroundColor: bg, paddingTop: '80px', paddingBottom: '80px', paddingLeft: '24px', paddingRight: '24px' },
      maxWidth: '880px',
      blocks: children,
    });
  }

  // ── FINAL CTA ────────────────────────────────────────────────────────────
  blocks.push({
    type: 'cta',
    id: 'final-cta',
    order: ++order,
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
  });

  return blocks;
}

async function main() {
  const onlySlug = process.argv.find(a => a.startsWith('--slug='))?.slice(7);
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const state = JSON.parse(readFileSync(join(process.cwd(), 'scripts/migrations/cardiff/.state/ids.json'), 'utf-8'));
  const dir = join(process.cwd(), 'scripts/migrations/cardiff/extracted/pages');
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));

  let created = 0, updated = 0, skipped = 0;
  for (const fname of files) {
    const page: ExtractedPage = JSON.parse(readFileSync(join(dir, fname), 'utf-8'));
    if (onlySlug && page.slug !== onlySlug) continue;
    if (page.blocks.length < 2 && !page.h1) {
      console.warn(`⏩ skip ${page.slug} (too thin)`);
      skipped++;
      continue;
    }
    const blocks = buildBlocks(page);
    const content = JSON.stringify({ blocks, version: '1.0' });

    const existing = await db.select().from(posts)
      .where(and(eq(posts.slug, page.slug), eq(posts.websiteId, state.websiteId))).limit(1);

    if (existing.length) {
      await db.update(posts).set({
        content,
        title: page.h1 || page.title,
        seoTitle: page.title,
        seoDescription: page.metaDescription,
        ogImage: page.ogImage || null,
        updatedAt: new Date(),
      }).where(eq(posts.id, existing[0].id));
      console.log(`✅ updated ${page.slug} (id=${existing[0].id}, ${blocks.length} blocks)`);
      updated++;
    } else {
      const [p] = await db.insert(posts).values({
        title: page.h1 || page.title,
        slug: page.slug,
        postType: 'page',
        content,
        published: false,
        websiteId: state.websiteId,
        seoTitle: page.title,
        seoDescription: page.metaDescription,
        ogImage: page.ogImage || null,
      }).returning();
      console.log(`✅ created ${page.slug} (id=${p.id}, ${blocks.length} blocks)`);
      created++;
    }
  }
  console.log(`\n📊 created=${created} updated=${updated} skipped=${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
