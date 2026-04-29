/**
 * Batch 13 — close three specific gaps surfaced by post-batch12 SBS
 * inspection (visual diff of the Solutions and CTA sections):
 *
 *   1. Solutions card icons are out of order vs live.
 *      live: ADMISSIONS=ID-badge, STUDENT SUCCESS=graduation-cap, ADVANCEMENT=trending-up
 *      local: ADMISSIONS=school (cap), STUDENT SUCCESS=trending_up, ADVANCEMENT=volunteer_activism (heart)
 *      Fix: badge / school / trending_up.
 *
 *   2. Solutions section has a top→bottom green gradient
 *      (linear-gradient(rgb(168,213,176) 0%, rgb(238,247,239) 100%)).
 *      Live is a flat mint band — fades to almost-white look mid-section in
 *      our screenshot, costing the score. Drop the gradient and let the
 *      flat backgroundColor #B6DCBD do the work alone.
 *
 *   3. CTA heading "Your Slate Journey Starts Here" is fontWeight 700 (bold)
 *      locally; live renders it noticeably lighter (~500). Drop to 500.
 *
 * Idempotent: rewrites these specific keys unconditionally.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch13-icons-and-cta-weight.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type AnyBlock = Record<string, unknown> & {
  id?: string;
  blocks?: AnyBlock[];
  columns?: Array<Record<string, unknown> & { blocks?: AnyBlock[] }>;
  cards?: Array<Record<string, unknown>>;
  style?: Record<string, unknown>;
};

interface PostContent { blocks: AnyBlock[]; }

function findBlockById(blocks: AnyBlock[], id: string): AnyBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (Array.isArray(b.blocks)) {
      const r = findBlockById(b.blocks, id);
      if (r) return r;
    }
    if (Array.isArray(b.columns)) {
      for (const col of b.columns ?? []) {
        if (Array.isArray(col?.blocks)) {
          const r = findBlockById(col.blocks as AnyBlock[], id);
          if (r) return r;
        }
      }
    }
  }
  return null;
}

const SOLUTIONS_ICON_MAP: Record<string, string> = {
  'sol-admissions': 'badge',
  'sol-success': 'school',
  'sol-advancement': 'trending_up',
};

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;

  const summary: string[] = [];

  // (1) Solutions cards icons
  const solCards = findBlockById(parsed.blocks, 'solutions-cards');
  if (solCards && Array.isArray(solCards.cards)) {
    for (const card of solCards.cards as Array<Record<string, unknown>>) {
      const id = String(card.id ?? '');
      if (id in SOLUTIONS_ICON_MAP) {
        const before = card.icon;
        card.icon = SOLUTIONS_ICON_MAP[id];
        summary.push(`  ${id}.icon: ${String(before)} → ${String(card.icon)}`);
      }
    }
  } else {
    summary.push('  solutions-cards: not found, skipped');
  }

  // (2) Solutions section gradient removal
  const solSection = findBlockById(parsed.blocks, 'solutions-section');
  if (solSection?.style && typeof solSection.style === 'object') {
    const s = solSection.style as Record<string, unknown>;
    if ('backgroundImage' in s) {
      const before = s.backgroundImage;
      delete s.backgroundImage;
      summary.push(`  solutions-section.style.backgroundImage: ${String(before)} → (removed)`);
    }
    s.backgroundColor = '#B6DCBD';
    summary.push(`  solutions-section.style.backgroundColor → #B6DCBD (flat mint)`);
  }

  // (3) CTA heading weight
  const ctaHeading = findBlockById(parsed.blocks, 'cta-heading');
  if (ctaHeading?.style && typeof ctaHeading.style === 'object') {
    const s = ctaHeading.style as Record<string, unknown>;
    const before = s.fontWeight;
    s.fontWeight = '500';
    summary.push(`  cta-heading.style.fontWeight: ${String(before)} → 500`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch13-icons-and-cta-weight applied:');
  console.log(summary.join('\n'));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
