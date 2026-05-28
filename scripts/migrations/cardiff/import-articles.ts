/**
 * Cardiff migration — Article importer (blog / news / report)
 *
 * Reads scripts/migrations/cardiff/extracted/articles/*.json and creates
 * one draft post per article. The post-type comes from the slug prefix:
 *   blog-*    → postType=blog
 *   news-*    → postType=news
 *   reports-* → postType=report
 *
 * Idempotent — re-running updates existing posts in place.
 *
 * Run:  npx tsx scripts/migrations/cardiff/import-articles.ts
 *       npx tsx scripts/migrations/cardiff/import-articles.ts --kind=blog
 */

import * as dotenv from 'dotenv';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const NAVY = '#25418b';
const ORANGE = '#ef6632';
const TEXT_DARK = '#0a0a0a';
const TEXT_MUTED = '#525f7f';
const LIGHT_BLUE_BG = '#f6f9fc';
const WHITE = '#ffffff';
const HEADING_FONT = "Raleway, -apple-system, BlinkMacSystemFont, sans-serif";
const BODY_FONT = "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const APPLY_URL = 'https://cardiff.co/business/apply';

interface Article {
  url: string;
  slug: string;
  title: string;
  h1: string;
  metaDescription: string;
  ogImage: string;
  publishedDate: string;
  category: string;
  excerpt: string;
  coverImage: string;
  blocks: Array<{ type: 'h2' | 'h3' | 'h4' | 'p' | 'ul'; text: string; items?: string[] }>;
}

function kindFromSlug(slug: string): { kind: 'blog' | 'news' | 'report'; cleanSlug: string } {
  if (slug.startsWith('news-')) return { kind: 'news', cleanSlug: slug.slice(5) };
  if (slug.startsWith('reports-')) return { kind: 'report', cleanSlug: slug.slice(8) };
  if (slug.startsWith('blog-')) return { kind: 'blog', cleanSlug: slug.slice(5) };
  return { kind: 'blog', cleanSlug: slug };
}

function buildBlocks(article: Article, kind: 'blog' | 'news' | 'report'): any[] {
  const blocks: any[] = [];
  let order = 0;

  const kindLabel = kind === 'news' ? 'Cardiff in the News' : kind === 'report' ? 'Cardiff Reports' : 'Insights';

  // ── HERO (compact for articles) ─────────────────────────────────────────
  blocks.push({
    type: 'section',
    id: 'article-hero',
    order: ++order,
    style: {
      backgroundColor: NAVY,
      paddingTop: '88px',
      paddingBottom: '72px',
      paddingLeft: '24px',
      paddingRight: '24px',
      color: WHITE,
      customCSS: `background-image: linear-gradient(135deg, #1c3370 0%, ${NAVY} 60%, #385cc0 100%);`,
    },
    maxWidth: '880px',
    blocks: [
      {
        type: 'heading',
        id: 'hero-overline',
        order: 1,
        level: 6,
        content: kindLabel.toUpperCase(),
        alignment: 'center',
        style: { color: '#ffd9c6', fontFamily: HEADING_FONT, fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 16px 0', textAlign: 'center' },
      },
      {
        type: 'heading',
        id: 'hero-title',
        order: 2,
        level: 1,
        content: article.h1,
        alignment: 'center',
        style: { color: WHITE, fontFamily: HEADING_FONT, fontSize: '3rem', fontWeight: '800', letterSpacing: '-0.02em', lineHeight: '1.1', margin: '0 0 20px 0', textAlign: 'center', customCSS: 'text-shadow: 0 2px 14px rgba(0,0,0,0.28)' },
      },
      ...(article.publishedDate ? [{
        type: 'text',
        id: 'hero-date',
        order: 3,
        content: article.publishedDate + (article.category ? ` &nbsp;·&nbsp; ${article.category}` : ''),
        style: { color: 'rgba(255,255,255,0.72)', fontFamily: BODY_FONT, fontSize: '0.9375rem', textAlign: 'center', margin: '0' },
      }] : []),
    ],
  });

  // ── COVER IMAGE (if present) ────────────────────────────────────────────
  if (article.coverImage) {
    blocks.push({
      type: 'section',
      id: 'cover',
      order: ++order,
      style: { backgroundColor: WHITE, paddingTop: '0', paddingBottom: '0', paddingLeft: '24px', paddingRight: '24px' },
      maxWidth: '960px',
      blocks: [
        {
          type: 'image',
          id: 'cover-img',
          order: 1,
          url: article.coverImage,
          alt: article.h1,
          width: 'full',
          alignment: 'center',
          style: { borderRadius: '12px', marginTop: '-48px', customCSS: 'box-shadow: 0 20px 50px rgba(37,65,139,0.18); overflow: hidden' },
        },
      ],
    });
  }

  // ── BODY ─────────────────────────────────────────────────────────────────
  const bodyChildren: any[] = [];
  let cOrder = 0;
  for (const b of article.blocks) {
    if (b.type === 'h2') {
      bodyChildren.push({
        type: 'heading',
        id: `body-h2-${cOrder}`,
        order: ++cOrder,
        level: 2,
        content: b.text,
        alignment: 'left',
        style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.015em', lineHeight: '1.2', margin: '40px 0 16px 0' },
      });
    } else if (b.type === 'h3') {
      bodyChildren.push({
        type: 'heading',
        id: `body-h3-${cOrder}`,
        order: ++cOrder,
        level: 3,
        content: b.text,
        alignment: 'left',
        style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '1.5rem', fontWeight: '700', margin: '28px 0 12px 0' },
      });
    } else if (b.type === 'h4') {
      bodyChildren.push({
        type: 'heading',
        id: `body-h4-${cOrder}`,
        order: ++cOrder,
        level: 4,
        content: b.text,
        alignment: 'left',
        style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '1.25rem', fontWeight: '700', margin: '24px 0 10px 0' },
      });
    } else if (b.type === 'p') {
      bodyChildren.push({
        type: 'text',
        id: `body-p-${cOrder}`,
        order: ++cOrder,
        content: b.text,
        style: { color: TEXT_DARK, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.75', margin: '0 0 18px 0' },
      });
    } else if (b.type === 'ul') {
      const items = (b.items || []).slice(0, 12);
      if (items.length === 0) continue;
      const html = `<ul style="list-style:disc;padding-left:24px;margin:0 0 22px 0;color:${TEXT_DARK};font-family:${BODY_FONT.replace(/'/g, '&apos;')};font-size:1.0625rem;line-height:1.7">` +
        items.map(it => `<li style="margin:0 0 8px 0">${it.replace(/</g, '&lt;')}</li>`).join('') +
        `</ul>`;
      bodyChildren.push({
        type: 'text',
        id: `body-ul-${cOrder}`,
        order: ++cOrder,
        content: html,
      });
    }
  }

  if (bodyChildren.length > 0) {
    blocks.push({
      type: 'section',
      id: 'body',
      order: ++order,
      style: { backgroundColor: WHITE, paddingTop: '64px', paddingBottom: '64px', paddingLeft: '24px', paddingRight: '24px' },
      maxWidth: '720px',
      blocks: bodyChildren,
    });
  }

  // ── INLINE CTA ──────────────────────────────────────────────────────────
  blocks.push({
    type: 'section',
    id: 'inline-cta',
    order: ++order,
    style: { backgroundColor: LIGHT_BLUE_BG, paddingTop: '64px', paddingBottom: '64px', paddingLeft: '24px', paddingRight: '24px' },
    maxWidth: '720px',
    blocks: [
      {
        type: 'heading',
        id: 'cta-title',
        order: 1,
        level: 3,
        content: kind === 'report' ? 'Want the playbook behind these numbers?' : 'Need capital to act on what you read?',
        alignment: 'center',
        style: { color: NAVY, fontFamily: HEADING_FONT, fontSize: '1.625rem', fontWeight: '800', letterSpacing: '-0.012em', margin: '0 0 18px 0', textAlign: 'center' },
      },
      {
        type: 'text',
        id: 'cta-body',
        order: 2,
        content: 'See if your business qualifies in under 2 minutes. Same-day funding, up to $250,000, no collateral.',
        style: { color: TEXT_MUTED, fontFamily: BODY_FONT, fontSize: '1.0625rem', lineHeight: '1.6', textAlign: 'center', margin: '0 0 24px 0' },
      },
      {
        type: 'button',
        id: 'cta-btn',
        order: 3,
        text: 'Check Eligibility',
        url: APPLY_URL,
        variant: 'primary',
        size: 'lg',
        alignment: 'center',
        icon: 'arrow_forward',
        iconPosition: 'right',
        hoverEffect: 'lift',
      },
    ],
  });

  return blocks;
}

async function main() {
  const kindFilter = process.argv.find(a => a.startsWith('--kind='))?.slice(7) as 'blog' | 'news' | 'report' | undefined;
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const state = JSON.parse(readFileSync(join(process.cwd(), 'scripts/migrations/cardiff/.state/ids.json'), 'utf-8'));
  const dir = join(process.cwd(), 'scripts/migrations/cardiff/extracted/articles');
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();

  let created = 0, updated = 0, skipped = 0;
  for (const fname of files) {
    const article: Article = JSON.parse(readFileSync(join(dir, fname), 'utf-8'));
    const { kind, cleanSlug } = kindFromSlug(article.slug);
    if (kindFilter && kind !== kindFilter) continue;
    if (article.blocks.length < 2) {
      console.warn(`⏩ skip ${article.slug} (too thin: ${article.blocks.length} blocks)`);
      skipped++;
      continue;
    }
    const blocks = buildBlocks(article, kind);
    const content = JSON.stringify({ blocks, version: '1.0' });

    const existing = await db.select().from(posts)
      .where(and(eq(posts.slug, cleanSlug), eq(posts.websiteId, state.websiteId), eq(posts.postType, kind))).limit(1);

    let publishedAt: Date | null = null;
    if (article.publishedDate) {
      const d = new Date(article.publishedDate);
      if (!isNaN(d.getTime())) publishedAt = d;
    }

    if (existing.length) {
      await db.update(posts).set({
        content,
        title: article.h1,
        excerpt: article.excerpt,
        coverImage: article.coverImage || null,
        seoTitle: article.title,
        seoDescription: article.metaDescription,
        ogImage: article.ogImage || article.coverImage || null,
        ...(publishedAt ? { publishedAt } : {}),
        updatedAt: new Date(),
      }).where(eq(posts.id, existing[0].id));
      console.log(`✅ updated ${kind} ${cleanSlug} (id=${existing[0].id}, ${blocks.length} blocks)`);
      updated++;
    } else {
      const [p] = await db.insert(posts).values({
        title: article.h1,
        slug: cleanSlug,
        postType: kind,
        content,
        excerpt: article.excerpt,
        coverImage: article.coverImage || null,
        published: false,
        websiteId: state.websiteId,
        seoTitle: article.title,
        seoDescription: article.metaDescription,
        ogImage: article.ogImage || article.coverImage || null,
        ...(publishedAt ? { publishedAt } : {}),
      }).returning();
      console.log(`✅ created ${kind} ${cleanSlug} (id=${p.id}, ${blocks.length} blocks)`);
      created++;
    }
  }
  console.log(`\n📊 created=${created} updated=${updated} skipped=${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
