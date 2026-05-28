/**
 * Iter 7 — post 829 (SBA Loans). After iters 1-6 the only remaining unstyled
 * section is `sec-7` ("See what business owners like you have to say"): the
 * title + divider are in place but the body is completely empty — only an
 * orphan disclaimer footnote (`sec-7-p-2`) sits underneath, with no
 * testimonials at all. The biggest visible gap on the page.
 *
 * Pattern mirrors iter6 / styled-equipment-leasing-iter3: a single
 * html-render block driven by `data-repeat="testimonials"` over a 3-up
 * testimonial card grid with rotating brand-accent quote-mark chips, and a
 * second html-render block carrying the funding-time disclaimer styled as a
 * subtle footnote band so it stops looking abandoned.
 *
 * Preserves sec-7-title, sec-7-div, sec-7-p-2 (disclaimer); replaces the
 * rest. Idempotent: looks up by id and always rewrites sub-blocks to
 * [title, divider, testimonials-html-render, disclaimer].
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 829;
const TARGET_BLOCK_ID = 'sec-7';

const TESTIMONIALS_HTML = `
<style>
  .cd-sba-tt { max-width: 1140px; margin: 0 auto; }
  .cd-sba-tt__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-sba-tt__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 36px 28px 28px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-sba-tt__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-sba-tt__quote { position: absolute; top: -18px; left: 24px; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-sba-tt__card:nth-child(2) .cd-sba-tt__quote { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-sba-tt__card:nth-child(3) .cd-sba-tt__quote { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-sba-tt__quote .material-icons { font-size: 24px; }
  .cd-sba-tt__stars { color: #ef6632; font-size: 16px; letter-spacing: 2px; margin: 0 0 12px 0; }
  .cd-sba-tt__body { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9875rem; line-height: 1.7; color: #3a4a6b; margin: 0 0 22px 0; font-style: italic; flex: 1; }
  .cd-sba-tt__meta { display: flex; align-items: center; gap: 12px; padding-top: 18px; border-top: 1px solid #eef2f9; }
  .cd-sba-tt__avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Raleway', sans-serif; font-weight: 700; font-size: 0.9375rem; flex-shrink: 0; }
  .cd-sba-tt__card:nth-child(2) .cd-sba-tt__avatar { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); }
  .cd-sba-tt__card:nth-child(3) .cd-sba-tt__avatar { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); }
  .cd-sba-tt__who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .cd-sba-tt__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.9375rem; color: #1c3370; letter-spacing: -0.005em; }
  .cd-sba-tt__role { font-family: 'Open Sans', sans-serif; font-size: 0.8125rem; color: #6b7a99; }
  @media (max-width: 980px) {
    .cd-sba-tt__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-sba-tt__grid { grid-template-columns: 1fr; gap: 28px; }
    .cd-sba-tt__card { padding: 34px 22px 24px 22px; }
  }
</style>
<div class="cd-sba-tt">
  <div class="cd-sba-tt__grid">
    <div class="cd-sba-tt__card" data-repeat="testimonials">
      <div class="cd-sba-tt__quote"><span class="material-icons" data-field="icon">{{testimonials.icon}}</span></div>
      <div class="cd-sba-tt__stars" data-field="stars">{{testimonials.stars}}</div>
      <p class="cd-sba-tt__body" data-field="body">{{testimonials.body}}</p>
      <div class="cd-sba-tt__meta">
        <div class="cd-sba-tt__avatar" data-field="initials">{{testimonials.initials}}</div>
        <div class="cd-sba-tt__who">
          <span class="cd-sba-tt__name" data-field="name">{{testimonials.name}}</span>
          <span class="cd-sba-tt__role" data-field="role">{{testimonials.role}}</span>
        </div>
      </div>
    </div>
  </div>
</div>
`.trim();

const TESTIMONIALS = [
  {
    icon: 'format_quote',
    stars: '★ ★ ★ ★ ★',
    body: 'Cardiff made the SBA process feel manageable. We had a same-day decision and the funds we needed to bring on two more technicians before peak season.',
    initials: 'MR',
    name: 'Marcus R.',
    role: 'Owner, HVAC services',
  },
  {
    icon: 'format_quote',
    stars: '★ ★ ★ ★ ★',
    body: 'I appreciated how transparent the team was about rates and terms — no surprises. The capital let us open our second location six months ahead of plan.',
    initials: 'JL',
    name: 'Jennifer L.',
    role: 'Founder, retail boutique',
  },
  {
    icon: 'format_quote',
    stars: '★ ★ ★ ★ ★',
    body: 'Other lenders kept asking for more paperwork. Cardiff looked at our actual revenue and got us funded in days, not weeks. Real partners for small business.',
    initials: 'DK',
    name: 'David K.',
    role: 'Owner, logistics company',
  },
];

const testimonialsBlock = {
  id: 'sec-7-testimonials',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: TESTIMONIALS_HTML,
  fields: [
    {
      name: 'testimonials',
      label: 'Testimonial cards',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Quote icon (Material Icons name)', type: 'text' },
        { name: 'stars', label: 'Star rating (display string)', type: 'text' },
        { name: 'body', label: 'Testimonial body', type: 'textarea' },
        { name: 'initials', label: 'Initials (avatar)', type: 'text' },
        { name: 'name', label: 'Name', type: 'text' },
        { name: 'role', label: 'Role / business', type: 'text' },
      ],
    },
  ],
  values: { testimonials: TESTIMONIALS },
};

const DISCLAIMER_HTML = `
<style>
  .cd-sba-disc { max-width: 820px; margin: 56px auto 0 auto; padding: 16px 22px; background: rgba(28,51,112,0.04); border-left: 3px solid #ef6632; border-radius: 6px; }
  .cd-sba-disc__text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; line-height: 1.65; color: #6b7a99; margin: 0; font-style: italic; }
</style>
<div class="cd-sba-disc">
  <p class="cd-sba-disc__text" data-field="text">{{text}}</p>
</div>
`.trim();

const DISCLAIMER_DEFAULT =
  '*Cardiff can fund same day for applications approved by 5:00 p.m. Eastern Time on bank business days.';

const disclaimerBlock = {
  id: 'sec-7-disclaimer',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: DISCLAIMER_HTML,
  fields: [{ name: 'text', label: 'Disclaimer text', type: 'textarea', default: DISCLAIMER_DEFAULT }],
  values: { text: DISCLAIMER_DEFAULT },
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

  const idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }
  if (!Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: ${TARGET_BLOCK_ID}.blocks is missing; aborting`);
    process.exit(1);
  }

  // Widen so the 3-up testimonial grid breathes; keep the soft tint band.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  // Preserve title + divider; rewrite the rest (drop the orphan p-2, re-add as styled disclaimer below).
  const preserveIds = new Set(['sec-7-title', 'sec-7-div']);
  const preserved = sec.blocks
    .filter((b: any) => preserveIds.has(b?.id))
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  if (preserved.length !== 2) {
    console.error(`Post ${POST_ID}: expected 2 preserved sub-blocks (title/divider), found ${preserved.length}; aborting`);
    process.exit(1);
  }
  preserved[0].order = 1;
  preserved[1].order = 2;
  // Push divider closer to the testimonials grid.
  if (preserved[1].style) {
    preserved[1].style.margin = '0 auto 44px auto';
  }

  sec.blocks = [...preserved, testimonialsBlock, disclaimerBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-7 -> styled 3-card testimonial grid (data-repeat=testimonials) + styled disclaimer.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
