/**
 * Batch 18 — portals + audits visual tweaks driven by the vision-review
 * diagnostic on the re-baselined screenshots.
 *
 * Closes punch-list items:
 *
 *   p1  portals — subtitle wraps to two lines locally (live = one).
 *       The container is constrained to `maxWidth: 720px`. Live's
 *       container is wider; we widen to 880px and reduce paragraph
 *       margin so the next block sits closer (also addresses the
 *       "extra white gap" vision called out).
 *
 *   p4  portals — drop the image box-shadow. Live's portal preview
 *       sits flat on its sky-blue band; local has a soft 0 20px 60px
 *       drop-shadow that reads as an unwanted halo against the band.
 *
 *   a1  audits — remove pill borders around audit badges; add the
 *       leading icons (target / database / grid). Live shows them as
 *       inline icon+text, no border. The simplest, most idempotent
 *       change is to switch each `text` block to a `columns` row that
 *       holds an icon + label, but that's a heavier diff. Easier and
 *       sufficient: drop the border properties on the text block style
 *       and prepend the Material Icons name as an inline span. The
 *       site shell already loads the Material Icons font, and the
 *       react-icons map (after batch17) renders gps_fixed/storage/
 *       workspaces as react-icons components when they appear in a
 *       block's `icon` field — but we are using a plain text block
 *       here, so we use a pseudo-icon span with the material-icons
 *       class as the inline-html content.
 *
 *   a4  (re-verify) audits heading weight — already 700 on local;
 *       no-op assertion.
 *
 * Idempotent — every edit is a deterministic property set.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch18-portals-audits-tweaks.ts dotenv_config_path=.env.local
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

const BADGE_ICON: Record<string, string> = {
  'badge-targeted': 'gps_fixed',
  'badge-database': 'storage',
  'badge-org': 'workspaces',
};

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;
  const log: string[] = [];

  // p1 — widen portals subtitle so it sits on one line + tighten margin
  const portalsDesc = findBlockById(parsed.blocks, 'portals-desc') as
    | (Block & { style?: Record<string, unknown> })
    | null;
  if (portalsDesc) {
    portalsDesc.style ??= {};
    const s = portalsDesc.style as Record<string, unknown>;
    if (s.maxWidth !== '880px' || s.margin !== '0 auto 24px') {
      s.maxWidth = '880px';
      s.margin = '0 auto 24px';
      log.push('p1: portals-desc widened to 880px + margin tightened');
    } else {
      log.push('p1: portals-desc already widened — skipped');
    }
  } else {
    log.push('p1: portals-desc NOT FOUND — skipped');
  }

  // p4 — drop box-shadow on portal preview image
  const portalsPreview = findBlockById(parsed.blocks, 'portals-preview') as
    | (Block & { style?: Record<string, unknown> })
    | null;
  if (portalsPreview) {
    portalsPreview.style ??= {};
    const s = portalsPreview.style as Record<string, unknown>;
    if (s.customCSS && typeof s.customCSS === 'string' && s.customCSS.includes('box-shadow')) {
      // Strip just the box-shadow declaration; preserve any other custom rules.
      const stripped = (s.customCSS as string)
        .split(';')
        .map((r) => r.trim())
        .filter((r) => r.length > 0 && !r.startsWith('box-shadow'))
        .join('; ');
      if (stripped.length === 0) {
        delete s.customCSS;
      } else {
        s.customCSS = stripped;
      }
      log.push('p4: portals-preview box-shadow removed');
    } else {
      log.push('p4: portals-preview already has no shadow — skipped');
    }
  } else {
    log.push('p4: portals-preview NOT FOUND — skipped');
  }

  // a1 — drop pill borders on each audit badge text block + prepend icon span
  for (const [id, icon] of Object.entries(BADGE_ICON)) {
    const badge = findBlockById(parsed.blocks, id) as
      | (Block & { content?: string; style?: Record<string, unknown> })
      | null;
    if (!badge) {
      log.push(`a1: ${id} NOT FOUND — skipped`);
      continue;
    }
    const s = (badge.style ??= {}) as Record<string, unknown>;
    let changed = false;

    // Strip border + padding properties — render as plain inline label.
    for (const k of [
      'borderWidth',
      'borderColor',
      'borderStyle',
      'borderRadius',
      'padding',
    ]) {
      if (k in s) {
        delete s[k];
        changed = true;
      }
    }

    // Prepend the Material Icons span if missing. We render via
    // `material-icons` font (loaded site-wide) since the badge is a
    // text block and we want HTML, not a child block.
    const iconMarker = `<span class="material-icons pc-audit-icon">${icon}</span>`;
    const existing = (badge.content ?? '') as string;
    if (!existing.includes(iconMarker)) {
      // Strip any prior pc-audit-icon span before prepending (idempotent).
      const cleaned = existing.replace(/<span class="material-icons pc-audit-icon">[^<]*<\/span>\s*/g, '');
      badge.content = `${iconMarker} ${cleaned}`.trim();
      changed = true;
    }

    if (changed) {
      log.push(`a1: ${id} borders dropped + ${icon} icon prepended`);
    } else {
      log.push(`a1: ${id} already cleaned — skipped`);
    }
  }

  // a1 supporting CSS — make the inline icon line up with the label,
  // and make the badge column align center horizontally.
  // Append a rule into the post-level customCSS so the audits row reads
  // as inline icon+text (live's treatment).
  const auditsSection = findBlockById(parsed.blocks, 'audits-section') as
    | (Block & { customCSS?: string })
    | null;
  if (auditsSection) {
    const marker = '/*batch18-audits*/';
    const rule = `${marker} .block-content [data-block-id^="badge-"] { display: flex !important; align-items: center !important; justify-content: center !important; gap: 10px !important; } .block-content [data-block-id^="badge-"] .pc-audit-icon { font-size: 22px; line-height: 1; color: #FFFFFF; opacity: 0.9; }`;
    const before = auditsSection.customCSS ?? '';
    if (!before.includes(marker)) {
      auditsSection.customCSS = (before ? before + '\n' : '') + rule;
      log.push('a1: audits-section customCSS rule appended');
    } else {
      log.push('a1: audits-section customCSS already has rule — skipped');
    }
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch18-portals-audits-tweaks applied:');
  for (const line of log) console.log(' -', line);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
