import * as dotenv from 'dotenv';
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
function buildWelcomeSlide() {
  const css = `
[data-slide-id="slide-welcome"] .block-content { max-width: 680px; margin: 0 auto; }
`.trim();

  return {
    id: 'slide-welcome',
    label: 'Welcome',
    customCss: css,
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
    // Decision slide — 2 options, each picks a pathGroup
    decisionSlide: true,
    decisionOptions: [
      {
        id: 'route-guided',
        label: 'Help me figure out what fits',
        description: 'A few questions to map your situation to the right offering. ~2 minutes.',
        icon: 'explore',
        pathGroup: 'guided',
      },
      {
        id: 'route-direct',
        label: 'I know the direction I want to explore',
        description: 'Show me the offerings and let me pick the one that makes sense.',
        icon: 'list',
        pathGroup: 'direct',
      },
    ],
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

// ─── Route 2 (direct): four offerings grid ────────────────────────────
const SNAPSHOT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const ROADMAP_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>';
const BLUEPRINT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
const ADVISORY_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';

function offeringDetailCard(idPrefix: string, num: string, label: string, title: string, desc: string, youGet: string, price: string, duration: string, iconSvg: string) {
  return {
    id: idPrefix,
    type: 'section',
    order: 1,
    paddingTop: '22px',
    paddingBottom: '22px',
    paddingLeft: '24px',
    paddingRight: '24px',
    backgroundColor: '#ffffff',
    blocks: [
      { id: `${idPrefix}-bgnum`, type: 'text', order: 1, content: num,
        style: { color: C.lightTeal, fontFamily: 'Roboto', fontSize: '38px', fontWeight: '900', lineHeight: '1' } },
      { id: `${idPrefix}-icon`, type: 'text', order: 2, content: iconSvg,
        style: { color: C.darkTeal } },
      { id: `${idPrefix}-num`, type: 'text', order: 3, content: label,
        style: { color: C.softTeal, fontFamily: 'Roboto', fontSize: '10px', fontWeight: '700', letterSpacing: '2.5px', textTransform: 'uppercase', margin: '6px 0 4px' } },
      { id: `${idPrefix}-title`, type: 'heading', order: 4, level: 4, content: title,
        style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '15px', fontWeight: '700', lineHeight: '1.2' } },
      { id: `${idPrefix}-desc`, type: 'text', order: 5, content: desc,
        style: { color: '#4a5c5a', fontFamily: 'Roboto', fontSize: '12.5px', lineHeight: '1.55' } },
      { id: `${idPrefix}-get`, type: 'text', order: 6, content: `You get: ${youGet}`,
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11.5px', fontWeight: '500' } },
      { id: `${idPrefix}-meta`, type: 'text', order: 7, content: `${price} · ${duration}`,
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '12px', fontWeight: '600' } },
    ],
  };
}

function buildDirectOfferingsSlide() {
  const css = `
[data-slide-id="slide-direct-offerings"] .block-content { max-width: 1000px; margin: 0 auto; }
[data-block-id="direct-brand"] [data-editable-field="content"] { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 28px; }
[data-block-id="direct-brand"] [data-editable-field="content"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rust); flex-shrink: 0; }
[data-block-id="direct-heading"] h2 { margin: 0 0 10px !important; }
[data-block-id="direct-intro"] [data-editable-field="content"] { margin: 0 0 18px; }
/* Columns wrapper — kill default py-8 my-8 */
[data-block-id="direct-grid"] .py-8 { padding: 0 !important; }
[data-block-id="direct-grid"] .my-8 { margin: 0 !important; }
[data-block-id="direct-grid"] .flex.flex-row { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 16px !important; }
[data-block-id="direct-grid"] [data-col-stacks-never] { width: auto !important; flex: 1 1 auto !important; }
/* Card shells */
[data-block-id^="dir-"][data-block-type="section"] section { border: 1px solid rgba(0,86,82,0.12) !important; border-left: 4px solid var(--dark-teal) !important; border-radius: 0 12px 12px 0 !important; box-shadow: 0 2px 10px rgba(0,86,82,0.06); position: relative !important; overflow: hidden !important; }
[data-block-id^="dir-"][data-block-type="section"] { margin: 0 !important; }
[data-block-id$="-bgnum"] { position: absolute !important; top: 6px; right: 14px; z-index: 0; pointer-events: none; user-select: none; margin: 0 !important; }
[data-block-id$="-icon"] [data-editable-field="content"] svg { display: block; }
[data-block-id$="-title"] h4 { margin: 0 !important; padding-right: 40px; }
[data-block-id$="-get"] [data-editable-field="content"] { background: var(--light-teal); padding: 6px 10px; border-radius: 5px; display: inline-block; line-height: 1.4; margin-top: 4px; }
[data-block-id$="-meta"] [data-editable-field="content"] { margin-top: 6px; }
`.trim();

  return {
    id: 'slide-direct-offerings',
    label: 'Offerings',
    pathGroup: 'direct',
    customCss: css,
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
    blocks: [
      { id: 'direct-brand', type: 'text', order: 1, content: 'CY STRATEGIES',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '4px', textTransform: 'uppercase' } },
      { id: 'direct-eyebrow', type: 'text', order: 2, content: 'FOUR WAYS TO WORK TOGETHER',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '3px', margin: '0 0 14px' } },
      { id: 'direct-heading', type: 'heading', order: 3, level: 2, content: 'Pick the one that fits.',
        style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '36px', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px' } },
      { id: 'direct-intro', type: 'text', order: 4, content: "Each covers a different situation. If none feel right, book a call and we'll sort it out together on the next slide.",
        style: { color: '#5a6b69', fontFamily: 'Roboto', fontSize: '14px', lineHeight: '1.6', maxWidth: '560px' } },
      {
        id: 'direct-grid',
        type: 'columns',
        order: 5,
        gap: 'md',
        stackOnMobile: true,
        columns: [
          {
            id: 'direct-col-left', width: '50%', verticalAlign: 'top', padding: 'none',
            blocks: [
              offeringDetailCard('dir-01', '01', '01 / SNAPSHOT', 'Strategy Snapshot', "A prioritized picture of what to focus on for the next 90 days and why. Clarity on where to aim before anything gets built.",
                'A 2-page prioritized plan with 3 initiatives to act on immediately', '$7,500', '3-4 weeks', SNAPSHOT_ICON),
              { id: 'direct-spacer-left', type: 'spacer', order: 2, height: 'xs' },
              offeringDetailCard('dir-03', '03', '03 / BLUEPRINT', 'Campaign Blueprint', 'A fully designed campaign your team can build and launch. One audience, one goal, one motion.',
                'A build-ready campaign structure with audience, message, channels, and measurement', '$7,500-$12K', '3-4 weeks', BLUEPRINT_ICON),
            ],
          },
          {
            id: 'direct-col-right', width: '50%', verticalAlign: 'top', padding: 'none',
            blocks: [
              offeringDetailCard('dir-02', '02', '02 / ROADMAP', 'Marketing Roadmap', "A sequenced marketing plan your team can take and execute from. Covers what to build, in what order, and why.",
                'A sequenced, execution-ready roadmap your team can follow with confidence', '$12K-$18K', '4-6 weeks', ROADMAP_ICON),
              { id: 'direct-spacer-right', type: 'spacer', order: 2, height: 'xs' },
              offeringDetailCard('dir-04', '04', '04 / ADVISORY', 'Fractional Advisory', 'A strategic partner who shows up consistently as decisions come up. Ongoing guidance that keeps execution pointed in the right direction.',
                'Consistent strategic input that keeps execution connected to the plan', 'Starting at $3K/mo', '6-month min', ADVISORY_ICON),
            ],
          },
        ],
      },
    ],
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
    buildWelcomeSlide(),            // main — decision
    buildGuidedSurveySlide(surveyId), // pathGroup='guided'
    buildDirectOfferingsSlide(),    // pathGroup='direct'
    buildBookSlide(),               // main — book CTA (after any path)
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
