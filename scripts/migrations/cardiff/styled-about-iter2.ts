/**
 * About page (post id 795) — iteration 2.
 *
 * Iter1 fixed the hero. The next biggest visual gap is the Leadership grid.
 * Original cardiff.co/about-cardiff/ presents each leader as a card with a
 * peach/tan top-accent bar above the headshot, name, title, and a clearly
 * tappable "About <Firstname>" pill button (outlined blue). The port
 * currently renders four flat white card-grid tiles with a plain
 * "Learn more →" text link, no top accent and no pill — it reads as a
 * generic gallery instead of "click here to learn about this person".
 *
 * Fix: replace the entire `leadership` section (blocks[2]) with a single
 * `html-render` block whose body uses a `data-repeat="people"` strip of
 * 4 person cards. Each card has:
 *   - peach top accent bar (#ffb798 → #ef6632)
 *   - headshot
 *   - name (deep blue, condensed uppercase)
 *   - title (muted)
 *   - "About <Firstname>" outlined pill linking to the team subpage
 *
 * The eyebrow + "Meet the team" headline + sub-copy that previously lived
 * in the section's child blocks are baked into the html shell at the top
 * of the section so the visual stack stays identical.
 *
 * Idempotent: aborts unless blocks[2].id === 'leadership' OR
 * blocks[2].id === 'leadership-cards' (already-migrated marker). Re-running
 * is a no-op apart from refreshing values.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 795;
  const NEW_ID = 'leadership-cards';

  const LEADERSHIP_HTML = `
<style>
  .cd-lead { background: #ffffff; padding: 88px 24px 88px 24px; }
  .cd-lead__inner { max-width: 1180px; margin: 0 auto; }
  .cd-lead__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; color: #ef6632; letter-spacing: 0.32em; text-transform: uppercase; text-align: center; margin: 0 0 14px 0; }
  .cd-lead__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.25rem; font-weight: 800; color: #25418b; letter-spacing: -0.018em; text-align: center; margin: 0 0 16px 0; line-height: 1.1; }
  .cd-lead__sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.6; color: #525f7f; text-align: center; margin: 0 auto 56px auto; max-width: 640px; }
  .cd-lead__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; }
  .cd-lead__card { position: relative; background: #ffffff; border: 1px solid #e8edf6; border-radius: 12px; overflow: hidden; padding: 0 0 24px 0; text-align: center; box-shadow: 0 8px 28px rgba(28, 51, 112, 0.06); transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .cd-lead__card:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(28, 51, 112, 0.12); }
  .cd-lead__card::before { content: ''; display: block; height: 6px; background: linear-gradient(90deg, #ffb798 0%, #ef6632 100%); }
  .cd-lead__photo { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; background: #f6f9fc; }
  .cd-lead__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; font-weight: 800; color: #1c3370; letter-spacing: 0.02em; text-transform: none; margin: 22px 16px 6px 16px; line-height: 1.2; }
  .cd-lead__role { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.75rem; font-weight: 700; color: #8893ab; letter-spacing: 0.18em; text-transform: uppercase; margin: 0 16px 18px 16px; }
  .cd-lead__pill { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #25418b; text-decoration: none; padding: 9px 18px; border: 1.5px solid #25418b; border-radius: 999px; background: transparent; transition: background-color 0.18s ease, color 0.18s ease; }
  .cd-lead__pill:hover { background: #25418b; color: #ffffff; }
  @media (max-width: 900px) {
    .cd-lead__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
    .cd-lead { padding: 64px 18px 64px 18px; }
    .cd-lead__title { font-size: 1.75rem; }
  }
  @media (max-width: 520px) {
    .cd-lead__grid { grid-template-columns: 1fr; }
  }
</style>
<section class="cd-lead">
  <div class="cd-lead__inner">
    <p class="cd-lead__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-lead__title" data-field="title">{{title}}</h2>
    <p class="cd-lead__sub" data-field="sub">{{sub}}</p>
    <div class="cd-lead__grid">
      <article class="cd-lead__card" data-repeat="people">
        <img class="cd-lead__photo" src="{{people.photo}}" alt="{{people.name}}" data-field="photo" />
        <h3 class="cd-lead__name" data-field="name">{{people.name}}</h3>
        <p class="cd-lead__role" data-field="role">{{people.role}}</p>
        <a class="cd-lead__pill" href="{{people.url}}" data-field="pillText">{{people.pillText}}</a>
      </article>
    </div>
  </div>
</section>
`.trim();

  const leadershipCardsBlock = {
    id: NEW_ID,
    type: 'html-render' as const,
    order: 4,
    width: 'full' as const,
    html: LEADERSHIP_HTML,
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'LEADERSHIP' },
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Meet the team' },
      {
        name: 'sub',
        label: 'Sub-headline',
        type: 'textarea' as const,
        default:
          'The people guiding our mission to make business funding simple and transparent.',
      },
      {
        name: 'people',
        label: 'Leaders',
        type: 'array' as const,
        itemFields: [
          { name: 'name', label: 'Name', type: 'text' as const },
          { name: 'role', label: 'Title', type: 'text' as const },
          { name: 'photo', label: 'Headshot', type: 'image' as const },
          { name: 'pillText', label: 'Button text', type: 'text' as const, default: 'About' },
          { name: 'url', label: 'Bio link', type: 'url' as const, default: '#' },
        ],
      },
    ],
    values: {
      eyebrow: 'LEADERSHIP',
      title: 'Meet the team',
      sub: 'The people guiding our mission to make business funding simple and transparent.',
      people: [
        {
          name: 'William Stern',
          role: 'Founder and CEO',
          photo:
            'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/william-stern-cardiff-ceo-and-founder.jpg',
          pillText: 'About William',
          url: '/team-william-stern',
        },
        {
          name: 'Dean Lyulkin',
          role: 'CEO',
          photo:
            'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/dean-lyulkin-cardiff-ceo-and-founder.jpg',
          pillText: 'About Dean',
          url: '/team-dean-lyulkin',
        },
        {
          name: 'Ali Irani-Tehrani',
          role: 'Managing Partner',
          photo:
            'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/ali-irani-tehrani-cardiff-managing-founder.jpg',
          pillText: 'About Ali',
          url: '/team-ali-irani-tehrani',
        },
        {
          name: 'Mo Irani-Tehrani',
          role: 'Managing Partner',
          photo:
            'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/mo-irani-tehrani-cardiff-managing-founder.jpg',
          pillText: 'About Mo',
          url: '/team-mo-irani-tehrani',
        },
      ],
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
  const leadIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === 'leadership' || b?.id === NEW_ID,
  );
  if (leadIdx < 0) {
    console.error(`Post ${POST_ID}: no leadership / ${NEW_ID} block found; aborting`);
    process.exit(1);
  }
  const wasId = parsed.blocks[leadIdx]?.id;
  parsed.blocks[leadIdx] = leadershipCardsBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced '${wasId}' (idx ${leadIdx}) with '${NEW_ID}' html-render. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
