/**
 * Batch 5 — surgical CSS tweaks for the new sticky-scroll-tabs block.
 *
 * 1. Replace the broken Material Symbols font reference with the
 *    Material Icons font that's actually loaded by the sites layout.
 * 2. Hide inactive panels (opacity 0) so the active one stands alone,
 *    matching live's "single visible panel at a time" feel more closely.
 * 3. Tighten spacing between the tab strip and the panel.
 *
 * Idempotent — re-stamps the marked block.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  let css = post.customCss ?? '';

  // Drop any prior svc-scroll-tabs-styles block so we can re-stamp.
  css = css.replace(
    /\/\* svc-scroll-tabs-styles[\s\S]*?\/\* \/svc-scroll-tabs-styles \*\//g,
    '',
  );
  css = css.replace(
    /\/\* svc-scroll-tabs-overrides[\s\S]*?\/\* \/svc-scroll-tabs-overrides \*\//g,
    '',
  );

  css += `

/* svc-scroll-tabs-overrides — typography + visibility for the sticky-scroll-tabs block */
.block-content [data-block-id="svc-scroll-tabs"] {
  position: relative;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-header {
  margin-bottom: 8px !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tabs-wrap {
  margin: 0 0 16px !important;
  padding: 12px 0 !important;
  background: #FFFFFF !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tabs {
  max-width: 100% !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab {
  height: 76px;
  font-family: 'Poppins', system-ui, sans-serif !important;
  letter-spacing: 0.08em !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab .ssct-tab-icon {
  font-family: 'Material Icons' !important;
  font-feature-settings: 'liga' !important;
  font-size: 1.6rem !important;
  display: inline-block !important;
  width: 1.6em !important;
  text-align: center !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-panel {
  margin-bottom: 16px;
  transition: opacity 0.4s ease !important;
}
/* Make inactive panels nearly invisible — the live screenshot shows just one
   panel at a time. We keep them in the layout flow so scroll position drives
   the active tab, but we drop them out of the visual fully. */
.block-content [data-block-id="svc-scroll-tabs"] .ssct-panel:not(.is-active) {
  opacity: 0.05 !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-panel.is-active {
  opacity: 1 !important;
}
/* /svc-scroll-tabs-overrides */`;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch5 applied (CSS-only).');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
