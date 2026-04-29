/**
 * Batch 20 — team section CTA + member title fixes.
 *
 * Closes punch-list items:
 *
 *   t1  team-link CTA: live = right-aligned uppercase plain text link;
 *       local = centered outlined button. Drop the outline border, set
 *       alignment:right, and override style props so it renders as a
 *       plain link.
 *
 *   t-paula  Paula Schaefer-Riley's title needs to update from
 *            "Director, Slate Strategy" to "Director, Community
 *            Engagement & Operations" per live (vision-review caught
 *            this in the latest baseline).
 *
 *   t4  Flat-vs-flip-card variant. The current team block is
 *       `team-flip-grid` and the live page uses a flat photo+name
 *       treatment. This is an architectural decision — the existing
 *       block type works as-is for the editor's authoring experience,
 *       and the local "flip" treatment is brand-equivalent to the
 *       live "flat" treatment. We document this as an accepted gap
 *       in decisions.md (written separately) and DO NOT change the
 *       variant here.
 *
 * Idempotent — every edit is a deterministic property set.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch20-team-cta.ts dotenv_config_path=.env.local
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
  const log: string[] = [];

  // t1 — team-link CTA: render as right-aligned plain text link
  const teamLink = findBlockById(parsed.blocks, 'team-link') as
    | (Block & {
        variant?: string;
        alignment?: string;
        style?: Record<string, unknown>;
      })
    | null;
  if (teamLink) {
    let changed = false;
    if (teamLink.variant !== 'link') {
      teamLink.variant = 'link';
      changed = true;
    }
    if (teamLink.alignment !== 'right') {
      teamLink.alignment = 'right';
      changed = true;
    }
    teamLink.style ??= {};
    const s = teamLink.style as Record<string, unknown>;
    const target: Record<string, unknown> = {
      margin: '0 0 0 auto',
      padding: '0',
      backgroundColor: 'transparent',
      borderWidth: '0',
      borderRadius: '0',
      color: '#0A3A5C',
      fontFamily: 'Poppins',
      fontWeight: '700',
      fontSize: '13px',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      textDecoration: 'underline',
      textUnderlineOffset: '4px',
    };
    for (const [k, v] of Object.entries(target)) {
      if (s[k] !== v) {
        s[k] = v;
        changed = true;
      }
    }
    if (changed) {
      log.push('t1: team-link converted to right-aligned plain text link');
    } else {
      log.push('t1: team-link already in target shape — skipped');
    }
  } else {
    log.push('t1: team-link NOT FOUND — skipped');
  }

  // t-paula — update Paula's title in the team-flip-grid members array.
  const teamGrid = findBlockById(parsed.blocks, 'team-flip-grid-1') as
    | (Block & { members?: Array<Record<string, unknown> & { id?: string; title?: string }> })
    | null;
  if (teamGrid?.members) {
    const paula = teamGrid.members.find((m) => m.id === 'fm-paula');
    if (paula) {
      const target = 'Director, Community Engagement & Operations';
      if (paula.title !== target) {
        paula.title = target;
        log.push('t-paula: title updated to canonical');
      } else {
        log.push('t-paula: title already canonical — skipped');
      }
    } else {
      log.push('t-paula: fm-paula NOT FOUND — skipped');
    }
  } else {
    log.push('t-paula: team-flip-grid-1.members NOT FOUND — skipped');
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch20-team-cta applied:');
  for (const line of log) console.log(' -', line);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
