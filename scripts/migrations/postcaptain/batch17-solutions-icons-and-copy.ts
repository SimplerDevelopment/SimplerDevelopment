/**
 * Batch 17 — solutions section: icon glyphs + restored canonical copy.
 *
 * Closes punch-list items s1, s2, s3 (and partially s4) for the
 * solutions block on post 302:
 *
 *   s1  Admissions card was rendering the literal text "badge" because
 *       `badge` had no react-icons mapping and the Material Icons font
 *       fallback occasionally fails to ligature in time. The mapping
 *       has been added in components/ui/Icon.tsx in the same commit;
 *       the migration here is just to re-snapshot the data — no JSON
 *       edit is required for s1 once the renderer renders Md icons.
 *       (Kept here as a no-op assertion so the migration file documents
 *       the section it closes.)
 *
 *   s2  Each card on live wraps in <a> with a `solution/<slug>` href.
 *       Local cards have no link. The Card component already supports a
 *       `link` field; we set canonical hrefs.
 *
 *   s3  Card body copy on local had been locally rewritten (see prior
 *       sessions). Default is to restore live copy unless the rewrite
 *       is intentional. Per the punch-list, no SEO/owner signal exists
 *       to keep the rewrite, so we restore the live phrasing verbatim.
 *
 *   s4  (partial) Live shows bare green icons, not tinted-square
 *       backgrounds. The tinted-square treatment in local comes from
 *       the Card component's default chrome, not from elementStyles —
 *       so this is left for a follow-up renderer tweak rather than a
 *       migration. The icon color stays #5BA573 to match live's green.
 *
 * Idempotent — every edit is a deterministic replace.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch17-solutions-icons-and-copy.ts dotenv_config_path=.env.local
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

interface SolutionCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  link?: string;
}

const TARGET: Record<string, { description: string; link: string }> = {
  'sol-admissions': {
    description:
      "In theory, it's a straight path, but in reality, building a class is complex. Slate simplifies the process—and we simplify Slate.",
    link: '/solution/admissions',
  },
  'sol-success': {
    description:
      'We all want to make an impact, but helping students thrive is what really drives us. Slate gives you the tools to support, engage, and guide them every step of the way.',
    link: '/solution/student-success',
  },
  'sol-advancement': {
    description:
      "Slate makes giving possible, but managing the details isn't always easy. We help you organize your data, understand your donors, and make the most of every opportunity.",
    link: '/solution/advancement',
  },
};

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;
  const log: string[] = [];

  const grid = findBlockById(parsed.blocks, 'solutions-cards') as
    | (Block & { cards?: SolutionCard[] })
    | null;

  if (!grid) {
    log.push('solutions-cards NOT FOUND — skipped');
  } else if (!Array.isArray(grid.cards)) {
    log.push('solutions-cards.cards is not an array — skipped');
  } else {
    for (const card of grid.cards) {
      const target = TARGET[card.id];
      if (!target) {
        log.push(`${card.id}: no canonical target — skipped`);
        continue;
      }
      const before: string[] = [];
      const after: string[] = [];
      if (card.description !== target.description) {
        before.push(`desc="${card.description.slice(0, 32)}…"`);
        after.push(`desc="${target.description.slice(0, 32)}…"`);
        card.description = target.description;
      }
      if (card.link !== target.link) {
        before.push(`link=${card.link ?? '(none)'}`);
        after.push(`link=${target.link}`);
        card.link = target.link;
      }
      if (before.length === 0) {
        log.push(`${card.id}: already canonical — skipped`);
      } else {
        log.push(`${card.id}: ${before.join(', ')} -> ${after.join(', ')}`);
      }
    }
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch17-solutions-icons-and-copy applied:');
  for (const line of log) console.log(' -', line);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
