/**
 * Replace Dean Lyulkin team-bio page (post 832) with a 2-col html-render
 * layout — portrait left, name/title/bio right — matching cardiff.co's
 * about-cardiff team card design. Owner: 2-col layout cannot be expressed
 * cleanly by the stock heading/text/section blocks (the port currently
 * renders a centered hero on top of a centered single-column paragraph).
 *
 * Idempotent: re-running replaces the same html-render block in place.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 832;
const BLOCK_ID = 'team-dean-bio-2col';

const HTML = `
<style>
  .cd-bio { background: #f6f9fc; padding: 88px 24px 96px 24px; }
  .cd-bio__inner { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: 360px 1fr; gap: 64px; align-items: start; }
  .cd-bio__photo-wrap { position: relative; }
  .cd-bio__photo { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 8px; box-shadow: 0 24px 56px rgba(28,51,112,0.18); display: block; background: #25418b; }
  .cd-bio__accent { position: absolute; top: 16px; left: -16px; width: 84px; height: 84px; background: #5ac96f; border-radius: 6px; z-index: -1; }
  .cd-bio__copy { padding-top: 8px; }
  .cd-bio__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ef6632; font-weight: 700; margin: 0 0 14px 0; }
  .cd-bio__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; color: #1c3370; margin: 0 0 8px 0; }
  .cd-bio__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 600; color: #25418b; letter-spacing: 0.02em; margin: 0 0 28px 0; }
  .cd-bio__rule { width: 56px; height: 4px; background: #5ac96f; border: 0; margin: 0 0 28px 0; }
  .cd-bio__para { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.78; color: #3c4858; margin: 0 0 20px 0; }
  .cd-bio__para:last-child { margin-bottom: 0; }
  .cd-bio__ctas { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 36px; }
  .cd-bio__cta { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 16px 32px; border-radius: 4px; text-decoration: none; transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .cd-bio__cta--primary { background: #ef6632; color: #ffffff; box-shadow: 0 14px 30px rgba(239,102,50,0.34); }
  .cd-bio__cta--primary:hover { transform: translateY(-1px); box-shadow: 0 18px 36px rgba(239,102,50,0.42); }
  .cd-bio__cta--ghost { background: transparent; color: #1c3370; border: 1.5px solid #1c3370; padding: 14.5px 30px; }
  .cd-bio__cta--ghost:hover { background: #1c3370; color: #ffffff; }
  @media (max-width: 880px) {
    .cd-bio { padding: 56px 20px 72px 20px; }
    .cd-bio__inner { grid-template-columns: 1fr; gap: 32px; }
    .cd-bio__photo-wrap { max-width: 320px; margin: 0 auto; width: 100%; }
    .cd-bio__name { font-size: 2.25rem; }
    .cd-bio__ctas { justify-content: flex-start; }
  }
</style>
<section class="cd-bio">
  <div class="cd-bio__inner">
    <div class="cd-bio__photo-wrap">
      <div class="cd-bio__accent" aria-hidden="true"></div>
      <img class="cd-bio__photo" src="{{photoUrl}}" alt="{{name}}" data-field="photoUrl" />
    </div>
    <div class="cd-bio__copy">
      <p class="cd-bio__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h1 class="cd-bio__name" data-field="name">{{name}}</h1>
      <p class="cd-bio__title" data-field="role">{{role}}</p>
      <hr class="cd-bio__rule" />
      <div data-repeat="paragraphs">
        <p class="cd-bio__para" data-field="text">{{paragraphs.text}}</p>
      </div>
      <div class="cd-bio__ctas">
        <a class="cd-bio__cta cd-bio__cta--primary" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
        <a class="cd-bio__cta cd-bio__cta--ghost" href="{{secondaryCtaUrl}}" data-field="secondaryCtaText">{{secondaryCtaText}}</a>
      </div>
    </div>
  </div>
</section>
`.trim();

const newBlock = {
  id: BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'Leadership' },
    { name: 'name', label: 'Name', type: 'text', default: 'Dean Lyulkin' },
    { name: 'role', label: 'Role', type: 'text', default: 'CEO, Cardiff' },
    { name: 'photoUrl', label: 'Portrait', type: 'image', default: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/dean-lyulkin-cardiff-ceo-and-founder.jpg' },
    {
      name: 'paragraphs',
      label: 'Bio paragraphs',
      type: 'repeater',
      fields: [{ name: 'text', label: 'Paragraph', type: 'textarea' }],
    },
    { name: 'ctaText', label: 'Primary CTA', type: 'text', default: 'Apply Now' },
    { name: 'ctaUrl', label: 'Primary CTA URL', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'secondaryCtaText', label: 'Secondary CTA', type: 'text', default: 'Talk to a Specialist' },
    { name: 'secondaryCtaUrl', label: 'Secondary CTA URL', type: 'url', default: '/contact-us' },
  ],
  values: {
    eyebrow: 'Leadership',
    name: 'Dean Lyulkin',
    role: 'CEO, Cardiff',
    photoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/dean-lyulkin-cardiff-ceo-and-founder.jpg',
    paragraphs: [
      { text: 'Dean Lyulkin is the CEO of Cardiff. He is a respected private credit expert and financial markets thought leader. Dean successfully transformed the firm from a finance broker into a balance sheet funder while engineering its unique culture of conscious leadership.' },
      { text: "He manages the firm's key relationships with investors and capital sources. Previously, Dean was an executive at Fisher Investments, the nation's largest independent RIA." },
    ],
    ctaText: 'Apply Now',
    ctaUrl: 'https://cardiff.co/business/apply',
    secondaryCtaText: 'Talk to a Specialist',
    secondaryCtaUrl: '/contact-us',
  },
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

  // Idempotent: if our block exists, replace it in place; otherwise replace
  // the original hero+sec-1 pair (blocks[0] + blocks[1]) keeping the final CTA.
  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === BLOCK_ID);
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = newBlock;
    console.log(`Replaced existing block "${BLOCK_ID}" at index ${existingIdx}`);
  } else {
    const hero = parsed.blocks[0];
    const sec1 = parsed.blocks[1];
    if (hero?.type !== 'section' || sec1?.type !== 'section') {
      console.error(`Aborting: expected blocks[0]+blocks[1] to be sections (got ${hero?.type}+${sec1?.type})`);
      process.exit(1);
    }
    parsed.blocks.splice(0, 2, newBlock);
    console.log(`Replaced original hero+sec-1 with "${BLOCK_ID}"`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}. New block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
