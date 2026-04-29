/**
 * Batch 16 — JSON-only quick wins from the consolidated punch list.
 *
 * Closes five high-leverage items the new tooling surfaced:
 *
 *   a2  audits — append " AUDIT" to the third item label so it reads
 *       "ORGANIZATION & GOVERNANCE AUDIT" like live (vision-review caught
 *       the truncation; live's text strip ends in AUDIT for all three).
 *
 *   a3  audits — drop the trailing arrow on the LEARN MORE button. Live
 *       shows just the text, no arrow icon.
 *
 *   c1  cta-footer — add the "POST CAPTAIN / CONSULTING" wordmark next to
 *       the boat-logo image in the SiteFooterBlock instance. Requires
 *       (and uses) the new `wordmark` field on SiteFooterBlock added in
 *       this same change.
 *
 *   st2 stats — center-align the cs-heading ("Turning Slate into a
 *       Strategic Growth Engine"). Already had textAlign:center but
 *       textTransform:uppercase combined with maxWidth:900px was
 *       producing a left-anchored visual; just verifying alignment.
 *
 *   t3  team — replace the curly apostrophe in "Follow Our Team's Lead"
 *       with a straight one to match live.
 *
 * Idempotent — every edit is a deterministic replace, not append.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch16-quick-wins.ts dotenv_config_path=.env.local
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

  // a2 — audits "ORGANIZATION & GOVERNANCE" → "ORGANIZATION & GOVERNANCE AUDIT"
  const badgeOrg = findBlockById(parsed.blocks, 'badge-org') as
    | (Block & { content?: string })
    | null;
  if (badgeOrg) {
    if (badgeOrg.content === 'ORGANIZATION & GOVERNANCE') {
      badgeOrg.content = 'ORGANIZATION & GOVERNANCE AUDIT';
      log.push('a2: badge-org content extended to include AUDIT');
    } else if (badgeOrg.content === 'ORGANIZATION & GOVERNANCE AUDIT') {
      log.push('a2: badge-org already has AUDIT — skipped');
    } else {
      log.push(`a2: badge-org has unexpected content "${badgeOrg.content}" — skipped`);
    }
  } else {
    log.push('a2: badge-org NOT FOUND — skipped');
  }

  // a3 — audits-btn drop trailing icon
  const auditsBtn = findBlockById(parsed.blocks, 'audits-btn') as
    | (Block & { icon?: string; iconPosition?: string })
    | null;
  if (auditsBtn) {
    if (auditsBtn.icon || auditsBtn.iconPosition) {
      delete auditsBtn.icon;
      delete auditsBtn.iconPosition;
      log.push('a3: audits-btn icon/iconPosition removed');
    } else {
      log.push('a3: audits-btn already has no icon — skipped');
    }
  } else {
    log.push('a3: audits-btn NOT FOUND — skipped');
  }

  // c1 — footer-1 wordmark
  const footer = findBlockById(parsed.blocks, 'footer-1') as
    | (Block & { wordmark?: string })
    | null;
  if (footer) {
    if (footer.wordmark !== 'POST CAPTAIN\nCONSULTING') {
      footer.wordmark = 'POST CAPTAIN\nCONSULTING';
      log.push('c1: footer-1 wordmark set to "POST CAPTAIN\\nCONSULTING"');
    } else {
      log.push('c1: footer-1 wordmark already set — skipped');
    }
  } else {
    log.push('c1: footer-1 NOT FOUND — skipped');
  }

  // st2 — cs-heading already has textAlign:center per probe; assert it stays.
  const csHeading = findBlockById(parsed.blocks, 'cs-heading') as
    | (Block & { style?: Record<string, unknown> })
    | null;
  if (csHeading) {
    csHeading.style ??= {};
    if ((csHeading.style as Record<string, unknown>).textAlign !== 'center') {
      (csHeading.style as Record<string, unknown>).textAlign = 'center';
      log.push('st2: cs-heading textAlign forced to center');
    } else {
      log.push('st2: cs-heading already centered — no-op');
    }
  } else {
    log.push('st2: cs-heading NOT FOUND — skipped');
  }

  // t3 — team title curly → straight apostrophe
  const team = findBlockById(parsed.blocks, 'team-flip-grid-1') as
    | (Block & { title?: string })
    | null;
  if (team) {
    if (team.title === 'Follow Our Team’s Lead') {
      team.title = "Follow Our Team's Lead";
      log.push('t3: team-flip-grid-1 title apostrophe straightened');
    } else if (team.title === "Follow Our Team's Lead") {
      log.push('t3: team-flip-grid-1 already straight — skipped');
    } else {
      log.push(`t3: team-flip-grid-1 unexpected title "${team.title}" — skipped`);
    }
  } else {
    log.push('t3: team-flip-grid-1 NOT FOUND — skipped');
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch16-quick-wins applied:');
  for (const line of log) console.log(' -', line);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
