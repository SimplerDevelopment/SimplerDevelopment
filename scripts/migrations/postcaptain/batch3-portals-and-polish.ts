/**
 * Batch 3 — close the Portals gap and polish.
 *
 * Live's Portals section: image (Lafayette portal screenshot) on top,
 * then centered overline + heading + description + CTA pill.
 * Local: image stacked beneath text, all left-aligned, with empty 10%
 * second column.
 *
 * This script:
 *  1. Removes the unused `portals-image-col` (width:10) empty column.
 *  2. Reorders the portals-text-col children so the image (`portals-preview`)
 *     comes first, then overline, heading, desc, button.
 *  3. Center-aligns the text + button styles to match live.
 *  4. Adjusts the columns block to a single full-width column instead of
 *     45/10 split.
 *  5. Adds a sticky tab strip CSS rule above the service detail panels
 *     to give the visual feel of live's scroll-tabs without scaffolding
 *     a new block. (Path B nudge while we still consider Path A.)
 *
 * Idempotent.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch3-portals-and-polish.ts dotenv_config_path=.env.local
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
  const blocks = parsed.blocks;

  // 1+2+3+4 — restructure portals section
  const portalsContent = findBlockById(blocks, 'portals-content') as
    | (Block & { columns?: Array<Record<string, unknown> & { id?: string; width?: string | number; blocks?: Block[] }> })
    | null;
  if (portalsContent && Array.isArray(portalsContent.columns)) {
    // Find the text column (currently has all blocks including image)
    const textCol = portalsContent.columns.find((c) => c.id === 'portals-text-col');
    if (textCol && Array.isArray(textCol.blocks)) {
      // Reorder: image first, then overline, heading, desc, button
      const byId = new Map(textCol.blocks.map((b) => [b.id, b]));
      const ordered: Block[] = [];
      const desiredOrder = [
        'portals-preview',
        'portals-overline',
        'portals-heading',
        'portals-desc',
        'portals-btn',
      ];
      for (const id of desiredOrder) {
        const b = byId.get(id);
        if (b) {
          // re-stamp `order` to be sequential
          (b as { order?: number }).order = ordered.length + 1;
          ordered.push(b);
          byId.delete(id);
        }
      }
      // Append any unmatched stragglers at the end
      for (const b of byId.values()) {
        (b as { order?: number }).order = ordered.length + 1;
        ordered.push(b);
      }
      textCol.blocks = ordered;

      // Center-align the column itself
      (textCol as { textAlign?: string }).textAlign = 'center';
      (textCol as { width?: string | number }).width = '100%';
    }
    // Drop the empty image column
    portalsContent.columns = portalsContent.columns.filter(
      (c) => c.id !== 'portals-image-col',
    );
  }

  // Center the typography on each portals child block
  const portalsOverline = findBlockById(blocks, 'portals-overline');
  if (portalsOverline) {
    (portalsOverline as { alignment?: string }).alignment = 'center';
    const s = ((portalsOverline as { style?: Record<string, string> }).style ??= {});
    s.textAlign = 'center';
    s.margin = '0 auto 14px';
  }
  const portalsHeading = findBlockById(blocks, 'portals-heading');
  if (portalsHeading) {
    (portalsHeading as { alignment?: string }).alignment = 'center';
    const s = ((portalsHeading as { style?: Record<string, string> }).style ??= {});
    s.textAlign = 'center';
    s.margin = '0 auto 16px';
    s.maxWidth = '900px';
  }
  const portalsDesc = findBlockById(blocks, 'portals-desc');
  if (portalsDesc) {
    (portalsDesc as { alignment?: string }).alignment = 'center';
    const s = ((portalsDesc as { style?: Record<string, string> }).style ??= {});
    s.textAlign = 'center';
    s.margin = '0 auto 28px';
    s.maxWidth = '640px';
  }
  const portalsBtn = findBlockById(blocks, 'portals-btn');
  if (portalsBtn) {
    (portalsBtn as { alignment?: string }).alignment = 'center';
    const s = ((portalsBtn as { style?: Record<string, string> }).style ??= {});
    s.margin = '0 auto';
  }
  const portalsPreview = findBlockById(blocks, 'portals-preview');
  if (portalsPreview) {
    (portalsPreview as { alignment?: string }).alignment = 'center';
    const s = ((portalsPreview as { style?: Record<string, string> }).style ??= {});
    s.margin = '0 auto 40px';
    s.maxWidth = '760px';
    // Soft drop shadow (already set), keep
    s.borderRadius = '12px';
  }

  // 5. Append CSS — make the services-tabs-row sticky, give it the live-style
  //    tab pill row, and add a soft container around each service-detail panel.
  let css = post.customCss ?? '';
  const STICKY_MARKER = '/* svc-tabs-sticky — sticky tab strip above detail panels */';
  if (!css.includes(STICKY_MARKER)) {
    css += `

${STICKY_MARKER}
.block-content [data-block-id="services-tabs-row"] {
  position: sticky !important;
  top: 80px !important;
  z-index: 30 !important;
  background: #FFFFFF !important;
  padding: 16px 0 !important;
  box-shadow: 0 4px 12px rgba(10, 58, 92, 0.04) !important;
  border-radius: 999px !important;
  margin-bottom: 32px !important;
}
.block-content [data-block-id="services-tabs-row"]::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
}
/* Smooth transition on scroll for the detail panels */
.block-content [data-block-id="services-active-panel"],
.block-content [data-block-id="svc-projects-panel"],
.block-content [data-block-id="svc-support-panel"] {
  scroll-margin-top: 160px;
}
/* /svc-tabs-sticky */`;
  }

  const PORTALS_FIX_MARKER = '/* portals-stack-center — center portals content with image on top */';
  if (!css.includes(PORTALS_FIX_MARKER)) {
    css += `

${PORTALS_FIX_MARKER}
.block-content [data-block-id="portals-section"] [data-block-id="portals-content"] > div {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  text-align: center !important;
  gap: 0 !important;
}
.block-content [data-block-id="portals-section"] [data-block-id="portals-text-col"] {
  width: 100% !important;
  max-width: 880px !important;
  text-align: center !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
}
.block-content [data-block-id="portals-section"] [data-block-id="portals-text-col"] > div {
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  text-align: center !important;
}
.block-content [data-block-id="portals-section"] [data-block-id="portals-preview"] {
  margin: 0 auto 40px !important;
  max-width: 760px !important;
  width: 100% !important;
}
.block-content [data-block-id="portals-section"] [data-block-id="portals-preview"] img {
  margin: 0 auto !important;
  max-width: 100% !important;
  height: auto !important;
}
.block-content [data-block-id="portals-section"] [data-block-id="portals-btn"] a {
  background: #0A3A5C !important;
  color: #fff !important;
  border-radius: 999px !important;
  padding: 14px 36px !important;
  font-weight: 700 !important;
  letter-spacing: 0.06em !important;
  text-transform: uppercase !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  text-decoration: none !important;
}
.block-content [data-block-id="portals-section"] [data-block-id="portals-btn"] a svg {
  display: none !important;
}
/* /portals-stack-center */`;
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch3 applied.');
  console.log('  portals-content reordered ->', !!portalsContent);
  console.log('  sticky-tabs CSS         ->', css.includes(STICKY_MARKER));
  console.log('  portals-stack-center CSS ->', css.includes(PORTALS_FIX_MARKER));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
