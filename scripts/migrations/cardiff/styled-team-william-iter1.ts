/**
 * Replace the William Stern bio page (post 834) top section with a clean
 * white 2-column "team-bio" hero that matches cardiff.co/about/william-stern/.
 *
 * Original: photo left (~30%), name + title + multi-paragraph bio right (~70%)
 * on a white background with a thin grey top border, sitting directly under
 * the global nav. No giant blue gradient hero. No giant centered headline.
 *
 * Idempotent: detects an existing `team-bio-hero` html-render block and
 * updates it in place; otherwise replaces blocks[0] (and removes the lonely
 * "Founder and CEO" paragraph at blocks[1] if it's still there).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 834;
const BLOCK_ID = 'team-bio-hero';

const HTML = `
<style>
  .cd-bio { background: #ffffff; border-top: 1px solid #e6e8ee; padding: 56px 24px 72px 24px; }
  .cd-bio__inner { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 48px; align-items: start; }
  .cd-bio__photo { width: 100%; aspect-ratio: 1 / 1; border-radius: 6px; background-color: #f2f4f8; background-size: cover; background-position: center top; box-shadow: 0 8px 32px rgba(28,51,112,0.10); }
  .cd-bio__body { color: #2a3142; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-bio__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.5rem; font-weight: 800; line-height: 1.05; letter-spacing: -0.01em; color: #1c3370; margin: 4px 0 6px 0; }
  .cd-bio__role { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #5ac96f; margin: 0 0 22px 0; }
  .cd-bio__text { font-size: 1.0625rem; line-height: 1.65; color: #2a3142; }
  .cd-bio__text p { margin: 0 0 16px 0; }
  .cd-bio__text p:last-child { margin-bottom: 0; }
  .cd-bio__text a { color: #25418b; text-decoration: underline; text-decoration-color: rgba(37,65,139,0.35); text-underline-offset: 3px; }
  .cd-bio__text a:hover { color: #ef6632; text-decoration-color: #ef6632; }
  @media (max-width: 800px) {
    .cd-bio { padding: 40px 20px 56px 20px; }
    .cd-bio__inner { grid-template-columns: 1fr; gap: 28px; }
    .cd-bio__photo { max-width: 240px; margin: 0 auto; }
    .cd-bio__name { font-size: 2rem; text-align: center; }
    .cd-bio__role { text-align: center; }
  }
</style>
<section class="cd-bio">
  <div class="cd-bio__inner">
    <div class="cd-bio__photo" style="background-image: url('{{photoUrl}}');" role="img" aria-label="{{name}}"></div>
    <div class="cd-bio__body">
      <h1 class="cd-bio__name" data-field="name">{{name}}</h1>
      <p class="cd-bio__role" data-field="role">{{role}}</p>
      <div class="cd-bio__text" data-field="bioHtml">{{{bioHtml}}}</div>
    </div>
  </div>
</section>
`.trim();

const BIO_HTML = `<p>William Stern is the Founder and CEO of Cardiff. He is a serial entrepreneur, and a sought-after thought leader on digital marketing. William founded Cardiff in 2004 with a vision for a digital funding solution that is now revolutionizing how small businesses access capital.</p>
<p>A prolific founder, his ventures also include <a href="https://www.jointheagency.co/" target="_blank" rel="noopener">The Agency</a> (Founding Partner), and <a href="https://jointhefraternity.com/" target="_blank" rel="noopener">The Fraternity</a> coaching platform. He shares his expertise as the creator of the <a href="https://realbusinessgrowthsummit.com/" target="_blank" rel="noopener">Real Business Growth</a> and <a href="https://realtrafficsummit.com/" target="_blank" rel="noopener">Real Traffic Summits</a> and as the host of the &ldquo;<a href="https://open.spotify.com/show/209Xgm3G73zxdw7lqk8cjD" target="_blank" rel="noopener">A Stern Talk</a>&rdquo; podcast. Prior to his entrepreneurial career, he held key roles at Fisher Investments and Balboa Capital.</p>`;

const newBlock = {
  id: BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: HTML,
  fields: [
    { name: 'photoUrl', label: 'Headshot', type: 'image', default: '' },
    { name: 'name', label: 'Name', type: 'text', default: '' },
    { name: 'role', label: 'Role', type: 'text', default: '' },
    { name: 'bioHtml', label: 'Bio (HTML)', type: 'richtext', default: '' },
  ],
  values: {
    photoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/william-stern-cardiff-ceo-and-founder.jpg',
    name: 'William Stern',
    role: 'Founder and CEO',
    bioHtml: BIO_HTML,
  },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) { console.error(`Post ${POST_ID} not found`); process.exit(1); }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) { console.error('content.blocks missing'); process.exit(1); }

  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === BLOCK_ID);

  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = newBlock;
    console.log(`Updated existing ${BLOCK_ID} at idx ${existingIdx}`);
  } else {
    // Replace blocks[0] (old blue hero) and remove the orphan
    // "Founder and CEO" paragraph section at blocks[1] if present.
    const orig0 = parsed.blocks[0];
    if (!orig0 || orig0.type !== 'section') {
      console.error(`Expected blocks[0] to be 'section' (was ${orig0?.type}); aborting.`);
      process.exit(1);
    }
    const orig1 = parsed.blocks[1];
    const orig1IsFounderLine =
      orig1 &&
      orig1.type === 'section' &&
      JSON.stringify(orig1).toLowerCase().includes('founder and ceo');

    parsed.blocks[0] = newBlock;
    if (orig1IsFounderLine) {
      parsed.blocks.splice(1, 1);
      console.log('Removed orphan "Founder and CEO" paragraph section');
    }
    console.log(`Replaced blocks[0] with ${BLOCK_ID}`);
  }

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Saved post ${POST_ID}. New block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
