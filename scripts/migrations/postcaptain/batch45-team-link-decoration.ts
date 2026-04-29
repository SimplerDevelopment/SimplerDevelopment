/**
 * Batch 45 — team-link button: remove inline `text-decoration: underline`.
 *
 * Indistinguishability scorer voted 1/2 "no" on team. Two of three votes
 * cited "Local 'MEET FULL TEAM' link is underlined; live version is not."
 *
 * The team-link button block JSON sets `style.textDecoration: 'underline'`
 * inline. An earlier batch33 added a customCss rule
 *   .block-content [data-block-id="team-link"] a { text-decoration: none !important }
 * but the underline is rendered on the WRAPPER DIV (which the inline style
 * lands on), not on the inner <a>. The browser then propagates the
 * underline visually onto child text since text-decoration cascades for
 * rendering even when child elements don't redeclare it.
 *
 * Fix at the JSON layer: drop `textDecoration: underline` from the block's
 * style. Universal — no renderer changes.
 *
 * Idempotent. Run:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch45-team-link-decoration.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface AnyBlock {
  id?: string;
  style?: Record<string, unknown>;
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
  let changed = false;
  walk(content.blocks, (n) => {
    if (n.id === 'team-link' && n.style && 'textDecoration' in n.style) {
      const before = n.style.textDecoration;
      delete n.style.textDecoration;
      if ('textUnderlineOffset' in n.style) delete n.style.textUnderlineOffset;
      console.log(`team-link textDecoration: ${String(before)} -> removed`);
      changed = true;
    }
  });

  await db.update(posts).set({
    content: JSON.stringify(content),
    updatedAt: new Date(),
  }).where(eq(posts.id, 302));

  console.log(`post 302 batch45 applied. changed: ${changed}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
