/**
 * Legal Notices (post id 822) — iteration 1.
 *
 * Biggest visual gap vs cardiff.co/legal-notices/: the original hero is a
 * TALL (~450px), light slate→periwinkle gradient band with ONLY a
 * left-aligned "Legal Notices" h1 in white — no subtitle, no CTAs — followed
 * by a narrow deep-blue breadcrumb bar ("Home / Legal Notices"). The port
 * currently shows a short dark-blue centered hero with a subtitle AND two
 * CTAs ("Apply Now" / "Talk to a Specialist"), which is wrong tone for a
 * legal page and the wrong shape/color.
 *
 * Fix: replace the `hero-legal-notices` section block (index 0) with a
 * single html-render block that renders both pieces — the tall light
 * gradient band + the deep-blue breadcrumb strip — in brand-true Cardiff
 * style. Mirrors `styled-privacy-policy-iter1.ts`.
 *
 * Idempotent: re-runs replace block by id (`hero-legal-notices`).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 822;
  const BLOCK_ID = 'hero-legal-notices';

  const HERO_HTML = `
<style>
  .cd-legal-hero { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-legal-hero__band {
    background: linear-gradient(180deg, #8493b8 0%, #a8b5d3 55%, #b9c4dd 100%);
    padding: 130px 24px 150px 24px;
    position: relative;
  }
  .cd-legal-hero__band::after {
    content: '';
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 60px;
    background: linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(185,196,221,0.4) 100%);
    pointer-events: none;
  }
  .cd-legal-hero__inner {
    max-width: 1180px;
    margin: 0 auto;
    padding-left: 64px;
  }
  .cd-legal-hero__title {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 2.75rem;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: -0.01em;
    margin: 0;
    line-height: 1.15;
    text-shadow: 0 2px 18px rgba(28,51,112,0.22);
  }
  .cd-legal-hero__crumbs {
    background: #25418b;
    padding: 18px 24px;
    text-align: center;
  }
  .cd-legal-hero__crumbs-inner {
    max-width: 1180px;
    margin: 0 auto;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.95rem;
    color: #ffffff;
  }
  .cd-legal-hero__crumbs a {
    color: #b9c4dd;
    text-decoration: none;
    transition: color 0.18s ease;
  }
  .cd-legal-hero__crumbs a:hover { color: #ffffff; }
  .cd-legal-hero__crumbs-sep { margin: 0 8px; color: rgba(255,255,255,0.55); }
  @media (max-width: 760px) {
    .cd-legal-hero__band { padding: 80px 20px 90px 20px; }
    .cd-legal-hero__inner { padding-left: 0; text-align: center; }
    .cd-legal-hero__title { font-size: 2rem; }
  }
</style>
<section class="cd-legal-hero">
  <div class="cd-legal-hero__band">
    <div class="cd-legal-hero__inner">
      <h1 class="cd-legal-hero__title" data-field="title">{{title}}</h1>
    </div>
  </div>
  <nav class="cd-legal-hero__crumbs" aria-label="breadcrumb">
    <div class="cd-legal-hero__crumbs-inner">
      <a href="{{homeUrl}}" data-field="homeLabel">{{homeLabel}}</a>
      <span class="cd-legal-hero__crumbs-sep">/</span>
      <span data-field="currentLabel">{{currentLabel}}</span>
    </div>
  </nav>
</section>
`.trim();

  const heroBlock = {
    id: BLOCK_ID,
    type: 'html-render' as const,
    order: 1,
    width: 'full' as const,
    html: HERO_HTML,
    fields: [
      { name: 'title', label: 'Page title', type: 'text' as const, default: 'Legal Notices' },
      { name: 'homeLabel', label: 'Home crumb label', type: 'text' as const, default: 'Home' },
      { name: 'homeUrl', label: 'Home URL', type: 'url' as const, default: '/' },
      {
        name: 'currentLabel',
        label: 'Current page crumb',
        type: 'text' as const,
        default: 'Legal Notices',
      },
    ],
    values: {
      title: 'Legal Notices',
      homeLabel: 'Home',
      homeUrl: '/',
      currentLabel: 'Legal Notices',
    },
  };

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
  const heroIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === BLOCK_ID);
  if (heroIdx < 0) {
    console.error(`Post ${POST_ID}: no '${BLOCK_ID}' block found; aborting`);
    process.exit(1);
  }
  const wasType = parsed.blocks[heroIdx]?.type;
  parsed.blocks[heroIdx] = heroBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced '${BLOCK_ID}' (was type=${wasType}) at idx ${heroIdx} with html-render. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
