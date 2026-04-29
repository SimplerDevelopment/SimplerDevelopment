/**
 * Batch 10 — typography polish + sticky-scroll-tabs mobile-carousel wiring.
 *
 * Findings vs live (postcaptain.com):
 *  - Stats metric numbers: live uses font-weight 300, font-size 56px (NOT bold).
 *    Batch8 made them weight 700 — that's wrong. Flip to 300.
 *  - Stats label (e.g. "Increase", "Raised"): live uses 46px / 300, color #004D80.
 *  - Stats heading "TURNING SLATE INTO A STRATEGIC GROWTH ENGINE": 60px / 500
 *    Poppins, letter-spacing 0.02em.
 *  - Set svc-scroll-tabs block's mobileTabsBehavior to 'carousel' (default in
 *    code, but make it explicit on the instance so behavior is durable).
 *  - Add CSS to show .ssct-mobile-tabs at <=1024px and hide on desktop.
 *  - Solutions card heading: live's font-weight is 700 + uppercase via CSS.
 *  - Footer column headings: bump letter-spacing to 0.12em uppercase.
 *  - Hero kicker / mapping eyebrow letter-spacing: 0.18em (live uses 0.15-0.2em).
 *
 * Idempotent: rewrites the marker block on each run.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch10-typography.ts dotenv_config_path=.env.local
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

  // Make scroll-tabs mobile carousel explicit.
  const scrollTabs = findBlockById(parsed.blocks, 'svc-scroll-tabs');
  if (scrollTabs) {
    scrollTabs.mobileTabsBehavior = 'carousel';
  }

  // ── CSS additions ───────────────────────────────────────────────────────
  let css = post.customCss ?? '';

  // Strip prior batch10 marker.
  css = css.replace(
    /\/\* batch10-typography[\s\S]*?\/\* \/batch10-typography \*\//g,
    '',
  );

  // Strip the conflicting batch8 stats rule (`font-weight: 700` was too heavy).
  // We keep batch8's selector pattern but override below with weight 300.

  css += `

/* batch10-typography — stats weight + mobile carousel + small typography polish */

/* ── Mobile sticky-scroll-tabs carousel — show on <=1024px ───────────────── */
@media (max-width: 1024px) {
  .ssct-mobile-tabs {
    display: flex !important;
  }
  /* Hide the desktop tabs row on mobile */
  .block-content [data-block-id="svc-scroll-tabs"] .ssct-tabs {
    display: none !important;
  }
}
@media (min-width: 1025px) {
  .ssct-mobile-tabs {
    display: none !important;
  }
}
.ssct-mobile-tabs::-webkit-scrollbar {
  display: none;
}
.ssct-mobile-tabs {
  scrollbar-width: none;
}

/* ── Stats — restore live's light-weight metric numbers ──────────────────── */
.block-content [data-block-id="cs-metrics"] > section > .grid [style*="font-size"] {
  font-size: clamp(3.0rem, 4.5vw, 3.8rem) !important;
  font-weight: 300 !important;
  font-family: 'DM Sans', system-ui, sans-serif !important;
  line-height: 1.1 !important;
  letter-spacing: 0 !important;
  color: #004D80 !important;
}
/* The metric "label" (Increase / Raised etc.) sits next to the number — live
   is also weight 300, slightly smaller. */
.block-content [data-block-id="cs-metrics"] > section > .grid > div > div > span:not([class]),
.block-content [data-block-id="cs-metrics"] > section > .grid h3 {
  font-weight: 300 !important;
  font-family: 'DM Sans', system-ui, sans-serif !important;
  color: #004D80 !important;
}

/* Stats heading — bump to 60px / 500 / Poppins to match live. */
.block-content [data-block-id="cs-heading"],
.block-content [data-block-id="cs-heading"] h1,
.block-content [data-block-id="cs-heading"] h2,
.block-content [data-block-id="cs-heading"] h3 {
  font-family: 'Poppins', system-ui, sans-serif !important;
  font-size: clamp(2.2rem, 4.2vw, 3.75rem) !important;
  font-weight: 500 !important;
  letter-spacing: 0.02em !important;
  line-height: 1.1 !important;
  text-transform: uppercase !important;
  color: #0A3A5C !important;
}

/* ── Solutions cards — heading weight + slight icon polish ───────────────── */
.block-content [data-block-id="solutions-section"] [class*="heading"],
.block-content [data-block-id="solutions-section"] h3,
.block-content [data-block-id="solutions-section"] h4 {
  font-family: 'Poppins', system-ui, sans-serif !important;
  font-weight: 700 !important;
  letter-spacing: 0.04em !important;
  text-transform: uppercase !important;
}

/* ── Audits chip text — letter-spacing match live ────────────────────────── */
.block-content [data-block-id="audits-section"] [class*="pill"],
.block-content [data-block-id="audits-section"] button,
.block-content [data-block-id="audits-section"] a[class*="border"] {
  font-family: 'Poppins', system-ui, sans-serif !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  letter-spacing: 0.1em !important;
  text-transform: uppercase !important;
}

/* ── Hero kicker / Mapping eyebrow / Footer headings — letter-spacing pass ─ */
.block-content [data-block-id="hero-1"] [class*="kicker"],
.block-content [data-block-id="hero-1"] [class*="overline"] {
  letter-spacing: 0.18em !important;
}
.block-content [data-block-id="services-section"] [class*="overline"],
.block-content [data-block-id="services-section"] [class*="eyebrow"] {
  letter-spacing: 0.18em !important;
  text-transform: uppercase !important;
}
.block-content [data-block-type="site-footer"] [class*="column"] h3,
.block-content [data-block-type="site-footer"] [class*="column"] h4,
.block-content [data-block-type="site-footer"] [class*="col"] h3,
.block-content [data-block-type="site-footer"] [class*="col"] h4 {
  font-family: 'Poppins', system-ui, sans-serif !important;
  font-weight: 700 !important;
  letter-spacing: 0.12em !important;
  text-transform: uppercase !important;
  font-size: 13px !important;
}

/* /batch10-typography */`;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch10-typography applied.');
  console.log('  scroll-tabs.mobileTabsBehavior ->', (scrollTabs as Record<string, unknown> | null)?.mobileTabsBehavior ?? 'n/a');
  console.log('  css length ->', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
