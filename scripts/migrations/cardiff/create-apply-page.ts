/**
 * Create the /business/apply page on cardiff-main:
 *  1. Insert a `surveys` row with a 5-page business-loan application that
 *     mirrors cardiff.co/business/apply/'s structure (funding amount + contact
 *     → business info → financials → personal info → review).
 *  2. Insert a `posts` row (postType=page, slug=apply) with a styled hero +
 *     survey-block embed matching cardiff's left-sidebar + right-form layout.
 *
 * Idempotent — running again refreshes both rows in place by slug.
 */
import { db } from '../../../lib/db';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { posts } from '../../../lib/db/schema/cms';
import { surveys } from '../../../lib/db/schema/surveys';
import { eq } from 'drizzle-orm';

const CLIENT_ID = 100; // Post Captain — cardiff-main lives under client 100
const SURVEY_SLUG = 'cardiff-business-apply';
const PAGE_SLUG = 'apply';

// 5 pages of questions matching cardiff.co/business/apply/'s 1/5 → 5/5 flow.
// Field ids are stable so showIf/scoring can be added later without churn.
const SURVEY_PAGES = [
  { title: 'Check your eligibility in 60 seconds', description: 'Tell us a little bit about your business' },
  { title: 'About your business', description: '' },
  { title: 'Business financials', description: '' },
  { title: 'A little about you', description: '' },
  { title: 'Almost done — review & submit', description: '' },
];

type FieldDef = {
  id: string; type: string; label: string; placeholder: string; helpText: string;
  required: boolean; options: string[]; min?: number; max?: number; step?: number;
  order: number; page: number;
};

// The renderer paginates on `page_break` fields (not the `page` property).
// Order matters — keep these in sequence.
const RAW_FIELDS: Array<Partial<FieldDef> & { id: string; type: string; label: string; required: boolean; order: number; page: number }> = [
  // ── Page 1 — funding + contact (matches cardiff.co step 1/5) ──
  { id: 'funding_amount', type: 'number', label: 'How much funding do you need?', placeholder: '$', helpText: '', required: true, min: 5000, max: 500000, step: 1000, order: 1, page: 0 },
  { id: 'monthly_sales', type: 'number', label: 'What is your average monthly sales?', placeholder: '$', helpText: 'We use this to estimate your eligibility', required: true, min: 0, step: 1000, order: 2, page: 0 },
  { id: 'first_name', type: 'text', label: 'First Name', placeholder: '', helpText: '', required: true, order: 3, page: 0 },
  { id: 'last_name', type: 'text', label: 'Last Name', placeholder: '', helpText: '', required: true, order: 4, page: 0 },
  { id: 'email', type: 'email', label: 'Business Email Address', placeholder: 'you@yourcompany.com', helpText: '', required: true, order: 5, page: 0 },
  { id: 'phone', type: 'phone', label: 'Cell Phone', placeholder: '(555) 555-5555', helpText: '', required: true, order: 6, page: 0 },
  { id: 'sms_consent', type: 'checkbox', label: 'I agree to receive application status and funding decision notifications, plus automated marketing texts from Cardiff. Consent not a condition of purchase. Reply HELP for help, STOP to cancel.', placeholder: '', helpText: '', required: true, order: 7, page: 0 },
  { id: 'pb_after_contact', type: 'page_break', label: 'About your business', placeholder: '', helpText: '', required: false, order: 99, page: 0 },

  // ── Page 2 — business info ──
  { id: 'business_name', type: 'text', label: 'Business / Legal Name', placeholder: '', helpText: '', required: true, order: 1, page: 1 },
  { id: 'dba_name', type: 'text', label: 'DBA (if different)', placeholder: '', helpText: 'Optional', required: false, order: 2, page: 1 },
  { id: 'industry', type: 'select', label: 'Industry', placeholder: 'Select your industry', helpText: '', required: true, options: ['Auto Repair', 'Construction', 'Contracting', 'Dental Practice', 'Equipment Leasing', 'Excavation', 'Hospitality', 'Landscaping', 'Manufacturing', 'Masonry', 'Plumbing', 'Restaurant', 'Retail', 'Trucking', 'Other'], order: 3, page: 1 },
  { id: 'time_in_business', type: 'select', label: 'How long has your business been operating?', placeholder: 'Select time in business', helpText: '', required: true, options: ['Less than 1 year', '1–2 years', '2–5 years', '5–10 years', '10+ years'], order: 4, page: 1 },
  { id: 'business_structure', type: 'select', label: 'Business structure', placeholder: 'Select structure', helpText: '', required: true, options: ['Sole Proprietorship', 'LLC', 'C-Corporation', 'S-Corporation', 'Partnership', 'Non-Profit'], order: 5, page: 1 },
  { id: 'business_state', type: 'select', label: 'State of operation', placeholder: 'Select state', helpText: '', required: true, options: ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'], order: 6, page: 1 },
  { id: 'pb_after_business', type: 'page_break', label: 'Business financials', placeholder: '', helpText: '', required: false, order: 99, page: 1 },

  // ── Page 3 — business financials ──
  { id: 'annual_revenue', type: 'select', label: 'Annual gross revenue', placeholder: 'Select revenue range', helpText: '', required: true, options: ['Less than $100K', '$100K–$250K', '$250K–$500K', '$500K–$1M', '$1M–$5M', '$5M+'], order: 1, page: 2 },
  { id: 'use_of_funds', type: 'select', label: 'What will you use the funds for?', placeholder: 'Select primary use', helpText: '', required: true, options: ['Working capital', 'Equipment purchase', 'Expansion / Growth', 'Marketing', 'Payroll', 'Inventory', 'Refinance existing debt', 'Other'], order: 2, page: 2 },
  { id: 'has_business_bank_account', type: 'radio', label: 'Do you have a business bank account?', placeholder: '', helpText: '', required: true, options: ['Yes', 'No'], order: 3, page: 2 },
  { id: 'avg_bank_balance', type: 'select', label: 'Average business bank account balance', placeholder: 'Select range', helpText: '', required: true, options: ['Less than $5K', '$5K–$15K', '$15K–$50K', '$50K–$100K', '$100K+'], order: 4, page: 2 },
  { id: 'pb_after_financials', type: 'page_break', label: 'A little about you', placeholder: '', helpText: '', required: false, order: 99, page: 2 },

  // ── Page 4 — personal info (for credit check) ──
  { id: 'credit_score', type: 'select', label: 'Estimated personal credit score', placeholder: 'Select range', helpText: 'A soft pull won\'t affect your score', required: true, options: ['Excellent (720+)', 'Good (680–719)', 'Fair (620–679)', 'Poor (Below 620)', 'Not sure'], order: 1, page: 3 },
  { id: 'ownership_pct', type: 'select', label: 'Your ownership in the business', placeholder: 'Select ownership %', helpText: '', required: true, options: ['100%', '75–99%', '50–74%', '25–49%', 'Less than 25%'], order: 2, page: 3 },
  { id: 'us_citizen', type: 'radio', label: 'Are you a US citizen or permanent resident?', placeholder: '', helpText: '', required: true, options: ['Yes', 'No'], order: 3, page: 3 },
  { id: 'dob', type: 'date', label: 'Date of birth', placeholder: '', helpText: 'Used for identity verification only', required: true, order: 4, page: 3 },
  { id: 'pb_after_personal', type: 'page_break', label: 'Almost done', placeholder: '', helpText: '', required: false, order: 99, page: 3 },

  // ── Page 5 — review & submit ──
  { id: 'how_heard', type: 'select', label: 'How did you hear about Cardiff?', placeholder: 'Select', helpText: '', required: false, options: ['Google search', 'Referral', 'Social media', 'Email', 'TV / Radio', 'Other'], order: 1, page: 4 },
  { id: 'additional_notes', type: 'textarea', label: 'Anything else we should know?', placeholder: 'Optional — tell us about your business goals', helpText: '', required: false, order: 2, page: 4 },
  { id: 'final_consent', type: 'checkbox', label: 'I agree to the Cardiff Application Agreement and E-Sign Consent Agreement. I authorize Cardiff to obtain credit and background information needed to evaluate this application.', placeholder: '', helpText: '', required: true, order: 3, page: 4 },
];

// Normalize: every survey field requires placeholder/helpText/options strings.
// IMPORTANT: SurveyFormInline sorts ALL fields by `order` globally before
// splitting on `page_break`. Page-local order numbers (1,1,1,...) collide
// and shuffle fields across pages. We must assign a globally increasing
// `order` in declaration sequence — keep RAW_FIELDS in render order.
const SURVEY_FIELDS: FieldDef[] = RAW_FIELDS.map((f, i) => ({
  id: f.id,
  type: f.type,
  label: f.label,
  placeholder: f.placeholder ?? '',
  helpText: f.helpText ?? '',
  required: f.required,
  options: f.options ?? [],
  ...(f.min !== undefined ? { min: f.min } : {}),
  ...(f.max !== undefined ? { max: f.max } : {}),
  ...(f.step !== undefined ? { step: f.step } : {}),
  order: i + 1,
  page: f.page,
}));

const SURVEY_STYLING = {
  primaryColor: '#1c3370',
  secondaryColor: '#25418b',
  accentColor: '#5ac96f',
  backgroundColor: '#ffffff',
  textColor: '#1c3370',
  headingFont: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
  bodyFont: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  borderRadius: '8px',
  buttonPrimaryBg: '#5ac96f',
  buttonPrimaryText: '#ffffff',
  buttonBorderRadius: '6px',
  formBg: '#f6f9fc',
  inputBg: '#ffffff',
  inputTextColor: '#1c3370',
  hideTitle: true,
  hideLogo: true,
};

const APPLY_SIDEBAR_HTML = `<style>
  .cd-apply-rail { background: linear-gradient(180deg, #f4f6fa 0%, #ffffff 100%); padding: 56px 28px 48px 28px; display: flex; flex-direction: column; align-items: center; min-height: 100%; text-align: center; }
  .cd-apply-rail__logo { width: 200px; height: 200px; background: #1c3370; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 0 32px 0; box-shadow: 0 6px 18px rgba(28,51,112,0.10); }
  .cd-apply-rail__logo-text { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.5rem; font-weight: 800; color: #ffffff; letter-spacing: -0.015em; line-height: 1; }
  .cd-apply-rail__title { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.375rem; font-weight: 800; color: #0e1a3a; line-height: 1.22; margin: 0 0 16px 0; max-width: 240px; }
  .cd-apply-rail__divider { height: 1px; background: #cfd8e3; width: 240px; margin: 0 0 16px 0; }
  .cd-apply-rail__sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.5; color: #525f7f; margin: 0 0 32px 0; max-width: 260px; }
  .cd-apply-rail__badges { display: flex; gap: 8px; align-items: stretch; justify-content: center; flex-wrap: nowrap; width: 100%; max-width: 280px; }
  .cd-apply-rail__badge { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 10px 8px; border-radius: 4px; font-family: 'Open Sans', sans-serif; font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; line-height: 1.05; min-width: 78px; }
  .cd-apply-rail__badge .material-icons { font-size: 18px; margin-bottom: 4px; }
  .cd-apply-rail__badge--ssl { background: #1f5870; color: #fff; }
  .cd-apply-rail__badge--bbb { background: #1c3370; color: #fff; }
  .cd-apply-rail__badge--ap { background: transparent; color: #1c3370; }
  .cd-apply-rail__badge--ap-letters { font-family: Raleway, sans-serif; font-size: 2rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1; color: #1c3370; }
  .cd-apply-rail__badge--ap-label { font-size: 0.65rem; font-weight: 600; text-transform: none; letter-spacing: 0; color: #1c3370; margin-top: 2px; }
</style>
<aside class="cd-apply-rail">
  <div class="cd-apply-rail__logo"><span class="cd-apply-rail__logo-text">cardiff</span></div>
  <h2 class="cd-apply-rail__title" data-field="title">{{title}}</h2>
  <div class="cd-apply-rail__divider"></div>
  <p class="cd-apply-rail__sub" data-field="sub">{{sub}}</p>
  <div class="cd-apply-rail__badges">
    <span class="cd-apply-rail__badge cd-apply-rail__badge--ssl">
      <span class="material-icons">lock</span>
      <span>Secured<br/>by SSL</span>
    </span>
    <span class="cd-apply-rail__badge cd-apply-rail__badge--bbb">
      <span class="material-icons">verified_user</span>
      <span>Accredited<br/>Business</span>
    </span>
    <span class="cd-apply-rail__badge cd-apply-rail__badge--ap">
      <span class="cd-apply-rail__badge--ap-letters">A+</span>
      <span class="cd-apply-rail__badge--ap-label">Rating</span>
    </span>
  </div>
</aside>`;

async function main() {
  // Resolve site
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main site not found');
  // 1) Upsert survey
  const existing = await db.select().from(surveys).where(eq(surveys.slug, SURVEY_SLUG)).limit(1);
  const surveyData = {
    clientId: CLIENT_ID,
    // Shown above the form. Matches cardiff.co/business/apply's first-step
    // heading. The renderer doesn't expose per-page titles in the UI, so we
    // keep this single string consistent with the most-visible step.
    title: 'Check your eligibility in 60 seconds',
    slug: SURVEY_SLUG,
    description: 'Apply for business financing in under 60 seconds.',
    fields: SURVEY_FIELDS,
    pages: SURVEY_PAGES,
    thankYouTitle: 'Thanks — we got it!',
    thankYouMessage: 'A Cardiff funding specialist will reach out within one business day with your options.',
    color: '#5ac96f',
    brandingProfileId: site.brandingProfileId,
    styling: SURVEY_STYLING,
    status: 'active' as const,
    // Don't auto-inject email/name — we have our own contact fields on page 1.
    requireEmail: false,
    consentField: 'sms_consent',
    updatedAt: new Date(),
  };
  let surveyId: number;
  if (existing.length > 0) {
    await db.update(surveys).set(surveyData).where(eq(surveys.id, existing[0].id));
    surveyId = existing[0].id;
    console.log(`Updated survey ${surveyId} (${SURVEY_SLUG})`);
  } else {
    const [inserted] = await db.insert(surveys).values(surveyData).returning({ id: surveys.id });
    surveyId = inserted.id;
    console.log(`Created survey ${surveyId} (${SURVEY_SLUG})`);
  }

  // 2) Upsert page — single section containing a columns block (sidebar | survey)
  const pageBlocks = {
    blocks: [
      {
        id: 'apply-section',
        type: 'section',
        order: 1,
        maxWidth: '1280px',
        style: { backgroundColor: '#ffffff', paddingTop: '24px', paddingBottom: '40px', paddingLeft: '0px', paddingRight: '0px' },
        blocks: [
          {
            id: 'apply-columns',
            type: 'columns',
            order: 1,
            gap: 'sm',
            stackOnMobile: true,
            columns: [
              {
                id: 'apply-col-sidebar',
                width: '32%',
                padding: 'none',
                verticalAlign: 'top',
                blocks: [
                  {
                    id: 'apply-sidebar',
                    type: 'html-render',
                    width: 'full',
                    order: 1,
                    html: APPLY_SIDEBAR_HTML,
                    fields: [
                      { name: 'title', label: 'Sidebar headline', type: 'text', default: 'Tell us a little bit about your business' },
                      { name: 'sub', label: 'Sidebar subhead', type: 'textarea', default: 'Fill out our 60 second application and secure your approval.' },
                    ],
                    values: {
                      title: 'Tell us a little bit about your business',
                      sub: 'Fill out our 60 second application and secure your approval.',
                    },
                  },
                ],
              },
              {
                id: 'apply-col-form',
                width: '68%',
                padding: 'lg',
                verticalAlign: 'top',
                blocks: [
                  {
                    id: 'apply-survey-embed',
                    type: 'survey',
                    order: 1,
                    slug: SURVEY_SLUG,
                    showPageTitle: true,
                    showDescription: false,
                    showLogo: false,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    version: 2,
  };

  const existingPage = await db.select().from(posts).where(eq(posts.slug, PAGE_SLUG)).limit(1);
  const pageData = {
    title: 'Apply for a Business Loan',
    slug: PAGE_SLUG,
    postType: 'page' as const,
    content: JSON.stringify(pageBlocks),
    excerpt: 'Apply for Cardiff business financing in under 60 seconds.',
    published: true,
    publishedAt: new Date(),
    seoTitle: 'Apply for a Business Loan Today | Cardiff',
    seoDescription: 'Get pre-qualified for up to $250,000 in business financing in 60 seconds. No collateral required.',
    websiteId: site.id,
    updatedAt: new Date(),
  };

  if (existingPage.length > 0) {
    await db.update(posts).set(pageData).where(eq(posts.id, existingPage[0].id));
    console.log(`Updated page ${existingPage[0].id} (/${PAGE_SLUG})`);
  } else {
    const [inserted] = await db.insert(posts).values(pageData).returning({ id: posts.id });
    console.log(`Created page ${inserted.id} (/${PAGE_SLUG})`);
  }
  console.log(`\nVisit: http://localhost:3000/sites/cardiff-main.simplerdevelopment.com/${PAGE_SLUG}`);
  console.log(`Survey public: http://localhost:3000/s/${SURVEY_SLUG}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
