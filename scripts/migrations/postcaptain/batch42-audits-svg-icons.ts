/**
 * Batch 42 — audits inline SVG icons (replace Material Icons font glyphs).
 *
 * The indistinguishability scorer flagged audits with 0/3 votes for "match"
 * because the local `track_changes` Material Icon renders as a hand/touch
 * glyph (looks like Material's outlined-track-changes), not the concentric-
 * circles target live uses. Probe of live's DOM (`_probe-audit-icons.mjs`)
 * confirmed all 3 audit badges use inline outlined SVGs, NOT Material Icons:
 *
 *   - TARGETED AUDIT      : 3 concentric circles (target/crosshair)
 *   - DATABASE AUDIT      : DB cylinder (ellipse + curves)
 *   - ORGANIZATION & GOV. : 4-rect grid (matches Material `grid_view` shape
 *                            but live ships an explicit SVG)
 *
 * Fix: replace each badge's Material Icons span with the exact inline SVG
 * live uses. SVGs use `currentColor` for stroke so the existing white
 * `.pc-audit-icon`-based color rules continue to apply. The icons are still
 * single inline elements with the `pc-audit-icon` class so the existing
 * font-size/margin rules continue to work (we keep the class, drop the
 * material-icons class).
 *
 * This is universal: text-block content with inline SVG is portable across
 * any tenant. No renderer changes needed.
 *
 * Idempotent: re-applying replaces prior content for these 3 badges.
 * Run: bun -r dotenv/config scripts/migrations/postcaptain/batch42-audits-svg-icons.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const TARGET_SVG = `<svg class="pc-audit-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
const DB_SVG = `<svg class="pc-audit-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
const GRID_SVG = `<svg class="pc-audit-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;

const BADGE_CONTENT: Record<string, string> = {
  'badge-targeted': `${TARGET_SVG} TARGETED AUDIT`,
  'badge-database': `${DB_SVG} DATABASE AUDIT`,
  'badge-org': `${GRID_SVG} ORGANIZATION & GOVERNANCE AUDIT`,
};

interface AnyBlock {
  id?: string;
  content?: string;
  blocks?: AnyBlock[];
  columns?: { blocks?: AnyBlock[] }[];
}

function walk(b: unknown, fn: (n: AnyBlock) => void) {
  if (!b || typeof b !== 'object') return;
  if (Array.isArray(b)) { b.forEach((x) => walk(x, fn)); return; }
  const node = b as AnyBlock;
  fn(node);
  if (Array.isArray(node.blocks)) walk(node.blocks, fn);
  if (Array.isArray(node.columns)) for (const col of node.columns) walk(col.blocks, fn);
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  const content = JSON.parse(post.content as string);
  let changed = 0;
  walk(content.blocks, (n) => {
    if (n.id && BADGE_CONTENT[n.id]) {
      const before = n.content;
      n.content = BADGE_CONTENT[n.id];
      if (before !== n.content) changed++;
      console.log(`updated ${n.id}`);
    }
  });
  if (changed === 0) {
    console.log('no badges changed (already up to date?)');
  }

  await db.update(posts).set({
    content: JSON.stringify(content),
    updatedAt: new Date(),
  }).where(eq(posts.id, 302));

  console.log(`post 302 batch42 applied. badges updated: ${changed}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
