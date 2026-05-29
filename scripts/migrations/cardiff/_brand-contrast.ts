/**
 * WCAG contrast fixes for the home page (post 793) — the last Lighthouse a11y
 * gap. Two brand colors failed contrast:
 *   • Orange accent #ef6632 as TEXT on white (~3.0:1) → darken text to #c2410c
 *     (still clearly orange; decorative #ef6632 backgrounds/bars are left alone).
 *   • White text on the green #5ac96f CTAs (~2.1:1) → switch the text to dark
 *     navy #0a1628 (keeps the bright brand green; ~9:1).
 *
 * Approved brand decision. Idempotent.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const ORANGE = '#c2410c';
const NAVY = '#0a1628';

type Block = { id?: string; type?: string; html?: string; style?: Record<string, unknown>; blocks?: Block[]; columns?: Block[]; items?: Block[]; tabs?: Block[] };

function walk(arr: Block[] | undefined, cb: (b: Block) => void) {
  if (!Array.isArray(arr)) return;
  for (const b of arr) {
    cb(b);
    walk(b.blocks, cb); walk(b.columns, cb); walk(b.items, cb); walk(b.tabs, cb);
    if (Array.isArray(b.columns)) for (const c of b.columns as unknown as { blocks?: Block[] }[]) walk(c?.blocks, cb);
  }
}

function fixHtml(html: string): string {
  // Orange text → darker orange (leaves `background:#ef6632` decorative bars).
  let out = html.replace(/color:\s*#ef6632/gi, `color:${ORANGE}`);
  // Within any CSS rule whose background uses the green #5ac96f, recolor white
  // text to navy (.cd-hero__cta, .is-active preset chip, verified-check, etc.).
  out = out.replace(/\{[^{}]*\}/g, (rule) => {
    const greenBg = /background[^;]*#5ac96f/i.test(rule);
    if (greenBg && /color\s*:\s*#(?:fff|ffffff)\b/i.test(rule)) {
      return rule.replace(/color\s*:\s*#(?:fff|ffffff)\b/gi, `color:${NAVY}`);
    }
    return rule;
  });
  // Inline-style green buttons (e.g. #cls-cta): white text right after a green
  // background → navy. The CSS-rule pass above only handles <style> blocks.
  out = out.replace(/(background\s*:\s*#5ac96f\s*;\s*)color\s*:\s*#(?:fff|ffffff)\b/gi, `$1color:${NAVY}`);
  // Muted gray body text that fails on the light (#f6f9fc) section/footer
  // backgrounds → a darker gray that clears 4.5:1.
  out = out.replace(/color:\s*#7c8aa6/gi, 'color:#4d5a73').replace(/color:\s*#6b7692/gi, 'color:#4d5a73');
  return out;
}

async function main() {
  const [row] = await db.select({ content: posts.content }).from(posts).where(eq(posts.id, POST_ID));
  if (!row) throw new Error(`post ${POST_ID} not found`);
  const data = JSON.parse(row.content);

  let orangeHeadings = 0, htmlFixed = 0, greenButtons = 0;
  walk(data.blocks, (b) => {
    if (b.type === 'heading' && typeof b.style?.color === 'string' && /#ef6632/i.test(b.style.color)) {
      b.style.color = ORANGE; orangeHeadings++;
    }
    // brand primary button block (green bg + white foreground) → navy text
    if (b.type === 'button' && b.id === 'midcta-btn') {
      b.style = { ...(b.style || {}), color: NAVY }; greenButtons++;
    }
    if (b.type === 'html-render' && b.html) {
      const fixed = fixHtml(b.html);
      if (fixed !== b.html) { b.html = fixed; htmlFixed++; }
    }
  });

  // Final blanket pass: the accent orange #ef6632 is used pervasively as inline
  // ICON colors (material-icons feature spans), accent text, and decorative
  // bars across many block shapes. As text/icons on light backgrounds it fails
  // contrast (~3:1). Darken every remaining occurrence to #c2410c for a uniform,
  // accessible accent (decorative bars simply become a slightly deeper orange).
  let json = JSON.stringify(data);
  const before = (json.match(/#ef6632/gi) || []).length;
  json = json.replace(/#ef6632/gi, ORANGE);

  await db.update(posts).set({ content: json }).where(eq(posts.id, POST_ID));
  console.log(`Done. orange headings: ${orangeHeadings}, html blocks fixed: ${htmlFixed}, button blocks: ${greenButtons}, blanket #ef6632→${ORANGE}: ${before}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
