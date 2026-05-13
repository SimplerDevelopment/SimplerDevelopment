// Build & insert the home page for robingoffman.com migration.
// Page layout matches the original Wix site:
//   - Top nav comes from layout.tsx (site branding + siteNavigation rows)
//   - Hero photo of Robin with hand-drawn "stud" overlay (full-bleed image block)
//   - Portfolio grid: 2-column gallery, each card = image + title underneath,
//     clickable through to /portfolio/<slug>
//   - Footer microcopy at the bottom (text block — the site layout has no
//     auto-footer, so each page renders its own).

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const CREAM_BG = '#FDF9F0';
const DARK_TEXT = '#2A2A2A';

interface AssetMapEntry { mediaId: number; localUrl: string; width: number | null; height: number | null; mimeType: string; }

function loadAssetMap(): Record<string, AssetMapEntry> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'asset-map.json'), 'utf-8'));
}

// Resolve a Wix CDN URL to its uploaded local /api/media/proxy/... URL.
// Falls back to the original URL if not found (shouldn't happen post-import).
function localUrl(assetMap: Record<string, AssetMapEntry>, wixUrl: string): string {
  // Strip any /v1/fill/... transform suffix that may be on the URL string
  const cleanUrl = wixUrl.replace(/\/v1\/[^?]+/, '').split('?')[0];
  return assetMap[cleanUrl]?.localUrl || wixUrl;
}

const PORTFOLIO_GRID = [
  { slug: 'designing-brand-identity-6th-edition', title: 'Designing Brand Identity 6th Edition', wixCover: 'https://static.wixstatic.com/media/1ddcb0_a909d3b898244b2b8718f08d4a0b3a75~mv2.png' },
  { slug: 'three-sticks-golf',                   title: 'Three Sticks Golf',                    wixCover: 'https://static.wixstatic.com/media/1ddcb0_28d80a8d329e4230a159d64d4a21dbc3~mv2.png' },
  { slug: 'aizer-health',                        title: 'Aizer Health',                         wixCover: 'https://static.wixstatic.com/media/1ddcb0_3ec12c8c8dac465a949944da4033764a~mv2.png' },
  { slug: 'designing-brand-identity-5th-edition', title: 'Designing Brand Identity 5th Edition', wixCover: 'https://static.wixstatic.com/media/1ddcb0_c595024389ff4312a065d237d67349c7~mv2.jpg' },
  { slug: 'eisenhower-fellowships',              title: 'Eisenhower Fellowships Impact Report', wixCover: 'https://static.wixstatic.com/media/1ddcb0_544355b48d464e8f85162fcfa1335c5a~mv2.png' },
  { slug: 'metamorphosis',                       title: 'Metamorphosis',                        wixCover: 'https://static.wixstatic.com/media/1ddcb0_ec4155a99053493c8ba73fb235e8b96a~mv2.png' },
  { slug: 'mortgagecs',                          title: 'MortgageCS',                           wixCover: 'https://static.wixstatic.com/media/1ddcb0_67cd9e9965ad4731a053597f95aef40d~mv2.png' },
  { slug: 'bari-bettys-gluten-free-baking',      title: "Bari & Betty's Gluten Free Baking",    wixCover: 'https://static.wixstatic.com/media/1ddcb0_face33f99dcd4d3ea1dedf246561a0b2~mv2.png' },
  { slug: 'cocktails-against-cancer',            title: 'Cocktails Against Cancer',             wixCover: 'https://static.wixstatic.com/media/1ddcb0_e9c4a592ee2a4cd1901fa250a8189ba7~mv2.jpg' },
  { slug: 'sip-n-glo-juicery',                   title: 'Sip-N-Glo Juicery',                    wixCover: 'https://static.wixstatic.com/media/1ddcb0_38b9caea9d6a4347b36fa9f44db3c3d6~mv2.jpg' },
  { slug: 'temple-senior-showcase',              title: 'Temple University, Senior Showcase',   wixCover: 'https://static.wixstatic.com/media/1ddcb0_3b2eb86c13534f0a9598b8cf21ffff38~mv2.png' },
];

function buildBlocks(assetMap: Record<string, AssetMapEntry>) {
  const heroImageUrl = localUrl(assetMap, 'https://static.wixstatic.com/media/1ddcb0_400c280b7d40434288c3a6ceab20e756f000.jpg');

  // Portfolio grid as a single html-render block: each project card is a
  // clickable link with a 1:1 cover image + title underneath. Two-column on
  // desktop, single column on mobile. Matches the source-site layout.
  const portfolioCards = PORTFOLIO_GRID.map(item => {
    const img = localUrl(assetMap, item.wixCover);
    return `<a href="/portfolio/${item.slug}" class="rg-card" aria-label="${item.title}">
      <div class="rg-card-img"><img src="${img}" alt="${item.title}" loading="lazy"/></div>
      <div class="rg-card-title">${item.title}</div>
    </a>`;
  }).join('\n');

  const portfolioHtml = `<style>
    .rg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px 56px; padding: 64px 0; }
    .rg-card { display: block; text-decoration: none; color: ${DARK_TEXT}; }
    .rg-card-img { aspect-ratio: 1 / 1; overflow: hidden; background: #f0ece2; }
    .rg-card-img img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; display: block; }
    .rg-card:hover .rg-card-img img { transform: scale(1.02); }
    .rg-card-title { margin-top: 18px; font-family: "DM Sans", system-ui, sans-serif; font-size: 22px; font-weight: 400; color: ${DARK_TEXT}; letter-spacing: -0.01em; }
    @media (max-width: 720px) {
      .rg-grid { grid-template-columns: 1fr; gap: 48px; padding: 32px 0; }
      .rg-card-title { font-size: 18px; }
    }
  </style>
  <div class="rg-grid">${portfolioCards}</div>`;

  return [
    // ── HERO — full-bleed photo of Robin ─────────────────────────────────
    {
      type: 'section',
      id: 'home-hero-section',
      order: 1,
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
      maxWidth: '100%',
      style: { backgroundColor: CREAM_BG, padding: '0px' },
      blocks: [
        {
          type: 'image',
          id: 'home-hero-img',
          order: 1,
          url: heroImageUrl,
          alt: 'Robin Goffman in a striped shirt with a handwritten "stud" overlay — studio rg',
          width: 'full' as const,
          alignment: 'center' as const,
          style: { margin: '0px', padding: '0px' },
        },
      ],
    },

    // ── PORTFOLIO GRID ───────────────────────────────────────────────────
    {
      type: 'section',
      id: 'home-portfolio',
      order: 2,
      paddingTop: '56px',
      paddingBottom: '96px',
      paddingLeft: '32px',
      paddingRight: '32px',
      maxWidth: '1200px',
      style: { backgroundColor: CREAM_BG },
      blocks: [
        {
          type: 'html-render',
          id: 'home-portfolio-grid',
          order: 1,
          width: 'full' as const,
          html: portfolioHtml,
          fields: [],
          values: {},
        },
      ],
    },

    // ── FOOTER ───────────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'home-footer',
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
          id: 'home-footer-text',
          order: 1,
          content: 'CRAFTED WITH CARE © 2024  ROBIN GOFFMAN',
          alignment: 'center' as const,
          style: { fontSize: '11px', letterSpacing: '0.35em', textAlign: 'center' as const, color: DARK_TEXT, fontFamily: '"DM Sans", system-ui, sans-serif' },
        },
      ],
    },
  ];
}

async function importHome() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf-8'));
  const websiteId = ids.websiteId;
  if (!websiteId) { console.error('No websiteId'); process.exit(1); }

  const assetMap = loadAssetMap();
  const blocks = buildBlocks(assetMap);
  const content = JSON.stringify({ blocks, version: '1.0' });

  const seoTitle = 'Work | Robin Goffman';
  const seoDescription = 'Brand identity, design, and strategy work by Robin Goffman — studio rg.';

  const [existing] = await db.select().from(posts).where(and(eq(posts.slug, 'home'), eq(posts.websiteId, websiteId))).limit(1);
  if (existing) {
    await db.update(posts).set({ content, title: 'Home', published: false, seoTitle, seoDescription }).where(eq(posts.id, existing.id));
    console.log(`Home page updated: ID ${existing.id}`);
  } else {
    const [page] = await db.insert(posts).values({
      title: 'Home', slug: 'home', postType: 'page', content, published: false, websiteId,
      seoTitle, seoDescription,
    }).returning();
    console.log(`Home page created: ID ${page.id}`);
  }
  process.exit(0);
}

importHome().catch(err => { console.error(err); process.exit(1); });
