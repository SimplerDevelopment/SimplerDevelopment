/**
 * Batch 9b — fix portals after batch9:
 *  1. Reorder children so they render in the correct order:
 *     overline (1), heading (2), desc (3), button (4), image (5).
 *     The renderers iterate `blocks` in array order, NOT by `order` field.
 *  2. Strip `backgroundColor` from `portals-btn` JSON style (it was
 *     painting a giant navy box around the pill via BlockStyleWrapper).
 *     Leave the navy in the CSS rule that targets the inner <a>/<button>.
 *
 * Idempotent — sorts the array each run.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch9b-portals-fix.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Block = Record<string, unknown> & {
  id?: string;
  type?: string;
  order?: number;
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

function findColumnContaining(blocks: Block[], childId: string): Block[] | null {
  for (const b of blocks) {
    if (Array.isArray(b.blocks) && b.blocks.some((c) => c.id === childId)) {
      return b.blocks;
    }
    if (Array.isArray(b.blocks)) {
      const r = findColumnContaining(b.blocks, childId);
      if (r) return r;
    }
    if (Array.isArray(b.columns)) {
      for (const col of b.columns ?? []) {
        if (Array.isArray(col?.blocks)) {
          if (col.blocks.some((c) => c.id === childId)) {
            return col.blocks;
          }
          const r = findColumnContaining(col.blocks as Block[], childId);
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

  // Find the column hosting the portals children.
  const col = findColumnContaining(parsed.blocks, 'portals-overline');
  if (col) {
    // Stable-sort children by `order` field (ascending).
    col.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    console.log('  reordered portals children ->', col.map((c) => c.id));
  } else {
    console.log('  WARN: could not find portals column');
  }

  // Strip the navy backgroundColor from the button JSON (CSS handles it now).
  const btn = findBlockById(parsed.blocks, 'portals-btn');
  if (btn && typeof btn.style === 'object' && btn.style !== null) {
    const s = btn.style as Record<string, unknown>;
    delete s.backgroundColor;
    delete s.color;
    delete s.padding;
    delete s.borderRadius;
    delete s.fontSize;
    delete s.fontWeight;
    delete s.fontFamily;
    delete s.letterSpacing;
    delete s.textTransform;
    // Keep the centering margin only — let the CSS rule control everything else.
    btn.style = { margin: '0 auto' };
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch9b applied.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
