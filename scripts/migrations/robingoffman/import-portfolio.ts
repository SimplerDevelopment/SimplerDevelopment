// Import 11 portfolio items as a custom post type ("portfolio").
// Each item gets its own page at /portfolio/<slug>.
//
// Structure of each portfolio detail post:
//   1. Title + meta row (2-col: title/tags on left, description + credits on right)
//   2. Image gallery (stacked images, each in its own row)
//   3. Footer

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const CREAM_BG = '#FDF9F0';
const DARK_TEXT = '#2A2A2A';
const MUTED_TEXT = '#7B7672';

interface PortfolioItem {
  slug: string;
  title: string;
  sourcePath: string;
  description: string;
  credits: string[];
  tags: string[];
  coverImage: string;
  images: { src: string; alt?: string }[];
}

interface AssetMapEntry { mediaId: number; localUrl: string; width: number | null; height: number | null; }

function localUrl(map: Record<string, AssetMapEntry>, url: string): string {
  const clean = url.replace(/\/v1\/[^?]+/, '').split('?')[0];
  return map[clean]?.localUrl || url;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const LOGO_URL = 'https://static.wixstatic.com/media/1ddcb0_dbacbfef7a794da0a7e793358441e9ab~mv2.webp';

function buildBlocks(item: PortfolioItem, assetMap: Record<string, AssetMapEntry>, navIndex: { prev?: PortfolioItem; next?: PortfolioItem }) {
  // Filter out logo/header images from the body gallery
  const galleryImages = item.images.filter(img => img.src !== LOGO_URL);

  const tagsHtml = item.tags.length
    ? item.tags.map(t => `<div>${escapeHtml(t)}</div>`).join('')
    : '';

  const creditsHtml = item.credits.length
    ? `<div style="margin-top: 24px; font-family: 'DM Sans', system-ui, sans-serif; font-size: 13px; line-height: 1.7; color: ${MUTED_TEXT}; white-space: pre-line;">${escapeHtml(item.credits.join('\n'))}</div>`
    : '';

  const descriptionHtml = item.description
    ? `<div style="font-family: 'DM Sans', system-ui, sans-serif; font-size: 14px; line-height: 1.7; color: ${DARK_TEXT}; max-width: 520px; white-space: pre-line;">${escapeHtml(item.description)}</div>`
    : '';

  const prevNextHtml = `<div style="display: flex; justify-content: space-between; padding: 64px 0 40px; font-family: 'DM Sans', system-ui, sans-serif; font-size: 13px; color: ${DARK_TEXT};">
    ${navIndex.prev ? `<a href="/portfolio/${navIndex.prev.slug}" style="color: ${DARK_TEXT}; text-decoration: none;">‹ Previous Project</a>` : '<span></span>'}
    ${navIndex.next ? `<a href="/portfolio/${navIndex.next.slug}" style="color: ${DARK_TEXT}; text-decoration: none;">Next Project ›</a>` : '<span></span>'}
  </div>`;

  return [
    // ── TITLE / META ────────────────────────────────────────────────
    {
      type: 'section',
      id: `${item.slug}-meta`,
      order: 1,
      paddingTop: '72px',
      paddingBottom: '48px',
      paddingLeft: '32px',
      paddingRight: '32px',
      maxWidth: '1200px',
      style: { backgroundColor: CREAM_BG },
      blocks: [
        {
          type: 'columns',
          id: `${item.slug}-meta-cols`,
          order: 1,
          gap: 'lg' as const,
          stackOnMobile: true,
          columns: [
            {
              id: `${item.slug}-meta-left`,
              width: 50,
              verticalAlign: 'top' as const,
              blocks: [
                {
                  type: 'heading',
                  id: `${item.slug}-title`,
                  order: 1,
                  level: 1,
                  content: item.title,
                  style: { fontSize: '32px', fontWeight: '400', fontFamily: '"DM Sans", system-ui, sans-serif', color: DARK_TEXT, lineHeight: '1.2', letterSpacing: '-0.01em', marginBottom: '20px' },
                },
                ...(tagsHtml ? [{
                  type: 'html-render' as const,
                  id: `${item.slug}-tags`,
                  order: 2,
                  width: 'full' as const,
                  html: `<div style="display: flex; gap: 16px; flex-wrap: wrap; font-family: 'DM Sans', system-ui, sans-serif; font-size: 11px; color: ${MUTED_TEXT}; text-transform: uppercase; letter-spacing: 0.15em;">${tagsHtml}</div>`,
                  fields: [],
                  values: {},
                }] : []),
              ],
            },
            {
              id: `${item.slug}-meta-right`,
              width: 50,
              verticalAlign: 'top' as const,
              blocks: [
                ...(descriptionHtml || creditsHtml ? [{
                  type: 'html-render' as const,
                  id: `${item.slug}-desc`,
                  order: 1,
                  width: 'full' as const,
                  html: `<div>${descriptionHtml}${creditsHtml}</div>`,
                  fields: [],
                  values: {},
                }] : []),
              ],
            },
          ],
        },
      ],
    },

    // ── GALLERY ──────────────────────────────────────────────────────
    ...(galleryImages.length > 0 ? [{
      type: 'section' as const,
      id: `${item.slug}-gallery`,
      order: 2,
      paddingTop: '32px',
      paddingBottom: '32px',
      paddingLeft: '32px',
      paddingRight: '32px',
      maxWidth: '1200px',
      style: { backgroundColor: CREAM_BG },
      blocks: [
        {
          type: 'gallery' as const,
          id: `${item.slug}-images`,
          order: 1,
          layout: 'masonry' as const,
          columns: 2 as const,
          gap: 'lg' as const,
          lightbox: true,
          images: galleryImages.map((img, i) => ({
            id: `${item.slug}-img-${i}`,
            url: localUrl(assetMap, img.src),
            alt: img.alt || `${item.title} — image ${i + 1}`,
          })),
        },
      ],
    }] : []),

    // ── PREV/NEXT NAV ────────────────────────────────────────────────
    {
      type: 'section',
      id: `${item.slug}-nav`,
      order: 3,
      paddingTop: '0px',
      paddingBottom: '32px',
      paddingLeft: '32px',
      paddingRight: '32px',
      maxWidth: '1200px',
      style: { backgroundColor: CREAM_BG },
      blocks: [
        {
          type: 'html-render',
          id: `${item.slug}-prevnext`,
          order: 1,
          width: 'full' as const,
          html: prevNextHtml,
          fields: [],
          values: {},
        },
      ],
    },

    // ── FOOTER ───────────────────────────────────────────────────────
    {
      type: 'section',
      id: `${item.slug}-footer`,
      order: 4,
      paddingTop: '32px',
      paddingBottom: '32px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '100%',
      style: { backgroundColor: CREAM_BG, borderTopWidth: '1px', borderTopStyle: 'solid' as const, borderTopColor: '#F0E9D8' },
      blocks: [
        {
          type: 'text',
          id: `${item.slug}-footer-text`,
          order: 1,
          content: 'CRAFTED WITH CARE © 2024  ROBIN GOFFMAN',
          alignment: 'center' as const,
          style: { fontSize: '11px', letterSpacing: '0.35em', textAlign: 'center' as const, color: DARK_TEXT, fontFamily: '"DM Sans", system-ui, sans-serif' },
        },
      ],
    },
  ];
}

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts, postTypes } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf-8'));
  const assetMap: Record<string, AssetMapEntry> = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'asset-map.json'), 'utf-8'));
  const items: PortfolioItem[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'portfolio.json'), 'utf-8'));

  // ── Ensure portfolio post type exists ────────────────────────────
  const [existingType] = await db.select().from(postTypes).where(and(eq(postTypes.slug, 'portfolio'), eq(postTypes.websiteId, ids.websiteId))).limit(1);
  if (!existingType) {
    await db.insert(postTypes).values({
      name: 'Portfolio',
      slug: 'portfolio',
      description: 'Portfolio project case studies',
      icon: 'collections',
      websiteId: ids.websiteId,
    });
    console.log('Portfolio post type created');
  } else {
    console.log(`Portfolio post type exists (ID ${existingType.id})`);
  }

  // ── Import each portfolio item ────────────────────────────────────
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prev = i > 0 ? items[i - 1] : undefined;
    const next = i < items.length - 1 ? items[i + 1] : undefined;
    const content = JSON.stringify({ blocks: buildBlocks(item, assetMap, { prev, next }), version: '1.0' });
    const coverLocal = localUrl(assetMap, item.coverImage);

    const seoTitle = `${item.title} | Robin Goffman`;
    const seoDescription = item.description.slice(0, 160) || item.title;

    const fullSlug = `portfolio/${item.slug}`;
    const [existing] = await db.select().from(posts).where(and(eq(posts.slug, fullSlug), eq(posts.websiteId, ids.websiteId))).limit(1);
    if (existing) {
      await db.update(posts).set({
        content,
        title: item.title,
        postType: 'portfolio',
        coverImage: coverLocal,
        published: true,
        publishedAt: new Date(),
        seoTitle,
        seoDescription,
      }).where(eq(posts.id, existing.id));
      console.log(`Updated: ${fullSlug} (ID ${existing.id})`);
    } else {
      const [page] = await db.insert(posts).values({
        title: item.title,
        slug: fullSlug,
        postType: 'portfolio',
        content,
        coverImage: coverLocal,
        published: true,
        publishedAt: new Date(),
        websiteId: ids.websiteId,
        seoTitle,
        seoDescription,
      }).returning();
      console.log(`Created: ${fullSlug} (ID ${page.id})`);
    }
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
