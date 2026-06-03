/**
 * LCP fix for the home hero (post 793, block `home-hero`).
 *
 * The hero showed its photo as a CSS `background-image` on a `.cd-hero::after`
 * pseudo-element. Two problems for Core Web Vitals:
 *   1. LCP: a CSS background image is invisible to the preload scanner AND
 *      Lighthouse's Lantern lab simulation does not credit a preload for it —
 *      so the lab LCP sat at ~9-14s (load-delay 66-71%) no matter what.
 *   2. CLS: nothing reserved the hero's image box, contributing to a flaky
 *      ~1.0 layout shift of the content wrapper.
 *
 * Fix: render the photo as a real, dimensioned <img fetchpriority="high"> that
 * occupies the same box the ::after did (absolute, right 60%, object-fit:cover).
 * A real <img> is preload/priority-creditable by Lighthouse and reserves space.
 * Layout is visually identical (same position/size/crop).
 *
 * Idempotent: if the hero already has `cd-hero__bgimg`, this is a no-op.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const HERO_BLOCK_ID = 'home-hero';

const CSS_AFTER_FROM =
  `.cd-hero::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 60%; background-image: var(--cd-hero-bg); background-size: cover; background-position: center right; z-index: 1; }`;
const CSS_IMG_TO =
  `.cd-hero__bgimg { position: absolute; top: 0; right: 0; bottom: 0; width: 60%; height: 100%; object-fit: cover; object-position: center right; z-index: 1; border: 0; display: block; }`;

const MARKUP_FROM =
  `<section class="cd-hero cd-hero-clip" style="--cd-hero-bg: url('{{photoUrl}}');">\n  <div class="cd-hero__inner">`;
const MARKUP_TO =
  `<section class="cd-hero cd-hero-clip">\n  <img class="cd-hero__bgimg" src="{{photoUrl}}" alt="" fetchpriority="high" decoding="async" width="960" height="640" />\n  <div class="cd-hero__inner">`;

async function main() {
  const [row] = await db.select({ content: posts.content }).from(posts).where(eq(posts.id, POST_ID));
  if (!row) throw new Error(`post ${POST_ID} not found`);
  const data = JSON.parse(row.content);
  const hero = (data.blocks || []).find(
    (b: { id?: string; type?: string; html?: string }) => b.id === HERO_BLOCK_ID && b.type === 'html-render',
  );
  if (!hero) throw new Error(`hero block ${HERO_BLOCK_ID} not found`);

  if (hero.html.includes('cd-hero__bgimg')) {
    console.log('Already converted to <img> hero — no-op.');
    return;
  }

  let html: string = hero.html;
  for (const [from, to] of [[CSS_AFTER_FROM, CSS_IMG_TO], [MARKUP_FROM, MARKUP_TO]] as const) {
    if (!html.includes(from)) throw new Error(`expected substring not found (template changed?):\n${from.slice(0, 80)}…`);
    html = html.replace(from, to);
  }
  hero.html = html;

  await db.update(posts).set({ content: JSON.stringify(data) }).where(eq(posts.id, POST_ID));
  console.log('Hero converted to real <img fetchpriority=high>. cd-hero__bgimg present:', hero.html.includes('cd-hero__bgimg'));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
