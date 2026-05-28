/**
 * Team Bio — Mo Irani Tehrani (post 833): replace the placeholder sec-1
 * "Managing Partner" text section with a proper 2-column html-render
 * bio layout (headshot left, name + role + bio + CTAs right) on the
 * existing soft-blue surface. Brand-aligned: deep blue accents, orange
 * underline accent, Raleway headings + Open Sans body.
 *
 * Idempotent — re-running matches the html-render block by id
 * "team-mo-bio-card" and replaces it in place.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 833;
const NEW_BLOCK_ID = 'team-mo-bio-card';

const BIO_HTML = `
<style>
  .cd-bio { max-width: 1080px; margin: 0 auto; }
  .cd-bio__grid { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 56px; align-items: start; }
  .cd-bio__photo-wrap { position: relative; }
  .cd-bio__photo { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 6px; box-shadow: 0 24px 60px rgba(28,51,112,0.18); display: block; background: #1c3370; }
  .cd-bio__photo-accent { position: absolute; left: -14px; bottom: -14px; width: 110px; height: 6px; background: #ef6632; border-radius: 2px; }
  .cd-bio__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.32em; text-transform: uppercase; color: #ef6632; margin: 0 0 14px 0; }
  .cd-bio__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.75rem; font-weight: 800; color: #1c3370; line-height: 1.05; letter-spacing: -0.01em; margin: 0 0 8px 0; }
  .cd-bio__role { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; color: #25418b; font-weight: 600; margin: 0 0 24px 0; }
  .cd-bio__divider { width: 64px; height: 3px; background: #5ac96f; border: 0; margin: 0 0 24px 0; }
  .cd-bio__paragraphs { display: flex; flex-direction: column; gap: 18px; }
  .cd-bio__paragraphs p { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; color: #3c4858; margin: 0; }
  .cd-bio__meta { margin: 32px 0 24px 0; display: flex; flex-wrap: wrap; gap: 28px; padding: 20px 24px; background: #ffffff; border-radius: 6px; border-left: 4px solid #1c3370; box-shadow: 0 6px 18px rgba(28,51,112,0.06); }
  .cd-bio__meta-item { display: flex; flex-direction: column; gap: 4px; }
  .cd-bio__meta-label { font-family: 'Raleway', sans-serif; font-size: 0.68rem; letter-spacing: 0.22em; text-transform: uppercase; color: #ef6632; font-weight: 700; }
  .cd-bio__meta-value { font-family: 'Open Sans', sans-serif; font-size: 0.95rem; color: #1c3370; font-weight: 600; }
  .cd-bio__ctas { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; }
  .cd-bio__cta { display: inline-block; background: #5ac96f; color: #fff; font-family: 'Raleway', sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 15px 30px; border-radius: 4px; text-decoration: none; box-shadow: 0 12px 30px rgba(90,201,111,0.35); transition: transform .2s ease, box-shadow .2s ease; }
  .cd-bio__cta:hover { transform: translateY(-1px); box-shadow: 0 16px 36px rgba(90,201,111,0.45); }
  .cd-bio__cta--ghost { background: transparent; color: #1c3370; border: 1.5px solid rgba(28,51,112,0.35); box-shadow: none; padding: 13.5px 28px; }
  .cd-bio__cta--ghost:hover { background: rgba(28,51,112,0.06); box-shadow: none; }
  @media (max-width: 900px) {
    .cd-bio__grid { grid-template-columns: 1fr; gap: 32px; }
    .cd-bio__photo-wrap { max-width: 320px; margin: 0 auto; }
    .cd-bio__name { font-size: 2.1rem; }
  }
</style>
<div class="cd-bio">
  <div class="cd-bio__grid">
    <div class="cd-bio__photo-wrap">
      <img class="cd-bio__photo" src="{{photoUrl}}" alt="{{name}}" data-field="photoUrl" />
      <span class="cd-bio__photo-accent" aria-hidden="true"></span>
    </div>
    <div class="cd-bio__copy">
      <p class="cd-bio__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h2 class="cd-bio__name" data-field="name">{{name}}</h2>
      <p class="cd-bio__role" data-field="role">{{role}}</p>
      <hr class="cd-bio__divider" />
      <div class="cd-bio__paragraphs" data-repeat="paragraphs">
        <p data-field="text">{{paragraphs.text}}</p>
      </div>
      <div class="cd-bio__meta">
        <div class="cd-bio__meta-item">
          <span class="cd-bio__meta-label">Focus</span>
          <span class="cd-bio__meta-value" data-field="focus">{{focus}}</span>
        </div>
        <div class="cd-bio__meta-item">
          <span class="cd-bio__meta-label">Based In</span>
          <span class="cd-bio__meta-value" data-field="location">{{location}}</span>
        </div>
        <div class="cd-bio__meta-item">
          <span class="cd-bio__meta-label">With Cardiff</span>
          <span class="cd-bio__meta-value" data-field="tenure">{{tenure}}</span>
        </div>
      </div>
      <div class="cd-bio__ctas">
        <a class="cd-bio__cta" href="{{primaryCtaUrl}}" data-field="primaryCtaText">{{primaryCtaText}}</a>
        <a class="cd-bio__cta cd-bio__cta--ghost" href="{{secondaryCtaUrl}}" data-field="secondaryCtaText">{{secondaryCtaText}}</a>
      </div>
    </div>
  </div>
</div>
`.trim();

const bioBlock = {
  id: NEW_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: BIO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'Leadership' },
    { name: 'name', label: 'Name', type: 'text', default: 'Mo Irani Tehrani' },
    { name: 'role', label: 'Role', type: 'text', default: 'Managing Partner' },
    { name: 'photoUrl', label: 'Headshot', type: 'image', default: 'https://cardiff.b-cdn.net/img/testimonials/EricGoldberg.png' },
    {
      name: 'paragraphs',
      label: 'Bio paragraphs',
      type: 'repeater',
      fields: [{ name: 'text', label: 'Paragraph', type: 'textarea' }],
    },
    { name: 'focus', label: 'Focus', type: 'text', default: 'Small Business Lending' },
    { name: 'location', label: 'Based In', type: 'text', default: 'San Diego, CA' },
    { name: 'tenure', label: 'With Cardiff', type: 'text', default: '15+ Years' },
    { name: 'primaryCtaText', label: 'Primary CTA text', type: 'text', default: 'Apply Now' },
    { name: 'primaryCtaUrl', label: 'Primary CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'secondaryCtaText', label: 'Secondary CTA text', type: 'text', default: 'Talk to a Specialist' },
    { name: 'secondaryCtaUrl', label: 'Secondary CTA url', type: 'url', default: '/contact-us' },
  ],
  values: {
    eyebrow: 'Leadership',
    name: 'Mo Irani Tehrani',
    role: 'Managing Partner',
    photoUrl: 'https://cardiff.b-cdn.net/img/testimonials/EricGoldberg.png',
    paragraphs: [
      { text: 'Mo Irani Tehrani leads revenue growth at Cardiff, drawing on more than fifteen years in small-business lending to help operators borrow better. He believes funding should be fast, transparent, and built around how owners actually run their day.' },
      { text: 'Before Cardiff, Mo built credit teams that originated billions of dollars in working-capital and equipment financing across multiple verticals — from restaurants and retail to construction and professional services. He brings that same operator-first lens to every program Cardiff offers today.' },
      { text: 'When he is not deep in approvals, you can find Mo mentoring early-stage founders, advising the next generation of underwriters, and chasing his kids around the soccer field on Saturday mornings.' },
    ],
    focus: 'Small Business Lending',
    location: 'San Diego, CA',
    tenure: '15+ Years',
    primaryCtaText: 'Apply Now',
    primaryCtaUrl: 'https://cardiff.co/business/apply',
    secondaryCtaText: 'Talk to a Specialist',
    secondaryCtaUrl: '/contact-us',
  },
};

// Wrap inside an existing-style section so the soft-blue surface stays.
const sectionBlock = {
  type: 'section',
  id: 'sec-1',
  order: 2,
  style: {
    backgroundColor: '#f6f9fc',
    paddingTop: '88px',
    paddingBottom: '96px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  maxWidth: '1120px',
  blocks: [bioBlock],
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
  // Idempotent: locate the existing sec-1 (or a prior insert of this block) and replace it.
  const idx = parsed.blocks.findIndex(
    (b: any) => b?.id === 'sec-1' || b?.id === NEW_BLOCK_ID,
  );
  if (idx === -1) {
    console.error(`Post ${POST_ID}: could not find sec-1 or ${NEW_BLOCK_ID} to replace`);
    process.exit(1);
  }
  parsed.blocks[idx] = sectionBlock;
  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced block at index ${idx} with styled 2-col bio.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
