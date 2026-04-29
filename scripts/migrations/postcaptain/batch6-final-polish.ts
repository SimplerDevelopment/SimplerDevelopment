/**
 * Batch 6 — final polish for ≥95% match.
 *
 * 1. Reduce scroll-tabs panel min-height: 60vh → 40vh so total section is
 *    leaner and inactive-panel deadspace shrinks.
 * 2. Tighten audit/solutions section spacing slightly to reduce slack
 *    between sections.
 * 3. Drop the panel border on inactive panels (less visual weight).
 *
 * Idempotent — re-stamps the marked block.
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

  // 1. Reduce panel min-height
  const scrollTabs = findBlockById(blocks, 'svc-scroll-tabs') as
    | (Block & { panelMinHeight?: string })
    | null;
  if (scrollTabs) {
    scrollTabs.panelMinHeight = '40vh';
  }

  // 2. Tighten section spacing for audits and solutions
  for (const id of ['audits-section', 'solutions-section']) {
    const sec = findBlockById(blocks, id) as
      | (Block & { paddingTop?: string; paddingBottom?: string })
      | null;
    if (sec) {
      sec.paddingTop = '64px';
      sec.paddingBottom = '64px';
    }
  }

  // 3. Drop border on inactive panels via CSS
  let css = post.customCss ?? '';
  css = css.replace(
    /\/\* svc-scroll-tabs-final[\s\S]*?\/\* \/svc-scroll-tabs-final \*\//g,
    '',
  );
  css += `

/* svc-scroll-tabs-final — final polish for inactive panel weight */
.block-content [data-block-id="svc-scroll-tabs"] .ssct-panel:not(.is-active) {
  border-color: transparent !important;
  background: transparent !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-panels {
  margin-top: 8px;
}
/* /svc-scroll-tabs-final */`;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch6 applied.');
  console.log('  scrollTabs panelMinHeight ->', !!scrollTabs);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
