/**
 * Batch 12 — close section background-color drift relative to live
 * postcaptain.com.
 *
 * Hard pixelmatch scoring (run via .planning/postcaptain-replication/score.mjs)
 * surfaced four large flat-color sections where the local site is rendering
 * a noticeably paler tint than live. Probing the rendered HTML showed each
 * comes from JSON, not CSS — and one (`portals-section`) actually has the
 * correct color at `block.backgroundColor` but is being shadowed by a paler
 * `style.backgroundColor` that takes precedence in SectionBlockRender.
 *
 * Live → local mismatch matrix (probed @ top-center pixel of each SBS slice):
 *
 *   portals     live #A5C3E6    local #DCE7F0    fix style.bg → #A5C3E6
 *   solutions   live #B6DCBD    local #EAF3EC    fix style.bg → #B6DCBD
 *   casestudies live #C8D9E8    local #F5F8FB    fix block.bg → #C8D9E8
 *   team        live #E5EDF4    local #FFFFFF    fix block.bg → #E5EDF4
 *
 * Idempotent — sets each color unconditionally to the live-matched value.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch12-section-bg-tokens.ts dotenv_config_path=.env.local
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
  style?: Record<string, unknown>;
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

const TARGETS: Array<{
  id: string;
  // 'block' edits block.backgroundColor (top-level legacy field)
  // 'style' edits block.style.backgroundColor (newer field, wins over block.bg)
  // 'both' sets both for safety so future code paths don't drift back.
  where: 'block' | 'style' | 'both';
  color: string;
  liveSwatch: string;
}> = [
  { id: 'portals-section', where: 'both', color: '#A5C3E6', liveSwatch: '#A5C3E6 sky-blue' },
  { id: 'solutions-section', where: 'both', color: '#B6DCBD', liveSwatch: '#B6DCBD mint' },
  { id: 'casestudies-section', where: 'both', color: '#C8D9E8', liveSwatch: '#C8D9E8 stats blue' },
  { id: 'team-section', where: 'both', color: '#E5EDF4', liveSwatch: '#E5EDF4 team blue-gray' },
];

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;

  const summary: string[] = [];
  for (const t of TARGETS) {
    const block = findBlockById(parsed.blocks, t.id);
    if (!block) {
      summary.push(`  ${t.id}: NOT FOUND — skipping`);
      continue;
    }
    const beforeBlock = block.backgroundColor;
    const beforeStyle = (block.style as Record<string, unknown> | undefined)?.backgroundColor;
    if (t.where === 'block' || t.where === 'both') {
      block.backgroundColor = t.color;
    }
    if (t.where === 'style' || t.where === 'both') {
      block.style = { ...(block.style ?? {}), backgroundColor: t.color };
    }
    summary.push(
      `  ${t.id}: block.bg ${String(beforeBlock)} → ${String(block.backgroundColor)}, style.bg ${String(beforeStyle)} → ${String((block.style as Record<string, unknown>).backgroundColor)} (${t.liveSwatch})`,
    );
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch12-section-bg-tokens applied:');
  console.log(summary.join('\n'));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
