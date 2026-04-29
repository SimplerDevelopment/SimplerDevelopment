/**
 * Batch 25 — services panel polish.
 *
 * Vision-review feedback:
 *   - Local list items show a green check-circle pseudo-element BEFORE the
 *     icon badge; live shows only the icon badge (no checkmark).
 *   - Local benefit labels (.seu-text) render bold blue; live uses regular
 *     dark-gray weight.
 *   - Live's active panel has a visible green outline border around the
 *     whole panel card; local has no border.
 *
 * Strategy (all in posts.customCss, scoped to svc-scroll-tabs):
 *   1. Suppress .seu-list li::before inside the services panels (the
 *      seu-list-global rule below adds a checkmark badge that we don't want
 *      for services — only for the case-study card "set-everyone-up-card").
 *   2. Restyle .seu-text from blue/600 to gray/medium.
 *   3. Add a 1px green outline border to the active panel (.ssct-panel.is-active).
 *
 * Idempotent — strips a prior batch25 block before writing.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch25-services-polish.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH25_CSS = `/* batch25 — services panel polish (no check pseudo, gray labels, green outline) */

/* Kill the global seu-list checkmark pseudo INSIDE the services scroll-tabs.
   The seu-list-global rule below sets ::before to a green checkmark badge —
   we want only the inline .seu-icon badge for services. */
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list li::before {
  content: none !important;
  display: none !important;
  width: 0 !important;
  height: 0 !important;
  background: transparent !important;
  background-image: none !important;
  flex: 0 0 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}

/* Restyle benefit labels: regular gray, slightly smaller, normal-weight Poppins. */
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list .seu-text {
  color: #3D4A57 !important;
  font-family: 'Poppins', system-ui, sans-serif !important;
  font-weight: 500 !important;
  font-size: 15px !important;
  line-height: 1.45 !important;
}

/* Active panel: 1px green outline border + transparent fill, matching live's
   "card with green outline" treatment. The non-active panels are already
   neutralized by the prior svc-scroll-tabs-final rule. */
.block-content [data-block-id="svc-scroll-tabs"] .ssct-panel.is-active {
  border: 1px solid #5BA573 !important;
  border-radius: 16px !important;
  background-color: #FFFFFF !important;
  padding: 36px 40px !important;
}

/* /batch25 */`;

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  let css = post.customCss ?? '';
  const startMarker = '/* batch25 — services panel polish (no check pseudo, gray labels, green outline) */';
  const endMarker = '/* /batch25 */';
  const startIdx = css.indexOf(startMarker);
  if (startIdx >= 0) {
    const endIdx = css.indexOf(endMarker, startIdx);
    if (endIdx >= 0) {
      css = (css.slice(0, startIdx) + css.slice(endIdx + endMarker.length)).trim();
    }
  }
  css = (css ? css + '\n\n' : '') + BATCH25_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch25-services-polish applied. customCss length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
