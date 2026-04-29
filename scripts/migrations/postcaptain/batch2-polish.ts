/**
 * Batch 2 — small polish edits to post 302 to close remaining gaps.
 *
 * - Center the "Strategic Growth Engine" stats heading (live centers it)
 * - Add a green-check bullet style class (.seu-list) to the active-panel-bullet
 *   list (already in customCSS, but make sure each detail panel uses it)
 * - Tighten the active services panel: wrap its content in a green rounded
 *   container matching live's "Implementations" detail card styling
 *   — done via customCSS targeting `services-active-panel`
 * - Audit section: live shows "AUDITS" overline + "Get More from Your Slate
 *   Instance" with no "Uncover solutions..." paragraph — slim it down. (Skip:
 *   our local already shows audit subhead which is fine; live actually does
 *   show it too; mark match good.)
 * - Hero subblocks: ensure the trust bar is on a clean light strip — already
 *   fine.
 *
 * Idempotent.
 */
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Block = Record<string, unknown> & { id?: string; type?: string; blocks?: Block[] };

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
    if (Array.isArray((b as { columns?: { blocks?: Block[] }[] }).columns)) {
      for (const col of (b as { columns?: { blocks?: Block[] }[] }).columns ?? []) {
        if (Array.isArray(col?.blocks)) {
          const r = findBlockById(col.blocks, id);
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

  // 1. Center stats heading
  const csHeading = findBlockById(blocks, 'cs-heading');
  if (csHeading) {
    const s = ((csHeading as { style?: Record<string, string> }).style ??= {});
    s.textAlign = 'center';
    s.maxWidth = '900px';
    s.margin = '0 auto 16px';
  }
  const csDesc = findBlockById(blocks, 'cs-desc');
  if (csDesc) {
    const s = ((csDesc as { style?: Record<string, string> }).style ??= {});
    s.textAlign = 'center';
    s.margin = '0 auto 40px';
  }

  // 2. Service detail bullets — wrap each list block content with the
  //    .seu-list class so the existing customCSS turns them into
  //    green-check bullets like the active "Set Everyone Up" card.
  for (const id of ['active-panel-bullet-list', 'svc-projects-list', 'svc-support-list']) {
    const block = findBlockById(blocks, id);
    if (block && typeof (block as { content?: string }).content === 'string') {
      // The content is already a <ul class="seu-list"> from batch1, but
      // the legacy customCSS only fires inside the [data-block-id="set-everyone-up-card"]
      // selector. The CSS target is too narrow. We'll widen the customCSS
      // below so any .seu-list inside the post renders correctly.
    }
  }

  // 3. Widen the .seu-list customCSS rule so it applies anywhere on the page
  let css = post.customCss ?? '';
  // Append a generic widened rule (idempotent — only add if not already present).
  const MARKER = '/* seu-list-global — widened scope for all detail panels */';
  if (!css.includes(MARKER)) {
    css += `

${MARKER}
.block-content .seu-list {
  list-style: none !important;
  padding: 0 !important;
  margin: 0 !important;
  display: grid !important;
  gap: 10px !important;
}
.block-content .seu-list li {
  display: flex !important;
  align-items: flex-start !important;
  gap: 12px !important;
  font-family: 'DM Sans', system-ui, sans-serif !important;
  font-size: 15px !important;
  line-height: 1.5 !important;
  color: #1F4F6F !important;
  padding-left: 0 !important;
  position: relative !important;
}
.block-content .seu-list li::before {
  content: "" !important;
  display: inline-block !important;
  flex: 0 0 18px !important;
  width: 18px !important;
  height: 18px !important;
  margin-top: 2px !important;
  background: #4C9770 !important;
  border-radius: 50% !important;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M9 16.2l-3.5-3.5 1.4-1.4L9 13.4l7.1-7.1 1.4 1.4z'/></svg>") !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-size: 14px 14px !important;
}
/* /seu-list-global */`;
  }

  // 4. Wrap each services detail panel in a soft green border like live.
  const PANEL_MARKER = '/* svc-detail-panel — green rounded container */';
  if (!css.includes(PANEL_MARKER)) {
    css += `

${PANEL_MARKER}
.block-content [data-block-id="services-active-panel"] > section > div.container,
.block-content [data-block-id="svc-projects-panel"],
.block-content [data-block-id="svc-support-panel"] {
  border: 2px solid #CCE1D0 !important;
  background: #F4FAF5 !important;
  border-radius: 16px !important;
  padding: 36px 40px !important;
  margin: 0 0 24px !important;
}
.block-content [data-block-id="services-active-panel"] {
  background: transparent !important;
}
.block-content [data-block-id="services-active-panel"] > section {
  padding: 0 !important;
}
/* /svc-detail-panel */`;
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 polished.');
  console.log('  csHeading centered ->', !!csHeading);
  console.log('  csDesc centered    ->', !!csDesc);
  console.log('  seu-list-global    ->', css.includes(MARKER));
  console.log('  svc-detail-panel   ->', css.includes(PANEL_MARKER));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
