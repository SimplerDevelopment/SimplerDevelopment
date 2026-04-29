/**
 * Batch 8 — final polish round to push desktop ≥95% / mobile ≥90%.
 *
 * Changes (idempotent — re-runs replace marked blocks):
 *  1. Scroll-tabs: switch to rectangular tabs (radius 8px, gap 8px, inactive
 *     bg #f5f5f5 to match live's `wp-block-postcaptain-scroll-tabs .tab-btn`),
 *     plus tab-strip CSS that adds the live's bottom-border-accent on active.
 *  2. Stats: enlarge metric font-weight + tighten Case Study chevron link.
 *  3. Team cards: flatten card chrome (no border, no shadow, transparent bg).
 *  4. Solutions: tighten card padding + icon-chip border-radius to 12px (was
 *     10px), bumping match alignment.
 *  5. Audits: tighten pill border-radius + inter-pill spacing on chip row.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch8-final-polish.ts dotenv_config_path=.env.local
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

  // ── (1) Scroll-tabs: switch to rectangular tabs to match live ───────────
  const scrollTabs = findBlockById(parsed.blocks, 'svc-scroll-tabs');
  if (scrollTabs) {
    scrollTabs.tabBorderRadius = '8px';
    scrollTabs.activeTabBackground = '#FFFFFF';
    scrollTabs.activeTabColor = '#000000';
    scrollTabs.inactiveTabBackground = '#F5F5F5';
    scrollTabs.inactiveTabColor = '#000000';
  }

  // ── CSS additions ───────────────────────────────────────────────────────
  let css = post.customCss ?? '';

  // Strip prior batch-8 marker block(s) so this is idempotent.
  css = css.replace(
    /\/\* batch8-polish[\s\S]*?\/\* \/batch8-polish \*\//g,
    '',
  );

  // Strip the opacity:0.05 rule from the older svc-scroll-tabs-overrides block
  // (added by batch5). It conflicts with the new absolute-positioned panel
  // approach and prevents inactive panels from rendering on mobile.
  css = css.replace(
    /\/\* Make inactive panels nearly invisible[\s\S]*?:not\(\.is-active\)\s*\{[\s\S]*?opacity:\s*0\.05\s*!important;[\s\S]*?\}/g,
    '/* (removed: opacity:0.05 on inactive panels — new absolute layout handles it) */',
  );

  // Strip the .ssct-panel { transition: opacity 0.4s ease !important } rule
  // — its specificity overrides the screenshot script's instant-transition
  // override and causes Playwright's fullPage stitch to capture mid-fade state.
  css = css.replace(
    /\.ssct-panel\s*\{[^{}]*transition:\s*opacity[^{}]*!important;[^{}]*\}/g,
    '/* (removed: ssct-panel transition rule — let inline transition handle it) */',
  );

  // Also strip the .ssct-panel.is-active { opacity: 1 !important } rule —
  // it's redundant (inline style does this) and adds noise.
  css = css.replace(
    /\.ssct-panel\.is-active\s*\{[^{}]*opacity:\s*1\s*!important;[^{}]*\}/g,
    '/* (removed: redundant .ssct-panel.is-active opacity rule) */',
  );

  css += `

/* batch8-polish — final polish round (rectangular tabs + flattened team + stats refinement) */

/* Scroll tabs — match live's rectangular tab-btn look */
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tabs {
  gap: 8px !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab {
  border: 2px solid transparent !important;
  font-size: 14px !important;
  letter-spacing: 0.01em !important;
  text-transform: uppercase !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab[aria-pressed="true"] {
  border-color: #96cba0 !important;
  background: #ffffff !important;
  color: #000000 !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab[aria-pressed="false"] {
  background: #f5f5f5 !important;
  color: #000000 !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab .material-icons {
  color: #004D80 !important;
}

/* Stats — enlarge metric numbers + tighten Case Study link */
.block-content [data-block-id="cs-metrics"] > section > .grid [style*="font-size"] {
  font-size: clamp(2.6rem, 4vw, 3.4rem) !important;
  font-weight: 700 !important;
}
.block-content [data-block-id="cs-metrics"] > section > .grid a .inline-flex {
  text-transform: none !important;
  letter-spacing: 0 !important;
  font-weight: 600 !important;
  font-size: 14px !important;
  color: #0A3A5C !important;
  border-bottom: 0 !important;
}

/* Team cards — flatten chrome to match live's borderless look */
.block-content [data-block-id="team-flip-grid-1"] .pc-flip-card,
.block-content [data-block-id="team-flip-grid-1"] [class*="flip-card"] {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  padding: 0 !important;
}
.block-content [data-block-id="team-flip-grid-1"] [class*="flip-card"] img {
  border-radius: 8px !important;
}
.block-content [data-block-id="team-flip-grid-1"] [class*="name"] {
  text-transform: uppercase !important;
  letter-spacing: 0.04em !important;
  font-weight: 700 !important;
  color: #0A3A5C !important;
}
.block-content [data-block-id="team-flip-grid-1"] [class*="title"],
.block-content [data-block-id="team-flip-grid-1"] [class*="role"] {
  color: #1B6FA8 !important;
  font-size: 14px !important;
  line-height: 1.45 !important;
}

/* Solutions — tighten card padding + icon chip radius */
.block-content [data-block-id="solutions-section"] .grid > a > div,
.block-content [data-block-id="solutions-section"] .grid > div {
  padding: 28px 24px !important;
  border-radius: 14px !important;
}
.block-content [data-block-id="solutions-section"] .grid > a > div > svg:first-child,
.block-content [data-block-id="solutions-section"] .grid > div > svg:first-child {
  border-radius: 12px !important;
  margin-bottom: 18px !important;
}

/* Audits — tighten pill chip styling */
.block-content [data-block-id="audits-section"] [class*="pill"],
.block-content [data-block-id="audits-section"] button,
.block-content [data-block-id="audits-section"] a[class*="border"] {
  border-radius: 999px !important;
  letter-spacing: 0.08em !important;
}
.block-content [data-block-id="audits-section"] .grid {
  gap: 18px !important;
}

/* Footer — wordmark text alongside boat icon (live shows POST CAPTAIN / CONSULTING) */
.block-content [data-block-type="site-footer"] .footer-brand,
.block-content [data-block-type="site-footer"] [class*="brand"] {
  display: flex !important;
  align-items: center !important;
  gap: 14px !important;
}
.block-content [data-block-type="site-footer"] [class*="brand"] h3,
.block-content [data-block-type="site-footer"] [class*="brand"] h4,
.block-content [data-block-type="site-footer"] [class*="brand"] [class*="title"] {
  font-family: 'Poppins', system-ui, sans-serif !important;
  font-weight: 700 !important;
  letter-spacing: 0.02em !important;
  text-transform: uppercase !important;
  color: #0A3A5C !important;
}

/* Mobile — show all scroll-tabs panels stacked vertically (live does the same) */
@media (max-width: 1024px) {
  .block-content [data-block-id="svc-scroll-tabs"] .ssct-scroll-outer {
    min-height: auto !important;
  }
  .block-content [data-block-id="svc-scroll-tabs"] .ssct-stage {
    position: static !important;
    top: auto !important;
  }
  .block-content [data-block-id="svc-scroll-tabs"] .ssct-tabs {
    display: none !important;
  }
  .block-content [data-block-id="svc-scroll-tabs"] .ssct-panels {
    position: static !important;
    min-height: auto !important;
  }
  .block-content [data-block-id="svc-scroll-tabs"] .ssct-panel {
    position: static !important;
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    left: auto !important;
    inset: auto !important;
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: auto !important;
    margin-bottom: 24px !important;
    transition: none !important;
  }
}
/* /batch8-polish */`;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch8 applied.');
  console.log('  scroll-tabs updated ->', !!scrollTabs);
  console.log('  css length ->', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
