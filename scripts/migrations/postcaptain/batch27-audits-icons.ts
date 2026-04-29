/**
 * Batch 27 — audits row icons.
 *
 * Vision-review feedback:
 *   - Local audit rows show crosshair (gps_fixed), 3-line storage, and 4-dot
 *     workspaces icons; live shows a target-circle, database cylinder, and
 *     2x2 grid.
 *
 * Strategy: mutate posts.content for the three audit-badge text blocks,
 * swapping the Material Icons ligature name inside <span class="material-icons">.
 *
 * Mapping (live → Material Icons font ligature):
 *   - target circle  → track_changes
 *   - database       → dns          (3 stacked rectangles, reads as cylinder)
 *   - 2x2 grid       → grid_view
 *
 * The pc-audit-icon styling (font-family forced + ligature setting) is
 * already in batch22 customCss, so swapping the ligature name is sufficient.
 *
 * Idempotent — safe to re-run; just sets the same content again.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch27-audits-icons.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Block = Record<string, unknown> & {
  id?: string;
  type?: string;
  content?: string;
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

const SWAPS: Record<string, { from: string; to: string; label: string }> = {
  'badge-targeted': {
    from: '<span class="material-icons pc-audit-icon">gps_fixed</span>',
    to: '<span class="material-icons pc-audit-icon">track_changes</span>',
    label: 'TARGETED AUDIT',
  },
  'badge-database': {
    from: '<span class="material-icons pc-audit-icon">storage</span>',
    to: '<span class="material-icons pc-audit-icon">dns</span>',
    label: 'DATABASE AUDIT',
  },
  'badge-org': {
    from: '<span class="material-icons pc-audit-icon">workspaces</span>',
    to: '<span class="material-icons pc-audit-icon">grid_view</span>',
    label: 'ORGANIZATION & GOVERNANCE AUDIT',
  },
};

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;
  const log: string[] = [];

  for (const [id, swap] of Object.entries(SWAPS)) {
    const block = findBlockById(parsed.blocks, id) as
      | (Block & { content?: string })
      | null;
    if (!block) {
      log.push(`SKIP ${id}: block not found`);
      continue;
    }
    const before = block.content ?? '';
    if (before.includes(swap.to)) {
      log.push(`OK   ${id}: already updated to ${swap.to.match(/>([^<]+)</)?.[1] ?? '?'}`);
      continue;
    }
    // Replace any prior icon span (whatever ligature it pointed to) with the new one.
    const after = before.replace(
      /<span class="material-icons pc-audit-icon">[^<]*<\/span>/,
      swap.to,
    );
    if (after === before) {
      log.push(`WARN ${id}: no replacement made (regex did not match)`);
      continue;
    }
    block.content = `${after.split('</span>').slice(0, 1).join('')}</span> ${swap.label}`.replace(
      /<\/span>\s*[A-Z &]+$/,
      `</span> ${swap.label}`,
    );
    // Cleaner: just take the new span + " " + label, since we know the shape.
    block.content = `${swap.to} ${swap.label}`;
    log.push(`SET  ${id}: -> ${swap.to.match(/>([^<]+)</)?.[1] ?? '?'}`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch27-audits-icons applied:');
  for (const line of log) console.log(' -', line);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
