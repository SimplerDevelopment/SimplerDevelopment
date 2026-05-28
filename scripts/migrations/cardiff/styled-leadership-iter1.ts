/**
 * Iter 1: Leadership / Team landing page (slug: `leadership`).
 *
 * Discovery:
 *   - websiteId 405 (cardiff-main) has four individual leadership bio pages
 *     (slugs: team-william-stern, team-dean-lyulkin, team-ali-irani-tehrani,
 *     team-mo-irani-tehrani — posts 834, 832, 831, 833) but NO listing page
 *     that surfaces them as a group. The About page (post 795) does have a
 *     `leadership-cards` block (4-up name/role/pill grid) but visitors who
 *     land on /team or /leadership get a 404.
 *   - cardiff.co/leadership/ and cardiff.co/team/ both fall through to the
 *     homepage on the source site (SPA-routed), so there is no
 *     pixel-reference. The biggest gap is therefore the existence of the
 *     page itself, not its visual fidelity to a missing source.
 *
 * Fix in this iter: create a dedicated `/leadership` page. Three sections:
 *   1. `hero-leadership` — deep-blue gradient hero with H1 ("Leadership"),
 *      sub-headline, and Apply Now + Talk to a Specialist buttons.
 *      Same recipe as styled-industries-beauty-salon-iter1 hero.
 *   2. `leadership-grid` — richer 4-up leadership grid html-render block
 *      with photo + name + role + 2-3 sentence bio snippet + "Read full bio"
 *      pill. This is intentionally richer than the about-page
 *      `leadership-cards` block (which only carries name/role/pill) so a
 *      visitor on the landing page can scan everyone's story without
 *      bouncing into four bio pages. Bio snippets are condensed from the
 *      data already present in the individual team-* pages.
 *   3. `final-cta` — deep-blue gradient closing CTA ("Ready to borrow
 *      better?") matching the canonical industries-page recipe.
 *
 * Renderer quirk: `data-repeat` lives on the inner `<article>` card (the
 * grid child), NEVER on the grid container. Per the about-iter2 recipe.
 *
 * Idempotent:
 *   - If post with slug `leadership` on websiteId 405 does not exist:
 *     insert it with all three blocks (published).
 *   - If it exists: replace `hero-leadership`, `leadership-grid`, and
 *     `final-cta` in place by id (preserving order). Any later iters that
 *     add additional sections are left untouched.
 *
 * Brand palette only — #1c3370 / #25418b (deep blue), #5ac96f (green),
 * #ef6632 / #ffb798 (orange). Raleway (headings), Open Sans (body),
 * Material Icons — never emojis. Apply CTAs route to /apply.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { and, eq } from 'drizzle-orm';

const WEBSITE_ID = 405;
const SLUG = 'leadership';
const TITLE = 'Leadership';
const SEO_TITLE = 'Cardiff Leadership Team — Founders, CEO, and Managing Partners';
const SEO_DESC =
  'Meet the Cardiff leadership team — founders and operators who have funded over $12B for small businesses across 21+ years of disciplined, transparent lending.';

const HERO_ID = 'hero-leadership';
const GRID_ID = 'leadership-grid';
const FINAL_CTA_ID = 'final-cta';

const GRID_HTML = `
<style>
  .cd-lg { background: #ffffff; padding: 96px 24px 96px 24px; }
  .cd-lg__inner { max-width: 1200px; margin: 0 auto; }
  .cd-lg__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; color: #ef6632; letter-spacing: 0.32em; text-transform: uppercase; text-align: center; margin: 0 0 14px 0; }
  .cd-lg__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.25rem; font-weight: 800; color: #25418b; letter-spacing: -0.018em; text-align: center; margin: 0 0 16px 0; line-height: 1.15; }
  .cd-lg__sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.6; color: #525f7f; text-align: center; margin: 0 auto 56px auto; max-width: 680px; }
  .cd-lg__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
  .cd-lg__card { position: relative; background: #ffffff; border: 1px solid #e8edf6; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 32px rgba(28,51,112,0.07); transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 0; align-items: stretch; }
  .cd-lg__card:hover { transform: translateY(-3px); box-shadow: 0 18px 44px rgba(28,51,112,0.13); border-color: #d9e1ee; }
  .cd-lg__card::before { content: ''; position: absolute; left: 0; top: 0; width: 6px; height: 100%; background: linear-gradient(180deg, #ffb798 0%, #ef6632 100%); }
  .cd-lg__photo { width: 100%; height: 100%; min-height: 240px; aspect-ratio: 1 / 1; object-fit: cover; object-position: center top; display: block; background: #f6f9fc; }
  .cd-lg__body { padding: 24px 26px 24px 26px; display: flex; flex-direction: column; }
  .cd-lg__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.375rem; font-weight: 800; color: #1c3370; letter-spacing: -0.005em; margin: 0 0 4px 0; line-height: 1.2; }
  .cd-lg__role { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; font-weight: 700; color: #5ac96f; letter-spacing: 0.2em; text-transform: uppercase; margin: 0 0 14px 0; }
  .cd-lg__bio { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.6; color: #4a5673; margin: 0 0 18px 0; flex: 1 1 auto; }
  .cd-lg__pill { display: inline-flex; align-items: center; gap: 8px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.74rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #25418b; text-decoration: none; padding: 9px 18px; border: 1.5px solid #25418b; border-radius: 999px; background: transparent; align-self: flex-start; transition: background-color .18s ease, color .18s ease; }
  .cd-lg__pill:hover { background: #25418b; color: #ffffff; }
  .cd-lg__pill .material-icons { font-size: 14px; }
  @media (max-width: 980px) {
    .cd-lg__grid { grid-template-columns: 1fr; gap: 22px; }
    .cd-lg__card { grid-template-columns: 160px minmax(0, 1fr); }
    .cd-lg__photo { min-height: 200px; }
  }
  @media (max-width: 560px) {
    .cd-lg { padding: 72px 18px 72px 18px; }
    .cd-lg__title { font-size: 1.875rem; }
    .cd-lg__card { grid-template-columns: 1fr; }
    .cd-lg__photo { aspect-ratio: 16 / 11; min-height: 0; }
    .cd-lg__body { padding: 22px 22px 24px 22px; }
    .cd-lg__name { font-size: 1.25rem; }
  }
</style>
<section class="cd-lg">
  <div class="cd-lg__inner">
    <p class="cd-lg__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-lg__title" data-field="title">{{title}}</h2>
    <p class="cd-lg__sub" data-field="sub">{{sub}}</p>
    <div class="cd-lg__grid">
      <article class="cd-lg__card" data-repeat="people">
        <img class="cd-lg__photo" src="{{people.photo}}" alt="{{people.name}}" data-field="photo" />
        <div class="cd-lg__body">
          <h3 class="cd-lg__name" data-field="name">{{people.name}}</h3>
          <p class="cd-lg__role" data-field="role">{{people.role}}</p>
          <p class="cd-lg__bio" data-field="bio">{{people.bio}}</p>
          <a class="cd-lg__pill" href="{{people.url}}">
            <span data-field="pillText">{{people.pillText}}</span>
            <span class="material-icons">arrow_forward</span>
          </a>
        </div>
      </article>
    </div>
  </div>
</section>
`.trim();

const PEOPLE = [
  {
    name: 'William Stern',
    role: 'Founder and Chairman',
    photo:
      'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/william-stern-cardiff-ceo-and-founder.jpg',
    bio:
      'Founded Cardiff in 2004 with a vision for a digital funding solution that has now funded over $12B for small businesses. A serial entrepreneur, William is also Founding Partner at The Agency and creator of the Real Business Growth and Real Traffic Summits.',
    pillText: 'About William',
    url: '/team-william-stern',
  },
  {
    name: 'Dean Lyulkin',
    role: 'CEO',
    photo:
      'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/dean-lyulkin-cardiff-ceo-and-founder.jpg',
    bio:
      'CEO of Cardiff, leading day-to-day strategy and operations. Dean has spent his career scaling lending platforms and product teams that move fast without sacrificing the underwriting discipline small-business owners deserve.',
    pillText: 'About Dean',
    url: '/team-dean-lyulkin',
  },
  {
    name: 'Ali Irani-Tehrani',
    role: 'Managing Partner',
    photo:
      'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/ali-irani-tehrani-cardiff-managing-founder.jpg',
    bio:
      'Managing Partner focused on credit strategy, capital markets, and the operating systems that let Cardiff approve funding in minutes and fund in days — across every industry we serve.',
    pillText: 'About Ali',
    url: '/team-ali-irani-tehrani',
  },
  {
    name: 'Mo Irani-Tehrani',
    role: 'Managing Partner',
    photo:
      'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/09/mo-irani-tehrani-cardiff-managing-founder.jpg',
    bio:
      'Managing Partner overseeing growth, partnerships, and the lender relationships that make same-day funding possible. Mo helped build the broker and ISO network that today powers thousands of monthly approvals.',
    pillText: 'About Mo',
    url: '/team-mo-irani-tehrani',
  },
] as const;

function buildHeroSection(order: number) {
  return {
    type: 'section' as const,
    id: HERO_ID,
    order,
    maxWidth: '1080px',
    style: {
      backgroundColor: '#25418b',
      paddingTop: '88px',
      paddingBottom: '72px',
      paddingLeft: '24px',
      paddingRight: '24px',
      color: '#ffffff',
      customCSS:
        'background-image: radial-gradient(ellipse at 60% 0%, rgba(56,92,192,0.45) 0%, transparent 65%), linear-gradient(135deg, #1c3370 0%, #25418b 60%, #385cc0 100%);',
    },
    blocks: [
      {
        type: 'text' as const,
        id: 'h-eyebrow',
        order: 1,
        content: 'WHO WE ARE',
        style: {
          color: '#ffb798',
          fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: '0.6875rem',
          fontWeight: '700',
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          textAlign: 'center',
          margin: '0 0 14px 0',
        },
      },
      {
        type: 'heading' as const,
        alignment: 'center',
        id: 'h-title',
        order: 2,
        level: 1,
        content: 'Leadership',
        style: {
          color: '#ffffff',
          fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: '3rem',
          fontWeight: '800',
          letterSpacing: '-0.02em',
          lineHeight: '1.1',
          margin: '0 0 18px 0',
          textAlign: 'center',
          customCSS: 'text-shadow: 0 2px 16px rgba(0,0,0,0.32)',
        },
      },
      {
        type: 'text' as const,
        id: 'h-sub',
        order: 3,
        content:
          'Operators, founders, and capital builders who have funded over $12B for small businesses across 21+ years. Disciplined underwriting. Transparent terms. People who actually pick up the phone.',
        style: {
          color: 'rgba(255,255,255,0.85)',
          fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: '1.0625rem',
          lineHeight: '1.6',
          textAlign: 'center',
          maxWidth: '720px',
          margin: '0 auto 32px auto',
        },
      },
      {
        type: 'columns' as const,
        id: 'h-btns',
        order: 4,
        gap: 'sm',
        stackOnMobile: true,
        columns: [
          {
            id: 'hb-l',
            width: 'auto',
            padding: 'none',
            blocks: [
              {
                type: 'button' as const,
                id: 'hb-apply',
                order: 1,
                text: 'Apply Now',
                url: '/apply',
                variant: 'primary',
                size: 'md',
                alignment: 'right',
                icon: 'arrow_forward',
                iconPosition: 'right',
                hoverEffect: 'lift',
                style: {
                  backgroundColor: '#ef6632',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '0.875rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '14px 30px',
                  borderRadius: '6px',
                  fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
                  customCSS: 'box-shadow: 0 10px 24px rgba(239,102,50,0.4)',
                },
              },
            ],
          },
          {
            id: 'hb-r',
            width: 'auto',
            padding: 'none',
            blocks: [
              {
                type: 'button' as const,
                id: 'hb-contact',
                order: 1,
                text: 'Talk to a Specialist',
                url: '/contact-us',
                variant: 'secondary',
                size: 'md',
                alignment: 'left',
                hoverEffect: 'fill',
                style: {
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '14px 26px',
                  borderRadius: '6px',
                  fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
                  customCSS:
                    'border: 1.5px solid rgba(255,255,255,0.5); background: rgba(255,255,255,0.05); backdrop-filter: blur(4px)',
                },
              },
            ],
          },
        ],
        style: { margin: '0 auto', maxWidth: '460px' },
      },
    ],
  };
}

function buildGridBlock(order: number) {
  return {
    id: GRID_ID,
    type: 'html-render' as const,
    order,
    width: 'full' as const,
    html: GRID_HTML,
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'LEADERSHIP' },
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Meet the team' },
      {
        name: 'sub',
        label: 'Sub-headline',
        type: 'textarea' as const,
        default:
          'The people guiding Cardiff’s mission to make business funding simple, fast, and transparent.',
      },
      {
        name: 'people',
        label: 'Leaders',
        type: 'array' as const,
        itemFields: [
          { name: 'name', label: 'Name', type: 'text' as const },
          { name: 'role', label: 'Title', type: 'text' as const },
          { name: 'photo', label: 'Headshot', type: 'image' as const },
          { name: 'bio', label: 'Bio snippet (2-3 sentences)', type: 'textarea' as const },
          { name: 'pillText', label: 'Button text', type: 'text' as const, default: 'About' },
          { name: 'url', label: 'Bio link', type: 'url' as const, default: '#' },
        ],
      },
    ],
    values: {
      eyebrow: 'LEADERSHIP',
      title: 'Meet the team',
      sub:
        'The people guiding Cardiff’s mission to make business funding simple, fast, and transparent.',
      people: PEOPLE.map((p) => ({ ...p })),
    },
  };
}

function buildFinalCta(order: number) {
  return {
    type: 'cta' as const,
    id: FINAL_CTA_ID,
    order,
    heading: 'Ready to borrow better?',
    subheading:
      'Apply in five minutes. Get a real approval amount with no impact to your personal credit. The team above stands behind every decision.',
    primaryButton: { text: 'Apply Now', url: '/apply' },
    secondaryButton: { text: 'Talk to a Specialist', url: '/contact-us' },
    style: {
      backgroundColor: '#1c3370',
      color: '#ffffff',
      paddingTop: '64px',
      paddingBottom: '64px',
      paddingLeft: '24px',
      paddingRight: '24px',
      customCSS:
        'background-image: linear-gradient(135deg, #1c3370 0%, #25418b 60%, #385cc0 100%);',
    },
  };
}

function freshBlocks() {
  return [buildHeroSection(1), buildGridBlock(2), buildFinalCta(3)];
}

async function main() {
  const [existing] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, SLUG)))
    .limit(1);

  if (!existing) {
    const content = JSON.stringify({ blocks: freshBlocks() });
    const inserted = await db
      .insert(posts)
      .values({
        title: TITLE,
        slug: SLUG,
        postType: 'page',
        content,
        excerpt:
          'Meet the Cardiff leadership team — founders, CEO, and managing partners behind $12B+ funded for small businesses.',
        published: true,
        publishedAt: new Date(),
        seoTitle: SEO_TITLE,
        seoDescription: SEO_DESC,
        noIndex: false,
        websiteId: WEBSITE_ID,
      })
      .returning({ id: posts.id });
    console.log(
      `Inserted post id=${inserted[0]?.id} slug=${SLUG} websiteId=${WEBSITE_ID} (hero + grid + final-cta).`,
    );
    process.exit(0);
  }

  console.log(`Found existing post id=${existing.id} slug=${SLUG}; running idempotent refresh.`);
  const parsed = JSON.parse(existing.content);
  if (!Array.isArray(parsed.blocks)) parsed.blocks = [];

  const upsert = (id: string, build: (order: number) => any, fallbackIdx: number) => {
    const idx = parsed.blocks.findIndex((b: any) => b?.id === id);
    if (idx !== -1) {
      const order = parsed.blocks[idx].order ?? idx + 1;
      parsed.blocks[idx] = build(order);
      console.log(`  Replaced ${id} at index ${idx} (order=${order}).`);
    } else {
      const insertAt = Math.min(fallbackIdx, parsed.blocks.length);
      parsed.blocks.splice(insertAt, 0, build(insertAt + 1));
      for (let i = insertAt + 1; i < parsed.blocks.length; i++) {
        const b = parsed.blocks[i];
        if (b && typeof b === 'object') b.order = i + 1;
      }
      console.log(`  Inserted ${id} at index ${insertAt}.`);
    }
  };

  upsert(HERO_ID, buildHeroSection, 0);
  upsert(GRID_ID, buildGridBlock, 1);
  if (!parsed.blocks.some((b: any) => b?.id === FINAL_CTA_ID)) {
    parsed.blocks.push(buildFinalCta(parsed.blocks.length + 1));
    console.log(`  Appended ${FINAL_CTA_ID} (no closing CTA was present).`);
  }

  await db
    .update(posts)
    .set({
      title: TITLE,
      seoTitle: SEO_TITLE,
      seoDescription: SEO_DESC,
      published: true,
      content: JSON.stringify(parsed),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, existing.id));
  console.log(`Updated post ${existing.id}: leadership hero + grid + final-cta installed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
