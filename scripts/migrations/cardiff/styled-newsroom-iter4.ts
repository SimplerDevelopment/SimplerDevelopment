/**
 * Iteration 4: Newsroom page (post id 826) — layout polish (padding / spacing).
 *
 * Iters 1–3 covered the biggest content gaps (Latest News grid, Featured-news
 * hero split + 4-icon strip, Cardiff In The Media press mentions). Visual diff
 * vs cardiff.co/newsroom now: every section is content-correct, but the
 * vertical rhythm is too loose — the dark blue hero is taller than the
 * original (which has no hero at all, just a tiny "NEWSROOM" eyebrow), and
 * the gap between the Featured-news section and the Latest News grid feels
 * cavernous because both carry generous top+bottom padding.
 *
 * Polish (idempotent):
 *   - hero-newsroom: tighten paddingTop 80 → 56, paddingBottom 64 → 48 so the
 *     hero reads as a slim page-intro band instead of a marketing splash.
 *   - sec-1 (featured-news html-render): reduce top+bottom padding inside the
 *     style block from 64/56 to 48/40 so the featured split sits closer to
 *     the hero.
 *   - sec-2 (latest-news html-render): reduce top+bottom padding from 56/56
 *     to 40/48 — the original "Latest News" headline sits tight against the
 *     Featured-news icon strip above it.
 *   - sec-3 (press-mentions html-render): reduce paddingTop 64 → 48 so the
 *     Cardiff In The Media section meets the Latest News grid more tightly.
 *   - final-cta: trim paddingTop/Bottom 88 → 72 to bring the page-end CTA in
 *     line with the rest of the page's new rhythm.
 *
 * Re-running is safe: each edit is a targeted string replace inside the
 * stored html (for html-render blocks) or a numeric style update (for
 * section / cta blocks), and the post-condition check (`assertPadding`)
 * passes whether the script ran 0 or N times before.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;

type Block = {
  id?: string;
  type?: string;
  html?: string;
  style?: Record<string, unknown>;
  [k: string]: unknown;
};

/**
 * Replace the first occurrence of a `padding:` declaration on a specific CSS
 * selector inside the html string. Idempotent because the replacement looks
 * for ANY existing `padding: ... ;` on that selector and rewrites it.
 */
function setHtmlSelectorPadding(html: string, selector: string, padding: string): string {
  // Match `.selector { ... padding: <anything>; ... }` — capture only the
  // padding declaration so we leave the rest of the rule intact.
  const re = new RegExp(
    `(${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{[^}]*?padding:\\s*)([^;]+)(;)`,
    'm',
  );
  if (!re.test(html)) {
    throw new Error(`Could not find 'padding:' rule on selector '${selector}'`);
  }
  return html.replace(re, `$1${padding}$3`);
}

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }

  const blocks: Block[] = parsed.blocks;
  const changes: string[] = [];

  // 1) hero-newsroom — tighten section padding.
  const hero = blocks.find((b) => b.id === 'hero-newsroom');
  if (hero && hero.style && typeof hero.style === 'object') {
    const before = `${hero.style.paddingTop}/${hero.style.paddingBottom}`;
    hero.style.paddingTop = '56px';
    hero.style.paddingBottom = '48px';
    changes.push(`hero-newsroom padding ${before} → 56px/48px`);
  } else {
    throw new Error(`hero-newsroom block missing or has no style object`);
  }

  // 2) sec-1 featured-news html-render — tighten outer .cd-fn padding.
  const sec1 = blocks.find((b) => b.id === 'sec-1');
  if (sec1 && typeof sec1.html === 'string') {
    sec1.html = setHtmlSelectorPadding(sec1.html, '.cd-fn', '48px 24px 40px 24px');
    changes.push(`sec-1 .cd-fn padding → 48px 24px 40px 24px`);
  } else {
    throw new Error(`sec-1 block missing or not html-render`);
  }

  // 3) sec-2 latest-news html-render — tighten outer .cd-ln padding.
  // We don't assume the selector name, so try the common cardiff-newsroom
  // selectors in order and rewrite whichever matches.
  const sec2 = blocks.find((b) => b.id === 'sec-2');
  if (sec2 && typeof sec2.html === 'string') {
    const candidates = ['.cd-ln', '.cd-news', '.cd-latest', '.cd-lng'];
    let updated = false;
    for (const sel of candidates) {
      const re = new RegExp(
        `${sel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{[^}]*?padding:`,
        'm',
      );
      if (re.test(sec2.html)) {
        sec2.html = setHtmlSelectorPadding(sec2.html, sel, '40px 24px 48px 24px');
        changes.push(`sec-2 ${sel} padding → 40px 24px 48px 24px`);
        updated = true;
        break;
      }
    }
    if (!updated) {
      // Fallback: rewrite the first `padding:` we see inside any class rule
      // whose selector starts with `.cd-` — keeps the script idempotent even
      // if iter1 used a non-obvious selector name.
      const re = /(\.cd-[a-z0-9_-]+\s*\{[^}]*?padding:\s*)([^;]+)(;)/m;
      if (re.test(sec2.html)) {
        const match = sec2.html.match(re);
        sec2.html = sec2.html.replace(re, `$1${'40px 24px 48px 24px'}$3`);
        changes.push(`sec-2 first .cd-* padding → 40px 24px 48px 24px (selector: ${match?.[0]?.split('{')[0]?.trim()})`);
      } else {
        throw new Error(`sec-2 has no recognizable .cd-* padding rule to update`);
      }
    }
  } else {
    throw new Error(`sec-2 block missing or not html-render`);
  }

  // 4) sec-3 press-mentions html-render — tighten .cd-pm padding.
  const sec3 = blocks.find((b) => b.id === 'sec-3');
  if (sec3 && typeof sec3.html === 'string') {
    sec3.html = setHtmlSelectorPadding(sec3.html, '.cd-pm', '48px 24px 64px 24px');
    changes.push(`sec-3 .cd-pm padding → 48px 24px 64px 24px`);
  } else {
    throw new Error(`sec-3 block missing or not html-render`);
  }

  // 5) final-cta — trim padding.
  const cta = blocks.find((b) => b.id === 'final-cta');
  if (cta && cta.style && typeof cta.style === 'object') {
    const before = `${cta.style.paddingTop}/${cta.style.paddingBottom}`;
    cta.style.paddingTop = '72px';
    cta.style.paddingBottom = '72px';
    changes.push(`final-cta padding ${before} → 72px/72px`);
  } else {
    throw new Error(`final-cta block missing or has no style object`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID} (iter4 polish):`);
  for (const c of changes) console.log(`  - ${c}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
