/**
 * Batch 15 — close the cross-cutting typography + brand-color gaps
 * surfaced by the new tooling (style-diff, dom-diff, vision-review).
 *
 * Findings (top-level — applies to every section):
 *
 *   A. Body font:    live = Poppins, local = DM Sans
 *      style-diff shows `font-family: Poppins, sans-serif` on the live root
 *      everywhere; local renders `"DM Sans", system-ui, sans-serif`.
 *
 *   B. Brand color:  live = rgb(0,77,128) #004D80
 *                    local = rgb(10,58,92) #0A3A5C
 *      Affects nearly every heading + link + bordered element. Surfaces in
 *      style-diff as repeated `border-top-color` + `color` deltas because
 *      borderless elements default to currentColor.
 *
 *   D. Button typography:
 *      Hero / portals / cta CTAs differ on font-weight, letter-spacing,
 *      and case — live = 700, uppercase, letter-spacing 0.16px;
 *      local = 500-600, mixed case.
 *
 * (Top-level finding C — pill border-radius — is deferred to batch16
 * because it's a single-property change per button instance and is
 * cleaner as JSON edits than as a customCSS rule.)
 *
 * Approach:
 *   - Use customCSS (global, post-level) so we don't have to touch dozens
 *     of block instances. The render pipeline injects this CSS into the
 *     iframe and the SSR'd page, so it applies in both editor and prod.
 *   - Scope every selector under `.block-content` so it can't leak into
 *     the host portal chrome.
 *   - Override `font-family` and `color` with `!important` because most
 *     of the existing block JSON sets these inline via style attrs.
 *
 * Idempotent — strips any prior batch15 marker before re-injecting.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch15-typography-and-color.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const POPPINS_STACK = '"Poppins", system-ui, sans-serif';
const BRAND_PRIMARY = '#004D80';

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  let css = post.customCss ?? '';
  // Strip prior batch15 block to keep this idempotent.
  css = css.replace(
    /\/\* batch15-typography-and-color[\s\S]*?\/\* \/batch15-typography-and-color \*\//g,
    '',
  );

  css += `

/* batch15-typography-and-color — match live's Poppins + #004D80 brand */
.block-content,
.block-content h1,
.block-content h2,
.block-content h3,
.block-content h4,
.block-content h5,
.block-content h6,
.block-content p,
.block-content li,
.block-content a,
.block-content button,
.block-content span,
.block-content [class*="text-"],
.block-content [class*="heading-"] {
  font-family: ${POPPINS_STACK} !important;
}

/* Brand-color pass: every place style-diff flagged \`color: rgb(10, 58, 92)\`
   on local should be \`rgb(0, 77, 128)\` on live. We can't blanket-color all
   text (would tint paragraphs), so target the elements style-diff most
   often flagged: headings, eyebrows, accent links, and section roots
   that inherit currentColor. */
.block-content h1,
.block-content h2,
.block-content h3,
.block-content h4,
.block-content [data-eyebrow="true"],
.block-content .eyebrow,
.block-content [class*="eyebrow"] {
  color: ${BRAND_PRIMARY};
}

/* Button typography — live uses Poppins 700 uppercase letter-spacing 0.16px
   on the primary CTA. Apply to common CTA selectors. Doesn't touch
   regular inline links inside paragraphs. */
.block-content a[role="button"],
.block-content button.btn,
.block-content .button,
.block-content [data-block-type="button"] a,
.block-content [data-block-type="button"] button {
  font-family: ${POPPINS_STACK} !important;
  font-weight: 700 !important;
  letter-spacing: 0.16px !important;
  text-transform: uppercase !important;
}
/* /batch15-typography-and-color */`;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch15-typography-and-color applied. css length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
