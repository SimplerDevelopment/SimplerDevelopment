// Contact page — 2-col with heading/email/Instagram/photo on left, form on right.

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const CREAM_BG = '#FDF9F0';
const DARK_TEXT = '#2A2A2A';
const CORAL = '#FF6161';
const TEAL = '#84C4C3';
const MUTED_LINK = '#3E4A4A';

interface AssetMapEntry { mediaId: number; localUrl: string; }
function localUrl(map: Record<string, AssetMapEntry>, url: string): string {
  const clean = url.replace(/\/v1\/[^?]+/, '').split('?')[0];
  return map[clean]?.localUrl || url;
}

function buildBlocks(assetMap: Record<string, AssetMapEntry>) {
  const photoGif = localUrl(assetMap, 'https://static.wixstatic.com/media/1ddcb0_463953ccd4eb40e6b79de721325bf66e~mv2.gif');

  return [
    {
      type: 'section',
      id: 'contact-body',
      order: 1,
      paddingTop: '96px',
      paddingBottom: '96px',
      paddingLeft: '32px',
      paddingRight: '32px',
      maxWidth: '1080px',
      style: { backgroundColor: CREAM_BG },
      blocks: [
        {
          type: 'columns',
          id: 'contact-cols',
          order: 1,
          gap: 'lg' as const,
          stackOnMobile: true,
          columns: [
            // ── LEFT: heading + contact details + photo ────────────────
            {
              id: 'contact-left',
              width: 50,
              verticalAlign: 'top' as const,
              blocks: [
                {
                  type: 'heading',
                  id: 'contact-heading',
                  order: 1,
                  level: 2,
                  content: 'Manifesting magic that connects creative concepts to results-focused business strategy.',
                  style: { fontSize: '24px', fontWeight: '500', fontFamily: '"DM Sans", system-ui, sans-serif', color: TEAL, lineHeight: '1.4', marginBottom: '32px', maxWidth: '460px' },
                },
                {
                  type: 'text',
                  id: 'contact-tagline',
                  order: 2,
                  content: "I'd love to hear from you. Say hello!",
                  style: { fontSize: '12px', fontWeight: '500', fontFamily: '"DM Sans", system-ui, sans-serif', color: CORAL, marginBottom: '16px' },
                },
                {
                  type: 'html-render',
                  id: 'contact-links',
                  order: 3,
                  width: 'full' as const,
                  html: `<style>
                    .rg-contact-links a { display: block; color: ${MUTED_LINK}; font-family: "DM Sans", system-ui, sans-serif; font-size: 14px; text-decoration: underline; padding: 4px 0; }
                  </style>
                  <div class="rg-contact-links">
                    <a href="mailto:robin.goffman@gmail.com">robin.goffman@gmail.com</a>
                    <a href="https://www.instagram.com/robingoffman/" target="_blank" rel="noopener">@robingoffman</a>
                  </div>`,
                  fields: [],
                  values: {},
                  style: { marginBottom: '32px' },
                },
                {
                  type: 'image',
                  id: 'contact-photo',
                  order: 4,
                  url: photoGif,
                  alt: 'Robin Goffman at her desk',
                  width: 'medium' as const,
                  alignment: 'left' as const,
                  style: { maxWidth: '240px' },
                },
              ],
            },

            // ── RIGHT: form ────────────────────────────────────────────
            {
              id: 'contact-right',
              width: 50,
              verticalAlign: 'top' as const,
              blocks: [
                {
                  type: 'html-render',
                  id: 'contact-form',
                  order: 1,
                  width: 'full' as const,
                  html: `<style>
                    .rg-form { display: grid; gap: 32px; max-width: 520px; }
                    .rg-form .row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
                    .rg-form label { display: block; color: ${TEAL}; font-family: "DM Sans", system-ui, sans-serif; font-size: 14px; margin-bottom: 6px; font-weight: 500; }
                    .rg-form input, .rg-form textarea { width: 100%; border: 0; border-bottom: 1px solid ${TEAL}; background: transparent; padding: 6px 0 8px; font-family: "DM Sans", system-ui, sans-serif; font-size: 15px; color: ${DARK_TEXT}; outline: none; transition: border-color 0.2s; }
                    .rg-form input:focus, .rg-form textarea:focus { border-bottom-color: ${CORAL}; }
                    .rg-form textarea { min-height: 80px; resize: vertical; }
                    .rg-form .submit-row { display: flex; justify-content: flex-end; }
                    .rg-form button { background: ${CORAL}; color: #FFFFFF; border: 0; padding: 14px 42px; border-radius: 999px; font-family: "DM Sans", system-ui, sans-serif; font-size: 15px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
                    .rg-form button:hover { background: #E54A4A; }
                    @media (max-width: 720px) { .rg-form .row { grid-template-columns: 1fr; } }
                  </style>
                  <form class="rg-form" action="mailto:robin.goffman@gmail.com" method="post" enctype="text/plain">
                    <div class="row">
                      <div><label>First &amp; Last Name</label><input type="text" name="name"/></div>
                      <div><label>Email *</label><input type="email" name="email" required/></div>
                    </div>
                    <div><label>Leave me a message...</label><textarea name="message"></textarea></div>
                    <div class="submit-row"><button type="submit">Submit</button></div>
                  </form>`,
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
      id: 'contact-footer',
      order: 2,
      paddingTop: '32px',
      paddingBottom: '32px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '100%',
      style: { backgroundColor: CREAM_BG, borderTopWidth: '1px', borderTopStyle: 'solid' as const, borderTopColor: '#F0E9D8' },
      blocks: [
        {
          type: 'text',
          id: 'contact-footer-text',
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

  const seoTitle = 'Contact | Robin Goffman';
  const seoDescription = 'Get in touch with Robin Goffman — Brand Thinker & Design Strategist.';

  const [existing] = await db.select().from(posts).where(and(eq(posts.slug, 'contact'), eq(posts.websiteId, ids.websiteId))).limit(1);
  if (existing) {
    await db.update(posts).set({ content, title: 'Contact', published: true, publishedAt: new Date(), seoTitle, seoDescription }).where(eq(posts.id, existing.id));
    console.log(`Contact page updated: ID ${existing.id}`);
  } else {
    const [page] = await db.insert(posts).values({
      title: 'Contact', slug: 'contact', postType: 'page', content, published: true, publishedAt: new Date(), websiteId: ids.websiteId,
      seoTitle, seoDescription,
    }).returning();
    console.log(`Contact page created: ID ${page.id}`);
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
