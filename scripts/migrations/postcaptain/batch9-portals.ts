/**
 * Batch 9 — Portals section: match live structure + typography.
 *
 * Live (postcaptain.com) portals layout:
 *   PORTALS label  →  heading  →  description  →  LEARN MORE button  →  ONE big preview image below
 *   container: padding 100px 40px, max-width 1200px, gap 60px
 *   heading: font-weight 400, font-size 48px, letter-spacing -0.01em, color #004D80
 *   button: padding 24px 36px, border-radius 40px, font-size 16px, letter-spacing 0.01em
 *   image: max-width 900px (we use 760), border-radius 12px, full width
 *
 * Local (before this batch):
 *   image FIRST, then label/heading/desc/button. Heading was font-weight 700, color #0A3A5C.
 *   Button used default styling (smaller padding, smaller font).
 *
 * This batch:
 *  1. Reorder portals-section: image becomes the LAST child (order:5), button becomes order:4.
 *  2. Heading: weight 400, color #004D80, size 3rem (~48px), letter-spacing -0.01em.
 *  3. Button: explicit padding/radius/letter-spacing/size to match live.
 *  4. Section: bump padding-top/bottom to 100px to match live's vertical rhythm.
 *  5. Image bumped to 900px max-width (live's actual cap).
 *
 * Idempotent: rewrites the order/styles each run, never duplicates blocks.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch9-portals.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Block = Record<string, unknown> & {
  id?: string;
  type?: string;
  blocks?: Block[];
  columns?: Array<Record<string, unknown> & { blocks?: Block[] }>;
};

interface PostContent {
  blocks: Block[];
  version?: string;
}

function findBlockById(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (Array.isArray(b.blocks)) {
      const r = findBlockById(b.blocks, id);
      if (r) return r;
    }
    if (Array.isArray(b.columns)) {
      for (const col of b.columns ?? []) {
        if (Array.isArray(col?.blocks)) {
          const r = findBlockById(col.blocks as Block[], id);
          if (r) return r;
        }
      }
    }
  }
  return null;
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;

  // ── Reorder portals-section + restyle children ──────────────────────────
  const portalsSection = findBlockById(parsed.blocks, 'portals-section');
  if (portalsSection) {
    // Bump section padding to live values.
    portalsSection.paddingTop = '100px';
    portalsSection.paddingBottom = '100px';
    portalsSection.paddingLeft = '40px';
    portalsSection.paddingRight = '40px';
    portalsSection.maxWidth = '1200px';

    // Update children: order = label(1), heading(2), desc(3), button(4), image(5).
    const overline = findBlockById(parsed.blocks, 'portals-overline');
    if (overline) {
      overline.order = 1;
      overline.style = {
        ...(overline.style as Record<string, unknown> ?? {}),
        color: '#004D80',
        fontFamily: 'DM Sans',
        fontSize: '14px',
        fontWeight: '700',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        margin: '0 auto 18px',
        textAlign: 'center',
        opacity: '0.9',
      };
    }

    const heading = findBlockById(parsed.blocks, 'portals-heading');
    if (heading) {
      heading.order = 2;
      heading.style = {
        ...(heading.style as Record<string, unknown> ?? {}),
        color: '#004D80',
        fontFamily: 'DM Sans',
        fontSize: '48px',
        fontWeight: '400',
        letterSpacing: '-0.01em',
        lineHeight: '1.2',
        margin: '0 auto 24px',
        textAlign: 'center',
        maxWidth: '900px',
      };
    }

    const desc = findBlockById(parsed.blocks, 'portals-desc');
    if (desc) {
      desc.order = 3;
      desc.style = {
        ...(desc.style as Record<string, unknown> ?? {}),
        color: '#004D80',
        fontFamily: 'DM Sans',
        fontSize: '18px',
        lineHeight: '1.7',
        margin: '0 auto 40px',
        textAlign: 'center',
        maxWidth: '720px',
        opacity: '0.95',
      };
    }

    const btn = findBlockById(parsed.blocks, 'portals-btn');
    if (btn) {
      btn.order = 4;
      btn.text = 'LEARN MORE';
      btn.style = {
        ...(btn.style as Record<string, unknown> ?? {}),
        backgroundColor: '#004D80',
        color: '#FFFFFF',
        fontFamily: 'Poppins',
        fontSize: '16px',
        fontWeight: '700',
        letterSpacing: '0.01em',
        textTransform: 'uppercase',
        borderRadius: '40px',
        padding: '24px 36px',
        margin: '0 auto 60px',
      };
      // Remove icon to match live (live's button has no arrow inline; clean text).
      btn.icon = '';
      btn.iconPosition = 'right';
    }

    const img = findBlockById(parsed.blocks, 'portals-preview');
    if (img) {
      img.order = 5;
      img.style = {
        ...(img.style as Record<string, unknown> ?? {}),
        borderRadius: '12px',
        margin: '0 auto',
        maxWidth: '900px',
        customCSS: 'box-shadow: 0 20px 60px rgba(0,77,128,0.12)',
        width: '100%',
      };
    }
  }

  // ── CSS for portals — fallback overrides via [data-block-id] selectors ─
  let css = post.customCss ?? '';

  // Strip prior batch9 marker block.
  css = css.replace(
    /\/\* batch9-portals[\s\S]*?\/\* \/batch9-portals \*\//g,
    '',
  );

  css += `

/* batch9-portals — match live postcaptain portals section */
.block-content [data-block-id="portals-section"] {
  padding-top: 100px !important;
  padding-bottom: 100px !important;
}
.block-content [data-block-id="portals-overline"] {
  font-family: 'DM Sans', system-ui, sans-serif !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  letter-spacing: 0.15em !important;
  text-transform: uppercase !important;
  opacity: 0.9 !important;
  color: #004D80 !important;
  margin: 0 auto 18px !important;
}
.block-content [data-block-id="portals-heading"] {
  font-family: 'DM Sans', system-ui, sans-serif !important;
  font-weight: 400 !important;
  font-size: 48px !important;
  letter-spacing: -0.01em !important;
  line-height: 1.2 !important;
  color: #004D80 !important;
  margin: 0 auto 24px !important;
}
@media (max-width: 768px) {
  .block-content [data-block-id="portals-heading"] {
    font-size: 36px !important;
  }
}
.block-content [data-block-id="portals-desc"] {
  font-family: 'DM Sans', system-ui, sans-serif !important;
  font-size: 18px !important;
  line-height: 1.7 !important;
  color: #004D80 !important;
  opacity: 0.95 !important;
  margin: 0 auto 40px !important;
  max-width: 720px !important;
}
@media (max-width: 768px) {
  .block-content [data-block-id="portals-desc"] {
    font-size: 16px !important;
  }
}
.block-content [data-block-id="portals-btn"] a,
.block-content [data-block-id="portals-btn"] button {
  background-color: #004D80 !important;
  color: #ffffff !important;
  border: 2px solid transparent !important;
  border-radius: 40px !important;
  padding: 24px 36px !important;
  font-family: 'Poppins', system-ui, sans-serif !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  letter-spacing: 0.01em !important;
  text-transform: uppercase !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  margin: 0 auto 60px !important;
  transition: all 0.3s ease !important;
}
.block-content [data-block-id="portals-btn"] a:hover,
.block-content [data-block-id="portals-btn"] button:hover {
  background-color: #ffffff !important;
  color: #004D80 !important;
  border-color: #004D80 !important;
  transform: translateY(-2px) !important;
}
.block-content [data-block-id="portals-btn"] svg,
.block-content [data-block-id="portals-btn"] .material-icons {
  display: none !important;
}
.block-content [data-block-id="portals-preview"] img {
  border-radius: 12px !important;
  max-width: 900px !important;
  width: 100% !important;
  margin: 0 auto !important;
  display: block !important;
  box-shadow: 0 20px 60px rgba(0,77,128,0.12) !important;
  transition: transform 0.3s ease !important;
}
.block-content [data-block-id="portals-preview"]:hover img {
  transform: translateY(-4px) !important;
}
/* /batch9-portals */`;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch9-portals applied.');
  console.log('  css length ->', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
