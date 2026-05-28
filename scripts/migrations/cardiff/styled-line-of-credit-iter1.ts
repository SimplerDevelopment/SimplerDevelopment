/**
 * styled-line-of-credit-iter1
 *
 * Post 823 (slug: line-of-credit) — cardiff-main (siteId 405) port of
 * https://cardiff.co/business-line-of-credit/.
 *
 * Biggest visual gap on the current port: the HERO.
 *
 * The port currently renders a flat blue rectangle with a centered
 * "What is a Line of Credit?" headline and two buttons. The original
 * cardiff.co page leads with:
 *   1. A two-column hero — huge left-aligned "BORROW BETTER" headline +
 *      a thin "How Much Cash Do You Need?" inline form (input + green
 *      "Check Eligibility" CTA) — and a full-bleed customer photo
 *      bleeding from the right edge.
 *   2. Immediately below: a 3-up metric tile band ($12 Billion+ Funded,
 *      5 Minute Approvals, Same Day Funds) overlapping the hero's
 *      bottom edge on a white card.
 *
 * This iter replaces block[0] (the existing `section` hero) with an
 * html-render hero that mirrors the cardiff.co layout exactly: split
 * grid, headline + inline form on the left, image-bleed on the right,
 * and a 3-up metric tile band stacked at the bottom inside the same
 * block so it visually overlaps the hero / next section seam.
 *
 * Renderer quirks respected:
 *   - The metric tiles are hard-coded siblings inside ONE grid container
 *     (no `data-repeat` on the grid wrapper — that would force the whole
 *     grid into a 1-col stack).
 *   - Uses Material Icons (`paid`, `bolt`, `event_available`) — no emojis.
 *   - Brand palette only: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798.
 *
 * Idempotent: detects an existing html-render block at id
 *   `hero-line-of-credit-v2` and rewrites it in place; otherwise replaces
 *   block[0] (which must be type=section, id=hero-line-of-credit). Safe
 *   to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 823;
const OLD_HERO_ID = 'hero-line-of-credit';
const NEW_HERO_ID = 'hero-line-of-credit-v2';

const HERO_HTML = `
<style>
  .cd-loc-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 0; isolation: isolate; }
  .cd-loc-hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(95deg, rgba(28,51,112,0.97) 0%, rgba(28,51,112,0.92) 38%, rgba(37,65,139,0.55) 65%, rgba(37,65,139,0.15) 85%, rgba(37,65,139,0.02) 100%); z-index: 2; pointer-events: none; }
  .cd-loc-hero::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 58%; background-image: var(--cd-loc-hero-bg); background-size: cover; background-position: center right; z-index: 1; }
  .cd-loc-hero__inner { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; padding: 88px 24px 140px 24px; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); gap: 48px; align-items: center; min-height: 480px; }
  .cd-loc-hero__copy { max-width: 580px; }
  .cd-loc-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 4.75rem; font-weight: 800; letter-spacing: -0.02em; line-height: 0.98; color: #fff; text-transform: uppercase; margin: 0 0 22px 0; text-shadow: 0 2px 24px rgba(0,0,0,0.42); }
  .cd-loc-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.6; color: rgba(255,255,255,0.92); margin: 0 0 30px 0; max-width: 500px; }
  .cd-loc-hero__form-label { display: block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 600; color: #fff; margin: 0 0 10px 0; }
  .cd-loc-hero__form { display: flex; flex-wrap: wrap; gap: 12px; align-items: stretch; max-width: 520px; }
  .cd-loc-hero__input { flex: 1 1 240px; min-width: 0; background: #fff; color: #1c3370; border: 0; border-radius: 4px; padding: 14px 18px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; outline: none; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
  .cd-loc-hero__input::placeholder { color: #a0aabd; }
  .cd-loc-hero__cta { display: inline-flex; align-items: center; gap: 8px; background: #5ac96f; color: #fff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 14px 28px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 32px rgba(90,201,111,0.4); transition: transform .2s ease, box-shadow .2s ease; white-space: nowrap; }
  .cd-loc-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 38px rgba(90,201,111,0.52); }
  .cd-loc-hero__cta .material-icons { font-size: 18px; }

  .cd-loc-hero__photo { position: relative; z-index: 3; align-self: stretch; }

  .cd-loc-stats { position: relative; z-index: 5; margin: -90px auto 0 auto; max-width: 1140px; padding: 0 24px 64px 24px; }
  .cd-loc-stats__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
  .cd-loc-stats__tile { background: #fff; border-radius: 10px; padding: 28px 28px 26px 28px; box-shadow: 0 22px 48px rgba(28,51,112,0.14), 0 4px 12px rgba(28,51,112,0.06); display: grid; grid-template-columns: 64px 1fr; gap: 18px; align-items: start; border: 1px solid rgba(28,51,112,0.05); }
  .cd-loc-stats__icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.28); }
  .cd-loc-stats__tile:nth-child(2) .cd-loc-stats__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.32); }
  .cd-loc-stats__tile:nth-child(3) .cd-loc-stats__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.28); }
  .cd-loc-stats__icon .material-icons { font-size: 30px; }
  .cd-loc-stats__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.4rem; font-weight: 800; color: #1c3370; margin: 0 0 6px 0; letter-spacing: -0.01em; line-height: 1.1; }
  .cd-loc-stats__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.925rem; line-height: 1.55; color: #5a6a86; margin: 0; }

  @media (max-width: 980px) {
    .cd-loc-hero__inner { grid-template-columns: 1fr; gap: 24px; padding: 56px 20px 132px 20px; min-height: auto; text-align: left; }
    .cd-loc-hero::after { width: 100%; opacity: 0.28; }
    .cd-loc-hero__copy { max-width: none; }
    .cd-loc-hero__title { font-size: 3rem; }
    .cd-loc-hero__photo { display: none; }
    .cd-loc-stats__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-loc-stats { margin-top: -100px; }
  }
  @media (max-width: 560px) {
    .cd-loc-hero__title { font-size: 2.4rem; }
    .cd-loc-stats__tile { grid-template-columns: 52px 1fr; padding: 22px 22px 20px 22px; gap: 14px; }
    .cd-loc-stats__icon { width: 52px; height: 52px; }
    .cd-loc-stats__icon .material-icons { font-size: 26px; }
    .cd-loc-stats__title { font-size: 1.2rem; }
  }
</style>
<section class="cd-loc-hero" style="--cd-loc-hero-bg: url('{{photoUrl}}');">
  <div class="cd-loc-hero__inner">
    <div class="cd-loc-hero__copy">
      <h1 class="cd-loc-hero__title" data-field="title">{{title}}</h1>
      <p class="cd-loc-hero__desc" data-field="description">{{description}}</p>
      <label class="cd-loc-hero__form-label" data-field="formLabel">{{formLabel}}</label>
      <form class="cd-loc-hero__form" action="{{ctaUrl}}" method="get" onsubmit="event.preventDefault(); window.location.href='{{ctaUrl}}';">
        <input class="cd-loc-hero__input" type="text" inputmode="numeric" placeholder="$" aria-label="How much cash do you need?" />
        <a class="cd-loc-hero__cta" href="{{ctaUrl}}" data-field="ctaText"><span class="material-icons">check_circle</span>{{ctaText}}</a>
      </form>
    </div>
    <div class="cd-loc-hero__photo" aria-hidden="true"></div>
  </div>
  <div class="cd-loc-stats">
    <div class="cd-loc-stats__grid">
      <div class="cd-loc-stats__tile">
        <div class="cd-loc-stats__icon"><span class="material-icons" data-field="stat1Icon">{{stat1Icon}}</span></div>
        <div>
          <h3 class="cd-loc-stats__title" data-field="stat1Title">{{stat1Title}}</h3>
          <p class="cd-loc-stats__desc" data-field="stat1Desc">{{stat1Desc}}</p>
        </div>
      </div>
      <div class="cd-loc-stats__tile">
        <div class="cd-loc-stats__icon"><span class="material-icons" data-field="stat2Icon">{{stat2Icon}}</span></div>
        <div>
          <h3 class="cd-loc-stats__title" data-field="stat2Title">{{stat2Title}}</h3>
          <p class="cd-loc-stats__desc" data-field="stat2Desc">{{stat2Desc}}</p>
        </div>
      </div>
      <div class="cd-loc-stats__tile">
        <div class="cd-loc-stats__icon"><span class="material-icons" data-field="stat3Icon">{{stat3Icon}}</span></div>
        <div>
          <h3 class="cd-loc-stats__title" data-field="stat3Title">{{stat3Title}}</h3>
          <p class="cd-loc-stats__desc" data-field="stat3Desc">{{stat3Desc}}</p>
        </div>
      </div>
    </div>
  </div>
</section>
`.trim();

const HERO_DEFAULTS = {
  title: 'Borrow Better',
  description:
    "You wouldn't wait ten minutes for a latte, so why wait longer for business financing? Get a Cardiff business line of credit and access flexible capital when you need it.",
  formLabel: 'How Much Cash Do You Need?',
  ctaText: 'Check Eligibility',
  ctaUrl: 'https://cardiff.co/business/apply',
  photoUrl: 'https://cardiff.b-cdn.net/img/home-header-full.png',
  stat1Icon: 'paid',
  stat1Title: '$12 Billion+ Funded',
  stat1Desc: 'Over 21 years, we have funded over $12 billion for small businesses.',
  stat2Icon: 'bolt',
  stat2Title: '5 Minute Approvals',
  stat2Desc: 'Know how much funding you can get within 5 minutes of applying.',
  stat3Icon: 'event_available',
  stat3Title: 'Same Day Funds',
  stat3Desc: 'With our online process, we can provide funds within 24 hours of approval.',
};

const newHeroBlock = {
  id: NEW_HERO_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'title', label: 'Headline', type: 'text', default: HERO_DEFAULTS.title },
    { name: 'description', label: 'Description', type: 'textarea', default: HERO_DEFAULTS.description },
    { name: 'formLabel', label: 'Inline form label', type: 'text', default: HERO_DEFAULTS.formLabel },
    { name: 'ctaText', label: 'CTA text', type: 'text', default: HERO_DEFAULTS.ctaText },
    { name: 'ctaUrl', label: 'CTA url', type: 'url', default: HERO_DEFAULTS.ctaUrl },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: HERO_DEFAULTS.photoUrl },
    { name: 'stat1Icon', label: 'Stat 1 icon (Material)', type: 'text', default: HERO_DEFAULTS.stat1Icon },
    { name: 'stat1Title', label: 'Stat 1 title', type: 'text', default: HERO_DEFAULTS.stat1Title },
    { name: 'stat1Desc', label: 'Stat 1 description', type: 'textarea', default: HERO_DEFAULTS.stat1Desc },
    { name: 'stat2Icon', label: 'Stat 2 icon (Material)', type: 'text', default: HERO_DEFAULTS.stat2Icon },
    { name: 'stat2Title', label: 'Stat 2 title', type: 'text', default: HERO_DEFAULTS.stat2Title },
    { name: 'stat2Desc', label: 'Stat 2 description', type: 'textarea', default: HERO_DEFAULTS.stat2Desc },
    { name: 'stat3Icon', label: 'Stat 3 icon (Material)', type: 'text', default: HERO_DEFAULTS.stat3Icon },
    { name: 'stat3Title', label: 'Stat 3 title', type: 'text', default: HERO_DEFAULTS.stat3Title },
    { name: 'stat3Desc', label: 'Stat 3 description', type: 'textarea', default: HERO_DEFAULTS.stat3Desc },
  ],
  values: { ...HERO_DEFAULTS },
  order: 1,
};

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

  // Idempotent rewrite: if the new hero already exists, replace it in place.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === NEW_HERO_ID);
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = { ...newHeroBlock, order: parsed.blocks[existingIdx].order ?? 1 };
    console.log(`Rewrote existing html-render hero at index ${existingIdx}`);
  } else {
    const oldHero = parsed.blocks[0];
    if (oldHero?.id !== OLD_HERO_ID) {
      console.error(
        `Post ${POST_ID}: block[0].id is "${oldHero?.id}" (expected "${OLD_HERO_ID}"); aborting to avoid clobbering`,
      );
      process.exit(1);
    }
    parsed.blocks[0] = newHeroBlock;
    console.log(`Replaced legacy section hero (id="${OLD_HERO_ID}") with html-render hero (id="${NEW_HERO_ID}")`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(`Updated post ${POST_ID}. Block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
