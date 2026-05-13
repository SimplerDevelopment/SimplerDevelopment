// About page — hero with overlay headings, 2-column intro/services, footer.

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const CREAM_BG = '#FDF9F0';
const DARK_TEXT = '#2A2A2A';
const CORAL = '#FF6161';

interface AssetMapEntry { mediaId: number; localUrl: string; }
function localUrl(map: Record<string, AssetMapEntry>, url: string): string {
  const clean = url.replace(/\/v1\/[^?]+/, '').split('?')[0];
  return map[clean]?.localUrl || url;
}

function buildBlocks(assetMap: Record<string, AssetMapEntry>) {
  const heroImg = localUrl(assetMap, 'https://static.wixstatic.com/media/1ddcb0_085651c86e014155a6fd6b2b368693fe~mv2.png');

  return [
    // ── HERO with overlay ─────────────────────────────────────────────
    {
      type: 'section',
      id: 'about-hero',
      order: 1,
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
      maxWidth: '100%',
      backgroundImage: heroImg,
      backgroundSize: 'cover' as const,
      backgroundPosition: 'center',
      style: {
        backgroundColor: '#2A2A2A',
        backgroundImage: heroImg,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '560px',
        position: 'relative' as const,
        padding: '0px',
      },
      blocks: [
        {
          type: 'html-render',
          id: 'about-hero-overlay',
          order: 1,
          width: 'full' as const,
          html: `<div style="position:relative;width:100%;height:560px;">
  <div style="position:absolute;left:6%;top:14%;color:${CORAL};font-family:'DM Sans',system-ui,sans-serif;font-weight:700;font-size:clamp(48px,8vw,116px);letter-spacing:0.01em;line-height:0.95;">BRAND<br/>THINKER</div>
  <div style="position:absolute;right:6%;bottom:12%;color:#FFFFFF;font-family:'DM Sans',system-ui,sans-serif;font-weight:700;font-size:clamp(48px,7.5vw,108px);letter-spacing:0.005em;line-height:0.95;text-align:right;">DESIGN<br/>STRATEGIST</div>
</div>`,
          fields: [],
          values: {},
        },
      ],
    },

    // ── INTRO 2-col ───────────────────────────────────────────────────
    {
      type: 'section',
      id: 'about-intro',
      order: 2,
      paddingTop: '96px',
      paddingBottom: '96px',
      paddingLeft: '32px',
      paddingRight: '32px',
      maxWidth: '1080px',
      style: { backgroundColor: CREAM_BG },
      blocks: [
        {
          type: 'columns',
          id: 'about-intro-cols',
          order: 1,
          gap: 'lg' as const,
          stackOnMobile: true,
          columns: [
            {
              id: 'about-intro-left',
              width: 60,
              verticalAlign: 'top' as const,
              blocks: [
                {
                  type: 'heading',
                  id: 'about-greeting',
                  order: 1,
                  level: 3,
                  content: "Hi! I'm Robin Goffman. Nice to meet you.",
                  style: { fontSize: '20px', fontWeight: '500', fontFamily: '"DM Sans", system-ui, sans-serif', color: DARK_TEXT, marginBottom: '24px', lineHeight: '1.5' },
                },
                {
                  type: 'text',
                  id: 'about-bio',
                  order: 2,
                  content: 'I work at the intersection of design and strategy, collaborating with organizations of all sizes to launch brands, design cross-platform products, and enable business strategy development. My approach is to bring purposeful data, beautiful design, and business strategies together to change behavior, evoke emotion, and inspire reaction—manifesting the magical moment of engagement that teams and brands are all in pursuit of.',
                  style: { fontSize: '15px', lineHeight: '1.8', fontFamily: '"DM Sans", system-ui, sans-serif', color: DARK_TEXT, maxWidth: '520px' },
                },
              ],
            },
            {
              id: 'about-intro-right',
              width: 40,
              verticalAlign: 'top' as const,
              blocks: [
                {
                  type: 'html-render',
                  id: 'about-services-list',
                  order: 1,
                  width: 'full' as const,
                  html: `<style>
                    .rg-svc-list { font-family: "DM Sans", system-ui, sans-serif; font-size: 15px; color: ${DARK_TEXT}; }
                    .rg-svc-list > div { padding: 16px 0; border-bottom: 1px solid #D8D2C0; }
                    .rg-svc-list > div:last-child { border-bottom: 0; }
                  </style>
                  <div class="rg-svc-list">
                    <div>Creative Strategy</div>
                    <div>Brand Development</div>
                    <div>Graphic Design</div>
                    <div>Website Design</div>
                    <div>Product Design</div>
                  </div>`,
                  fields: [],
                  values: {},
                },
              ],
            },
          ],
        },
      ],
    },

    // ── FOOTER ────────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'about-footer',
      order: 3,
      paddingTop: '32px',
      paddingBottom: '32px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '100%',
      style: { backgroundColor: CREAM_BG, borderTopWidth: '1px', borderTopStyle: 'solid' as const, borderTopColor: '#F0E9D8' },
      blocks: [
        {
          type: 'text',
          id: 'about-footer-text',
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
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf-8'));
  const assetMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'asset-map.json'), 'utf-8'));
  const content = JSON.stringify({ blocks: buildBlocks(assetMap), version: '1.0' });

  const seoTitle = 'About | Robin Goffman';
  const seoDescription = 'Robin Goffman — Brand Thinker and Design Strategist working at the intersection of design and strategy.';

  const [existing] = await db.select().from(posts).where(and(eq(posts.slug, 'about'), eq(posts.websiteId, ids.websiteId))).limit(1);
  if (existing) {
    await db.update(posts).set({ content, title: 'About', published: true, publishedAt: new Date(), seoTitle, seoDescription }).where(eq(posts.id, existing.id));
    console.log(`About page updated: ID ${existing.id}`);
  } else {
    const [page] = await db.insert(posts).values({
      title: 'About', slug: 'about', postType: 'page', content, published: true, publishedAt: new Date(), websiteId: ids.websiteId,
      seoTitle, seoDescription,
    }).returning();
    console.log(`About page created: ID ${page.id}`);
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
