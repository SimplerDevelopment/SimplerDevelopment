import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
dotenv.config({ path: '.env' });

/**
 * Creates a CY Strategies pitch deck (slug: pitch-deck-3) that mirrors the
 * "TF2 Qualifier v4" HTML: a choose-your-own-adventure qualifier with:
 *   - Welcome / route chooser (decision slide → 2 paths)
 *   - Route 1 "guided": the existing cy-strategy-qualifier survey (Q1-Q3 +
 *     conditional scope follow-ups + dynamic recommendation)
 *   - Route 2 "direct": a four-offerings overview + book-each-directly
 *   - Final book-a-call slide both paths converge on
 *
 * Leaves pitch-deck-1 and pitch-deck-2 untouched.
 *
 * Palette: TF1/TF2 v8
 *   dark teal  #005652
 *   soft teal  #9FB7B1
 *   off white  #F6F5F2
 *   dark black #171615
 *   light teal #E2EDEA
 *   rust       #C46A3D
 */

const CALENDLY = 'https://calendly.com/cody-cystrategies/30min';
const CY_STRATEGIES_USER_EMAIL = 'cystrategies@simplerdevelopment.com';
const HEADSHOT_URL = 'https://cystrategies.co/assets/images/image08.jpg';

const DECK_SLUG = 'pitch-deck-3';
const SURVEY_SLUG = 'cy-strategy-qualifier';

const C = {
  darkTeal:  '#005652',
  softTeal:  '#9FB7B1',
  offWhite:  '#F6F5F2',
  darkBlack: '#171615',
  lightTeal: '#E2EDEA',
  rust:      '#C46A3D',
  white:     '#FFFFFF',
  bodyText:  '#3a4a49',
  mutedText: '#5a6b69',
};

// ─── Deck-global CSS (same patterns as pitch-deck-2) ─────────────────
const DECK_GLOBAL_CSS = `
.deck-root {
  --dark-teal:  ${C.darkTeal};
  --soft-teal:  ${C.softTeal};
  --off-white:  ${C.offWhite};
  --dark-black: ${C.darkBlack};
  --light-teal: ${C.lightTeal};
  --rust:       ${C.rust};
}
.deck-root .slide-stage { padding: 0 !important; align-items: stretch; }
.deck-root .slide-stage [data-editable-field="content"] { white-space: normal; }
.deck-root .slide-stage h1,
.deck-root .slide-stage h2,
.deck-root .slide-stage h3,
.deck-root .slide-stage h4 { margin: 0; }
.deck-root .slide-stage p { margin: 0; }
`.trim();

// ─── Welcome slide (decision slide with 2 route options) ─────────────
// Renders as a TF2-Qualifier-v4-style centered cover (logo → rust rule →
// headline → body → stacked route buttons). The `decisionCover` shape
// carries every piece of cover copy as content-managed fields — see
// PitchDeckDecisionCover in lib/db/schema.ts and the matching editor UI
// in app/portal/tools/pitch-decks/[id]/page.tsx.
//
// The logo SVG is read at build time from public/clients/cystrategies/logo.svg
// and inlined into the slide JSON so it can pick up `currentColor` for fill.
function buildWelcomeSlide() {
  const logoSvg = readFileSync(
    join(process.cwd(), 'public/clients/cystrategies/logo.svg'),
    'utf8',
  ).trim();

  return {
    id: 'slide-welcome',
    label: 'Welcome',
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
    // Decision slide — 2 options, each picks a pathGroup
    decisionSlide: true,
    decisionOptions: [
      {
        id: 'route-guided',
        label: 'Help me figure out what fits',
        // Description renders as the small uppercase eyebrow on the route
        // button (matches TF2 Qualifier v4's `rb-label`).
        description: 'Not sure yet',
        pathGroup: 'guided',
      },
      {
        id: 'route-direct',
        label: 'I know the direction I want to explore further',
        description: 'Already have something in mind',
        pathGroup: 'direct',
      },
    ],
    decisionCover: {
      logo: logoSvg,
      headline: "Let's figure out where to start.",
      body:
        "Three questions to help map your situation to the right offering. Takes about two minutes. At the end, you'll see what fits and why, along with a way to book a call if it makes sense.",
      backgroundColor: C.offWhite,
      textColor: C.darkBlack,
      // The body uses #4a5c5a in the TF2 source — slightly warmer than soft-teal.
      mutedColor: '#4a5c5a',
      // Rule colors with rust per the TF2 design (`.rule-rust` in the source).
      // The primary route button picks up `theme.primaryColor` (dark teal).
      accentColor: C.rust,
    },
    blocks: [],
  };
}

// ─── Route 1 (guided): survey slide with dynamic recommendation ───────
function buildGuidedSurveySlide(surveyId: number) {
  // Q1/Q2/Q3 option texts — must match the survey's options verbatim
  const Q1_OPTIONS = [
    "We're in early stages. Not much is happening yet, but we're ready to start doing this right.",
    "We're about to put real investment into marketing and want to make sure we're building the right things.",
    "We're doing some things but I'm not sure we're focused on what's actually going to move the needle.",
    "We have a specific campaign or initiative we're ready to build and want to get it right before we launch.",
  ];
  const Q2_OPTIONS = [
    'A clear picture of what to prioritize over the next 90 days and why.',
    'A focused plan that shows what to do, in what order, and why. Something to actually build from, whether that’s you, your team, or someone you bring in.',
    'A campaign built around a specific audience, structured and ready to execute.',
    'An ongoing strategic partner who keeps my priorities clear, decisions grounded, and marketing pointed at what actually matters for the business.',
  ];
  const Q3_OPTIONS = [
    "I think we're ready to start, and I want to do it right from the beginning.",
    'We have a specific initiative coming up and need it built correctly before we run it.',
    "Things are moving but results aren't matching the effort. We need to recalibrate.",
    'Decisions keep stacking up and we need consistent strategic input.',
    "I've been burned by agencies or past efforts that didn't deliver. I want a different approach.",
  ];

  const recommendation = {
    bookUrl: CALENDLY,
    eyebrow: "Here's where this lands",
    narrativeTemplate:
      "You're {{q1Context}}, {{q3Context}}. {{q2Context}}. Based on that, **{{primary}}** is the right starting point.",
    offerings: [
      { key: 'snapshot', name: 'Strategy Snapshot',
        tagline: "When things feel off but it's not clear why. Identifies what's driving results, what's wasting effort, and the few moves that actually matter next.",
        youGet: 'A prioritized picture of what to focus on for the next 90 days and why. Clarity on where to aim before anything gets built.',
        price: '$7,500', duration: '3-4 weeks' },
      { key: 'roadmap', name: 'Marketing Roadmap',
        tagline: "Before you invest in execution, make the decisions most teams avoid. What actually matters, what doesn't, what gets built first.",
        youGet: 'A sequenced marketing plan your team can take and execute from. Covers what to build, in what order, and why.',
        price: '$12K-$18K', duration: '4-6 weeks' },
      { key: 'blueprint', name: 'Campaign Blueprint',
        tagline: 'For when you need one specific thing to work. Designs the campaign around the right audience, message, and channels.',
        youGet: 'A fully designed campaign your team can build and launch. One audience, one goal, one motion.',
        price: '$7,500-$12K', duration: '3-4 weeks' },
      { key: 'advisory', name: 'Fractional Marketing Advisory',
        tagline: 'Ongoing strategic input as priorities shift. Keeps decisions tight and execution pointed in the right direction.',
        youGet: 'A strategic partner who shows up consistently as decisions come up. Ongoing guidance that keeps execution pointed in the right direction.',
        price: 'Starting at $3K/month', duration: '6-month minimum' },
    ],
    questions: [
      {
        fieldId: 'q1',
        context: {
          [Q1_OPTIONS[0]]: 'in early stages',
          [Q1_OPTIONS[1]]: 'ready to make a real investment in marketing',
          [Q1_OPTIONS[2]]: "already running things but not sure what's actually working",
          [Q1_OPTIONS[3]]: 'ready to build a specific campaign',
        },
        optionToOffering: {
          [Q1_OPTIONS[0]]: 'snapshot', [Q1_OPTIONS[1]]: 'roadmap',
          [Q1_OPTIONS[2]]: 'snapshot', [Q1_OPTIONS[3]]: 'blueprint',
        },
      },
      {
        fieldId: 'q2',
        context: {
          [Q2_OPTIONS[0]]: 'what you need most is clarity on where to focus first',
          [Q2_OPTIONS[1]]: 'what you need most is a plan to actually build from',
          [Q2_OPTIONS[2]]: 'what you need most is a campaign designed before anyone runs it',
          [Q2_OPTIONS[3]]: 'what you need most is consistent strategic input over time',
        },
        optionToOffering: {
          [Q2_OPTIONS[0]]: 'snapshot', [Q2_OPTIONS[1]]: 'roadmap',
          [Q2_OPTIONS[2]]: 'blueprint', [Q2_OPTIONS[3]]: 'advisory',
        },
      },
      {
        fieldId: 'q3',
        context: {
          [Q3_OPTIONS[0]]: 'wanting to start right',
          [Q3_OPTIONS[1]]: 'with a specific initiative on deck',
          [Q3_OPTIONS[2]]: "with results that aren't matching the effort",
          [Q3_OPTIONS[3]]: 'with decisions piling up',
          [Q3_OPTIONS[4]]: "after past efforts that didn't land",
        },
        optionToOffering: {
          [Q3_OPTIONS[0]]: 'snapshot', [Q3_OPTIONS[1]]: 'blueprint',
          [Q3_OPTIONS[2]]: 'roadmap',  [Q3_OPTIONS[3]]: 'advisory',
          [Q3_OPTIONS[4]]: 'snapshot',
        },
      },
    ],
    overrides: [
      {
        whenAnyAnswer: [
          { fieldId: 'q2', values: [Q2_OPTIONS[3]] },
          { fieldId: 'q3', values: [Q3_OPTIONS[3]] },
        ],
        forceOfferingKey: 'advisory',
      },
    ],
    hybrid: {
      whenAnswers: { q1: Q1_OPTIONS[2], q2: Q2_OPTIONS[0] },
      title: 'A Snapshot into a Roadmap.',
      body:
        'Your answers point to two things that work well together. First: clarity on where to focus right now. Then: a plan for what comes next that builds on that foundation. The Snapshot gets you focused and moving in 90 days. The Roadmap takes that clarity and maps out what to build from there.',
      offeringKeys: ['snapshot', 'roadmap'],
    },
    alwaysAlsoOfferingKey: 'advisory',
  };

  return {
    id: 'slide-guided-survey',
    label: 'Qualifier',
    pathGroup: 'guided',
    surveySlide: true,
    surveyId,
    blocks: [],
    surveyRecommendation: recommendation,
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
  };
}

// ─── Route 2 (direct): selection grid + per-offering detail slides ────
// Mirrors TF2 Qualifier v4: a "Which offering?" selection screen, then a
// dedicated detail slide for whichever offering is chosen — with its own
// price, duration, "you get" block, and book CTA.

interface OfferingSpec {
  key: 'snapshot' | 'roadmap' | 'blueprint' | 'advisory';
  num: string;            // "01", "02"
  numLabel: string;       // "01 / Strategy Snapshot"
  name: string;           // "Strategy Snapshot"
  shortDesc: string;      // selection card description
  tagline: string;        // detail page tagline (large)
  youGet: string;         // detail page "You get" body
  price: string;          // "$7,500" or "$12K-$18K"
  duration: string;       // "3-4 weeks"
  rangeNote?: string;     // optional gray note explaining the price range
  bookNote: string;       // small caption below the book button
}

const OFFERINGS: OfferingSpec[] = [
  {
    key: 'snapshot',
    num: '01',
    numLabel: '01 / Strategy Snapshot',
    name: 'Strategy Snapshot',
    shortDesc: 'A prioritized picture of what to focus on for the next 90 days and why. Clarity on where to aim before anything gets built.',
    tagline: "When things feel off but it's not clear why. Identifies what's driving results, what's wasting effort, and the few moves that actually matter next.",
    youGet: 'A prioritized picture of what to focus on for the next 90 days and why. Clarity on where to aim before anything gets built.',
    price: '$7,500',
    duration: '3-4 weeks',
    bookNote: 'Select this offering when you book. I look forward to the conversation.',
  },
  {
    key: 'roadmap',
    num: '02',
    numLabel: '02 / Marketing Roadmap',
    name: 'Marketing Roadmap',
    shortDesc: 'A sequenced marketing plan your team can take and execute from. Covers what to build, in what order, and why.',
    tagline: "Before you invest in execution, make the decisions most teams avoid. What actually matters, what doesn't, what gets built first.",
    youGet: 'A sequenced marketing plan your team can take and execute from. Covers what to build, in what order, and why. For when you need the whole picture before anyone starts.',
    price: '$12K-$18K',
    duration: '4-6 weeks',
    rangeNote: 'The range reflects how much ground needs to be covered, from a single focused area to the full marketing picture.',
    bookNote: 'Select this offering when you book. I look forward to the conversation.',
  },
  {
    key: 'blueprint',
    num: '03',
    numLabel: '03 / Campaign Blueprint',
    name: 'Campaign Blueprint',
    shortDesc: 'A fully designed campaign your team can build and launch. One audience, one goal, one motion.',
    tagline: 'For when you need one specific thing to work. Designs the campaign around the right audience, message, and channels.',
    youGet: 'A fully designed campaign your team can build and launch. One audience, one goal, one motion. For when you know the direction but need the campaign designed correctly before anyone runs it.',
    price: '$7,500-$12K',
    duration: '3-4 weeks',
    rangeNote: 'The range reflects how clearly the audience and goal are defined going into the work.',
    bookNote: 'Select this offering when you book. I look forward to the conversation.',
  },
  {
    key: 'advisory',
    num: '04',
    numLabel: '04 / Fractional Marketing Advisory',
    name: 'Fractional Marketing Advisory',
    shortDesc: 'A strategic partner who shows up consistently as decisions come up. Ongoing guidance that keeps execution pointed in the right direction.',
    tagline: 'Ongoing strategic input as priorities shift. Keeps decisions tight and execution pointed in the right direction.',
    youGet: 'A strategic partner who shows up consistently as decisions come up. Not a project. Not a deliverable. Ongoing guidance that keeps execution pointed in the right direction.',
    price: 'Starting at $3K/month',
    duration: '6-month minimum',
    bookNote: 'Select this offering when you book. I look forward to the conversation.',
  },
];

const detailPath = (key: OfferingSpec['key']) => `direct-${key}`;

/**
 * Selection grid: a decision slide on pathGroup='direct' that branches into
 * one of four per-offering detail pathGroups. Renders via the simple
 * decision layout — 4 cards, each with an "01 / SNAPSHOT" eyebrow, the
 * offering name, and a short description.
 */
function buildDirectSelectSlide() {
  return {
    id: 'slide-direct-select',
    label: 'Which offering are you most interested in?',
    pathGroup: 'direct',
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
    decisionSlide: true,
    decisionOptions: OFFERINGS.map((o) => ({
      id: `pick-${o.key}`,
      eyebrow: o.numLabel.toUpperCase(),
      label: o.name,
      description: o.shortDesc,
      pathGroup: detailPath(o.key),
    })),
    blocks: [],
  };
}

/**
 * Per-offering detail slide. Mirrors TF2 v4 `screen-offering-detail`:
 *  - small uppercase number/name eyebrow
 *  - large offering name
 *  - tagline
 *  - "You get" highlighted block
 *  - optional rust-bordered range note
 *  - meta pills (price · duration)
 *  - book CTA button
 *  - small caption
 */
function buildOfferingDetailSlide(o: OfferingSpec) {
  const slideId = `slide-detail-${o.key}`;
  const css = `
[data-slide-id="${slideId}"] .block-content { max-width: 640px; margin: 0 auto; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-num"] [data-editable-field="content"] { color: ${C.softTeal}; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 8px; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-name"] h2 { font-size: 28px; font-weight: 700; line-height: 1.15; letter-spacing: -0.3px; color: ${C.darkBlack}; margin: 0 0 6px; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-tagline"] [data-editable-field="content"] { font-size: 15px; color: ${C.darkTeal}; line-height: 1.65; margin: 0 0 18px; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-yg"] section { background: ${C.lightTeal} !important; border-radius: 8px !important; padding: 14px 18px !important; margin: 0 0 14px !important; border: none !important; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-yg-label"] [data-editable-field="content"] { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${C.darkTeal}; margin: 0 0 4px; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-yg-text"] [data-editable-field="content"] { font-size: 14px; color: ${C.darkBlack}; line-height: 1.6; margin: 0; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-range"] [data-editable-field="content"] { background: white; border-left: 3px solid ${C.rust}; border-radius: 0 6px 6px 0; padding: 10px 14px; margin: 0 0 14px; font-size: 13px; color: #3e5553; line-height: 1.55; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-meta"] [data-editable-field="content"] { display: flex; gap: 10px; flex-wrap: wrap; margin: 0 0 20px; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-meta"] [data-editable-field="content"] span { background: white; border: 1px solid rgba(0,86,82,0.15); border-radius: 20px; padding: 5px 14px; font-size: 13px; font-weight: 600; color: ${C.darkTeal}; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-btn"] a, [data-slide-id="${slideId}"] [data-block-id="${slideId}-btn"] > div > a {
  background: ${C.darkTeal} !important; color: ${C.offWhite} !important;
  padding: 16px 22px !important; border-radius: 10px !important; border: none !important;
  font-family: 'Roboto', sans-serif !important; font-size: 15px !important; font-weight: 700 !important;
  width: 100% !important; display: flex !important; align-items: center !important;
  justify-content: space-between !important; text-align: left !important; text-decoration: none !important;
  margin: 0 !important;
}
[data-slide-id="${slideId}"] [data-block-id="${slideId}-btn"] > div { margin: 0 !important; }
[data-slide-id="${slideId}"] [data-block-id="${slideId}-note"] [data-editable-field="content"] { font-size: 12px; color: ${C.softTeal}; text-align: center; margin: 8px 0 0; line-height: 1.5; }
`.trim();

  const blocks: any[] = [
    { id: `${slideId}-num`, type: 'text', order: 1, content: o.numLabel.toUpperCase() },
    { id: `${slideId}-name`, type: 'heading', order: 2, level: 2, content: o.name },
    { id: `${slideId}-tagline`, type: 'text', order: 3, content: o.tagline },
    {
      id: `${slideId}-yg`,
      type: 'section',
      order: 4,
      paddingTop: '14px',
      paddingBottom: '14px',
      paddingLeft: '18px',
      paddingRight: '18px',
      blocks: [
        { id: `${slideId}-yg-label`, type: 'text', order: 1, content: 'You get' },
        { id: `${slideId}-yg-text`, type: 'text', order: 2, content: o.youGet },
      ],
    },
  ];

  if (o.rangeNote) {
    blocks.push({ id: `${slideId}-range`, type: 'text', order: 5, content: o.rangeNote });
  }

  blocks.push(
    { id: `${slideId}-meta`, type: 'text', order: 6, content: `<span>${o.price}</span><span>${o.duration}</span>` },
    {
      id: `${slideId}-btn`,
      type: 'button',
      order: 7,
      text: 'Book a 30-minute call  →',
      url: CALENDLY,
      variant: 'primary',
      alignment: 'left',
      size: 'lg',
      openInNewTab: true,
    },
    { id: `${slideId}-note`, type: 'text', order: 8, content: o.bookNote },
  );

  return {
    id: slideId,
    label: o.name,
    pathGroup: detailPath(o.key),
    customCss: css,
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
    blocks,
  };
}

// ─── Final book-a-call slide (main sequence — both paths converge here) ─
function buildBookSlide() {
  const css = `
[data-slide-id="slide-book"] .block-content { max-width: 640px; margin: 0 auto; }
[data-block-id="book-brand"] [data-editable-field="content"] { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 28px; }
[data-block-id="book-brand"] [data-editable-field="content"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rust); flex-shrink: 0; }
[data-block-id="book-heading"] h2 { margin: 0 0 14px !important; }
[data-block-id="book-rule"] hr { border: none; background: var(--rust); height: 3px; width: 44px; max-width: 44px; margin: 20px 0; border-radius: 2px; }
[data-block-id="book-btn"] a, [data-block-id="book-btn"] > div > a {
  background: var(--dark-teal) !important; color: var(--off-white) !important;
  padding: 18px 24px !important; border-radius: 12px !important; border: none !important;
  font-family: 'Roboto', sans-serif !important; font-size: 17px !important; font-weight: 700 !important;
  width: 100% !important; display: flex !important; align-items: center !important;
  justify-content: space-between !important; text-align: left !important; text-decoration: none !important;
  margin-top: 0 !important;
}
[data-block-id="book-btn"] > div { margin-top: 0 !important; }
`.trim();

  return {
    id: 'slide-book',
    label: 'Book a call',
    customCss: css,
    pageSettings: { backgroundColor: C.lightTeal, color: C.darkBlack, fontFamily: 'Roboto' },
    blocks: [
      { id: 'book-brand', type: 'text', order: 1, content: 'CY STRATEGIES',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '4px', textTransform: 'uppercase' } },
      { id: 'book-eyebrow', type: 'text', order: 2, content: 'READY TO TALK',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '3px', margin: '0 0 14px' } },
      { id: 'book-heading', type: 'heading', order: 3, level: 2, content: "Let's talk it through.",
        style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '36px', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px' } },
      { id: 'book-rule', type: 'divider', order: 4, style: { borderColor: C.rust } },
      { id: 'book-body', type: 'text', order: 5,
        content: "Book a 30-minute call and we'll figure out whether working together makes sense. No obligation, no pitch — just a clear-eyed take on where I think I can help.",
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '18px', fontWeight: '300', lineHeight: '1.55', maxWidth: '560px', margin: '0 0 28px' } },
      { id: 'book-btn', type: 'button', order: 6,
        text: 'Book a 30-minute call  →', url: CALENDLY,
        variant: 'primary', alignment: 'left', size: 'lg', openInNewTab: true },
    ],
  };
}

function buildSlides(surveyId: number) {
  return [
    buildWelcomeSlide(),                              // main — decision (guided/direct)
    buildGuidedSurveySlide(surveyId),                 // pathGroup='guided'
    buildDirectSelectSlide(),                         // pathGroup='direct' — nested decision (snap/road/blue/adv)
    ...OFFERINGS.map(buildOfferingDetailSlide),       // pathGroups 'direct-<key>' — per-offering detail
    buildBookSlide(),                                 // main — final book CTA
  ];
}

async function main() {
  const { db } = await import('../../../lib/db');
  const { pitchDecks, clients, users, surveys } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [user] = await db.select().from(users).where(eq(users.email, CY_STRATEGIES_USER_EMAIL)).limit(1);
  if (!user) {
    console.error(`CY Strategies user not found (${CY_STRATEGIES_USER_EMAIL}).`);
    process.exit(1);
  }
  const [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) {
    console.error('CY Strategies client not found.');
    process.exit(1);
  }
  console.log(`Resolved: user ${user.id}, client ${client.id}`);

  // Use existing cy-strategy-qualifier survey (created by pitch-deck-tf3 migration).
  const [survey] = await db.select().from(surveys)
    .where(and(eq(surveys.clientId, client.id), eq(surveys.slug, SURVEY_SLUG)))
    .limit(1);
  if (!survey) {
    console.error(`Survey '${SURVEY_SLUG}' not found. Run create-pitch-deck-tf3.ts first.`);
    process.exit(1);
  }
  console.log(`Reusing survey: ID ${survey.id}`);

  const slides = buildSlides(survey.id);
  const theme = {
    primaryColor: C.darkTeal,
    // Use dark-teal for accent so prominent UI (decision slide icons,
    // Continue links, survey * required marker, hover borders) reads as
    // green like the figure-out-your-fit deck. Rust stays available as an
    // explicit inline-style accent on book-rule etc.
    accentColor: C.darkTeal,
    backgroundColor: C.offWhite,
    textColor: C.darkBlack,
    headingFont: 'Roboto',
    bodyFont: 'Roboto',
    customCss: DECK_GLOBAL_CSS,
  };
  const title = 'CY Strategies — Figure Out Your Fit';
  const description = 'Choose-your-own-adventure qualifier: guided questions or direct offerings pick.';

  const [existingDeck] = await db.select().from(pitchDecks)
    .where(and(eq(pitchDecks.clientId, client.id), eq(pitchDecks.slug, DECK_SLUG)))
    .limit(1);

  let deckId: number;
  if (existingDeck) {
    await db.update(pitchDecks)
      .set({
        title, description, slides: slides as any, theme,
        formatVersion: 2, status: 'published', updatedAt: new Date(),
      })
      .where(eq(pitchDecks.id, existingDeck.id));
    deckId = existingDeck.id;
    console.log(`Pitch deck updated: ID ${deckId}`);
  } else {
    const [inserted] = await db.insert(pitchDecks).values({
      clientId: client.id,
      title, slug: DECK_SLUG, description,
      status: 'published',
      slides: slides as any,
      theme,
      formatVersion: 2,
      createdBy: user.id,
    }).returning();
    deckId = inserted.id;
    console.log(`Pitch deck created: ID ${deckId}`);
  }

  console.log(`\nDeck slug:   ${DECK_SLUG}`);
  console.log(`Survey slug: ${SURVEY_SLUG} (shared with pitch-deck-2)`);
  console.log(`\nView:  /pitch-deck/${DECK_SLUG}`);
  console.log('\n=== DONE ===');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
