/**
 * Iter 1: Style the Contact Us page (post 801, slug=contact-us).
 *
 * Current state on port: hero is fine, sec-1 is a single-column stack of
 * H3 + paragraphs (Call Us / Email Us / Hours of Operations all left-
 * aligned), no visual structure, no real grid.
 *
 * cardiff.co/contact-us/ presents the same content as:
 *   1. Centered H2 "Questions? We're here to help" + small accent rule
 *   2. Two-column band: "Call Us" (phones) | "Email Us" (department links)
 *   3. "Hours of Operations" beneath
 *
 * We replace sec-1's children with:
 *   - centered heading + orange underline (same recipe as iter pattern)
 *   - one html-render block carrying a 2-col card grid (Call / Email) on a
 *     light-blue band, with a Hours-of-Operations card below it
 *
 * Brand palette only: deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632) accents. Material Icons (no emojis). Raleway headings,
 * Open Sans body. Idempotent — re-running rewrites the sec-1 children.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 801;
const TARGET_BLOCK_ID = 'sec-1';

const CONTACT_HTML = `
<style>
  .cd-ct { max-width: 1140px; margin: 0 auto; }
  .cd-ct__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 720px; margin: 0 auto 48px auto; }
  .cd-ct__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
  .cd-ct__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 36px 32px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); display: flex; flex-direction: column; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-ct__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-ct__card-head { display: flex; align-items: center; gap: 14px; margin: 0 0 22px 0; }
  .cd-ct__icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); flex: 0 0 52px; }
  .cd-ct__card--email .cd-ct__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-ct__icon .material-icons { font-size: 28px; }
  .cd-ct__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.5rem; font-weight: 800; color: #1c3370; margin: 0; letter-spacing: -0.005em; line-height: 1.2; }
  .cd-ct__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px; }
  .cd-ct__row { display: flex; flex-direction: column; gap: 4px; padding: 12px 0; border-bottom: 1px solid #eef2f8; }
  .cd-ct__row:last-child { border-bottom: 0; }
  .cd-ct__row-label { font-family: 'Open Sans', sans-serif; font-size: 0.8125rem; font-weight: 700; color: #8595b3; letter-spacing: 0.06em; text-transform: uppercase; }
  .cd-ct__row-value { font-family: 'Open Sans', sans-serif; font-size: 1.0625rem; color: #25418b; text-decoration: none; font-weight: 600; transition: color .15s ease; }
  .cd-ct__row-value:hover { color: #ef6632; text-decoration: underline; }
  .cd-ct__hours { margin: 28px auto 0 auto; max-width: 820px; padding: 30px 36px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(90,201,111,0.08) 100%); border-radius: 12px; border: 1px solid #e6ecf5; display: flex; align-items: center; gap: 22px; }
  .cd-ct__hours-icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); color: #fff; box-shadow: 0 8px 18px rgba(58,168,86,0.28); flex: 0 0 52px; }
  .cd-ct__hours-icon .material-icons { font-size: 28px; }
  .cd-ct__hours-body { display: flex; flex-direction: column; gap: 4px; flex: 1 1 auto; }
  .cd-ct__hours-title { font-family: 'Raleway', sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0; letter-spacing: -0.005em; }
  .cd-ct__hours-line { font-family: 'Open Sans', sans-serif; font-size: 1rem; color: #525f7f; margin: 0; }
  .cd-ct__hours-line strong { color: #25418b; font-weight: 700; }
  @media (max-width: 820px) {
    .cd-ct__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ct__card { padding: 28px 24px; }
    .cd-ct__hours { flex-direction: column; align-items: flex-start; padding: 24px 22px; }
  }
</style>
<div class="cd-ct">
  <p class="cd-ct__intro" data-field="intro">{{intro}}</p>
  <div class="cd-ct__grid">
    <div class="cd-ct__card cd-ct__card--call">
      <div class="cd-ct__card-head">
        <div class="cd-ct__icon"><span class="material-icons">phone</span></div>
        <h3 class="cd-ct__card-title" data-field="callTitle">{{callTitle}}</h3>
      </div>
      <ul class="cd-ct__list">
        <li class="cd-ct__row">
          <span class="cd-ct__row-label" data-field="phone1Label">{{phone1Label}}</span>
          <a class="cd-ct__row-value" href="tel:{{phone1Tel}}" data-field="phone1Display">{{phone1Display}}</a>
        </li>
        <li class="cd-ct__row">
          <span class="cd-ct__row-label" data-field="phone2Label">{{phone2Label}}</span>
          <a class="cd-ct__row-value" href="tel:{{phone2Tel}}" data-field="phone2Display">{{phone2Display}}</a>
        </li>
      </ul>
    </div>
    <div class="cd-ct__card cd-ct__card--email">
      <div class="cd-ct__card-head">
        <div class="cd-ct__icon"><span class="material-icons">mail_outline</span></div>
        <h3 class="cd-ct__card-title" data-field="emailTitle">{{emailTitle}}</h3>
      </div>
      <ul class="cd-ct__list">
        <li class="cd-ct__row">
          <span class="cd-ct__row-label" data-field="email1Label">{{email1Label}}</span>
          <a class="cd-ct__row-value" href="mailto:{{email1Addr}}" data-field="email1Addr">{{email1Addr}}</a>
        </li>
        <li class="cd-ct__row">
          <span class="cd-ct__row-label" data-field="email2Label">{{email2Label}}</span>
          <a class="cd-ct__row-value" href="mailto:{{email2Addr}}" data-field="email2Addr">{{email2Addr}}</a>
        </li>
        <li class="cd-ct__row">
          <span class="cd-ct__row-label" data-field="email3Label">{{email3Label}}</span>
          <a class="cd-ct__row-value" href="mailto:{{email3Addr}}" data-field="email3Addr">{{email3Addr}}</a>
        </li>
        <li class="cd-ct__row">
          <span class="cd-ct__row-label" data-field="email4Label">{{email4Label}}</span>
          <a class="cd-ct__row-value" href="mailto:{{email4Addr}}" data-field="email4Addr">{{email4Addr}}</a>
        </li>
      </ul>
    </div>
  </div>
  <div class="cd-ct__hours">
    <div class="cd-ct__hours-icon"><span class="material-icons">schedule</span></div>
    <div class="cd-ct__hours-body">
      <h3 class="cd-ct__hours-title" data-field="hoursTitle">{{hoursTitle}}</h3>
      <p class="cd-ct__hours-line" data-field="hoursDays">{{hoursDays}}</p>
      <p class="cd-ct__hours-line" data-field="hoursWindow">{{hoursWindow}}</p>
    </div>
  </div>
</div>
`.trim();

const DEFAULTS = {
  intro:
    "Have a question about applying, an existing account, or partnering with Cardiff? Reach the right team directly — we typically respond the same business day.",
  callTitle: 'Call Us',
  phone1Label: 'Service',
  phone1Display: '(888) 234-0166',
  phone1Tel: '+18882340166',
  phone2Label: 'Fax',
  phone2Display: '(888) 234-0177',
  phone2Tel: '+18882340177',
  emailTitle: 'Email Us',
  email1Label: 'Account details',
  email1Addr: 'info@cardiff.co',
  email2Label: 'Application questions',
  email2Addr: 'apply@cardiff.co',
  email3Label: 'ISO / partner relationship',
  email3Addr: 'partners@cardiff.co',
  email4Label: 'Careers',
  email4Addr: 'careers@cardiff.co',
  hoursTitle: 'Hours of Operations',
  hoursDays: 'Monday – Friday',
  hoursWindow: '8am – 5pm (Pacific)',
} as const;

const contactBlock = {
  id: 'sec-1-contact',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: CONTACT_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: DEFAULTS.intro },
    { name: 'callTitle', label: 'Call card — title', type: 'text', default: DEFAULTS.callTitle },
    { name: 'phone1Label', label: 'Phone 1 — label', type: 'text', default: DEFAULTS.phone1Label },
    { name: 'phone1Display', label: 'Phone 1 — display', type: 'text', default: DEFAULTS.phone1Display },
    { name: 'phone1Tel', label: 'Phone 1 — tel: value', type: 'text', default: DEFAULTS.phone1Tel },
    { name: 'phone2Label', label: 'Phone 2 — label', type: 'text', default: DEFAULTS.phone2Label },
    { name: 'phone2Display', label: 'Phone 2 — display', type: 'text', default: DEFAULTS.phone2Display },
    { name: 'phone2Tel', label: 'Phone 2 — tel: value', type: 'text', default: DEFAULTS.phone2Tel },
    { name: 'emailTitle', label: 'Email card — title', type: 'text', default: DEFAULTS.emailTitle },
    { name: 'email1Label', label: 'Email 1 — label', type: 'text', default: DEFAULTS.email1Label },
    { name: 'email1Addr', label: 'Email 1 — address', type: 'text', default: DEFAULTS.email1Addr },
    { name: 'email2Label', label: 'Email 2 — label', type: 'text', default: DEFAULTS.email2Label },
    { name: 'email2Addr', label: 'Email 2 — address', type: 'text', default: DEFAULTS.email2Addr },
    { name: 'email3Label', label: 'Email 3 — label', type: 'text', default: DEFAULTS.email3Label },
    { name: 'email3Addr', label: 'Email 3 — address', type: 'text', default: DEFAULTS.email3Addr },
    { name: 'email4Label', label: 'Email 4 — label', type: 'text', default: DEFAULTS.email4Label },
    { name: 'email4Addr', label: 'Email 4 — address', type: 'text', default: DEFAULTS.email4Addr },
    { name: 'hoursTitle', label: 'Hours — title', type: 'text', default: DEFAULTS.hoursTitle },
    { name: 'hoursDays', label: 'Hours — days line', type: 'text', default: DEFAULTS.hoursDays },
    { name: 'hoursWindow', label: 'Hours — window line', type: 'text', default: DEFAULTS.hoursWindow },
  ],
  values: { ...DEFAULTS },
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

  // Widen so the 2-col card grid breathes.
  sec.maxWidth = '1200px';
  // Soft band to separate from neighbors (matches the rest-of-site recipe).
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-1-title',
    order: 1,
    level: 2,
    content: "Questions? We're here to help",
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '0 auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-1-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, contactBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-1 -> styled 2-col Call/Email + Hours band.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
