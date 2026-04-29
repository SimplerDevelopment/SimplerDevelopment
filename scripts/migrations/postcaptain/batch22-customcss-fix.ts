/**
 * Batch 22 — move audits + services + stats CSS to post-level customCss.
 *
 * Discovered while diagnosing why batch18b and batch21 didn't move
 * vision-review scores: the BlockStyleWrapper component parses
 * `style.customCSS` as a key:value string and applies it as inline
 * style props on the wrapper div — it is NOT a <style> tag injector.
 * That means every batch18b/19/21 rule that wrote to a block's
 * `customCSS` field has been silently no-op'd (and worse, polluting
 * the wrapper's inline styles with garbage props).
 *
 * Batch15 sidestepped this by writing to `posts.customCss` (the
 * post-level CSS column, which the renderer DOES emit as a <style>
 * tag inside .block-content). We adopt that pattern here:
 *
 *   1. Strip the bogus `customCSS` props off audits-section,
 *      casestudies-section, services-section.
 *   2. Append a single batch22 block to posts.customCss containing
 *      the rules from batches 18b, 19, and 21 — selectors keyed off
 *      data-block-id so no global leakage.
 *
 * Idempotent — strips a prior batch22 block before injecting.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch22-customcss-fix.ts dotenv_config_path=.env.local
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
    const panels = (b as Record<string, unknown>).panels;
    if (Array.isArray(panels)) {
      for (const p of panels) {
        if (p && typeof p === 'object' && Array.isArray((p as { blocks?: Block[] }).blocks)) {
          const r = findBlockById((p as { blocks: Block[] }).blocks, id);
          if (r) return r;
        }
      }
    }
  }
  return null;
}

const BATCH22_CSS = `/* batch22 — audits/services/stats post-level rules */

/* batch18b: audits inline icon row */
.block-content [data-block-id^="badge-"] {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 10px !important;
  border: 0 !important;
  padding: 12px 8px !important;
}
.block-content [data-block-id^="badge-"] .pc-audit-icon {
  font-family: 'Material Icons', 'Material Icons Outlined' !important;
  font-weight: normal !important;
  font-style: normal !important;
  font-size: 22px !important;
  line-height: 1 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  display: inline-block !important;
  white-space: nowrap !important;
  word-wrap: normal !important;
  direction: ltr !important;
  -webkit-font-feature-settings: 'liga' !important;
  -webkit-font-smoothing: antialiased !important;
  font-feature-settings: 'liga' !important;
  color: #FFFFFF !important;
  opacity: 0.9 !important;
}

/* batch19: stats metric suffix sizing + nowrap */
.block-content [data-block-id="cs-metrics"] .pc-metric-suffix {
  font-size: 0.55em !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  margin-left: 0.25em !important;
  white-space: nowrap !important;
}

/* batch21: services seu-list circular icon badges */
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list {
  list-style: none !important;
  padding-left: 0 !important;
  margin: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 18px !important;
}
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list li {
  display: flex !important;
  align-items: center !important;
  gap: 14px !important;
}
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list .seu-icon {
  font-family: 'Material Icons', 'Material Icons Outlined' !important;
  font-weight: normal !important;
  font-style: normal !important;
  font-size: 22px !important;
  line-height: 1 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  border-radius: 999px !important;
  background-color: #C8E6CD !important;
  color: #2F7A47 !important;
  -webkit-font-feature-settings: 'liga' !important;
  font-feature-settings: 'liga' !important;
}
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list .seu-text {
  color: #0A3A5C !important;
  font-family: 'Poppins', system-ui, sans-serif !important;
  font-weight: 600 !important;
  font-size: 15px !important;
  line-height: 1.4 !important;
}

/* /batch22 */`;

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;
  const log: string[] = [];

  // Strip bogus customCSS off the section blocks (where batches 18/19/21
  // inadvertently wrote them — those got parsed as inline-style soup).
  for (const id of ['audits-section', 'casestudies-section', 'services-section']) {
    const sec = findBlockById(parsed.blocks, id) as
      | (Block & { customCSS?: string })
      | null;
    if (sec && typeof sec.customCSS === 'string') {
      delete sec.customCSS;
      log.push(`stripped block.customCSS from ${id}`);
    }
  }

  // Update posts.customCss with batch22 block.
  let css = post.customCss ?? '';
  const startMarker = '/* batch22 — audits/services/stats post-level rules */';
  const endMarker = '/* /batch22 */';
  const startIdx = css.indexOf(startMarker);
  if (startIdx >= 0) {
    const endIdx = css.indexOf(endMarker, startIdx);
    if (endIdx >= 0) {
      css = (css.slice(0, startIdx) + css.slice(endIdx + endMarker.length)).trim();
    }
  }
  css = (css ? css + '\n\n' : '') + BATCH22_CSS;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch22-customcss-fix applied:');
  for (const line of log) console.log(' -', line);
  console.log(' - posts.customCss updated, length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
