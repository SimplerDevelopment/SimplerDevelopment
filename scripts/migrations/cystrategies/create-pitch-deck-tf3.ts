import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Creates a second CY Strategies pitch deck (slug: pitch-deck-2) based on the
 * "TF1 Deck v8" HTML, with an integrated qualifier survey (TF2 v4 logic).
 *
 * Leaves the existing pitch-deck-1 in place.
 *
 * Palette: TF1 v8
 *   dark teal  #005652
 *   soft teal  #9FB7B1
 *   off white  #F6F5F2
 *   dark black #171615
 *   light teal #E2EDEA
 *   rust       #C46A3D
 *
 * Survey: 3 qualifier questions + 2 conditional scope follow-ups.
 * Static thank-you screen (no dynamic recommendation logic for now).
 */

const CALENDLY = 'https://calendly.com/cody-cystrategies/30min';
const CY_STRATEGIES_USER_EMAIL = 'cystrategies@simplerdevelopment.com';
const HEADSHOT_URL = 'https://cystrategies.co/assets/images/image08.jpg';

const DECK_SLUG = 'pitch-deck-2';
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
  cardBg:    '#E8F0EE',
};

// ─── Q1..Q3 + two conditional scope follow-ups ───
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

const SCOPE_ROADMAP_OPTIONS = [
  'One specific area: a channel, a segment, or a particular part of the business.',
  'The whole marketing picture, channel by channel and audience by audience.',
  'A specific phase we’re in right now: launch, growth, or reset.',
  "Not sure yet. That's part of what I need clarity on.",
];

const SCOPE_BLUEPRINT_OPTIONS = [
  "A specific type of prospect or industry we're trying to reach.",
  'Existing customers or past leads we want to re-engage.',
  "A new market or audience we haven't targeted before.",
  'I have an audience in mind but need help defining it better.',
];

function buildSurveyFields() {
  return [
    {
      id: 'heading-q1',
      type: 'heading' as const,
      label: 'A few quick questions to map your situation to the right starting point.',
      placeholder: '',
      helpText: 'Takes about two minutes. Your answers help me prepare before we talk.',
      required: false,
      options: [],
      order: 0,
      page: 0,
    },
    {
      id: 'q1',
      type: 'radio' as const,
      label: 'Which of these feels closest to where you are with marketing right now?',
      placeholder: '',
      helpText: 'Pick the one that fits best.',
      required: true,
      options: Q1_OPTIONS,
      order: 1,
      page: 0,
    },
    {
      id: 'q2',
      type: 'radio' as const,
      label: 'What would be most useful to walk away with?',
      placeholder: '',
      helpText: 'This helps narrow down which offering fits best.',
      required: true,
      options: Q2_OPTIONS,
      order: 2,
      page: 1,
    },
    {
      id: 'q3',
      type: 'radio' as const,
      label: "What's driving the need for outside help right now?",
      placeholder: '',
      helpText: 'Pick the one that resonates most.',
      required: true,
      options: Q3_OPTIONS,
      order: 3,
      page: 2,
    },
    // Conditional scope follow-up — only when Q2 chose the roadmap-style answer
    {
      id: 'scope_roadmap',
      type: 'radio' as const,
      label: 'How much ground do we need to cover?',
      placeholder: '',
      helpText: 'This helps narrow down which end of the price range applies.',
      required: false,
      options: SCOPE_ROADMAP_OPTIONS,
      showIf: { fieldId: 'q2', values: [Q2_OPTIONS[1]] },
      order: 4,
      page: 3,
    },
    // Conditional scope follow-up — only when Q2 chose the campaign/blueprint answer
    {
      id: 'scope_blueprint',
      type: 'radio' as const,
      label: 'Who is this campaign for?',
      placeholder: '',
      helpText: 'This helps narrow down which end of the price range applies.',
      required: false,
      options: SCOPE_BLUEPRINT_OPTIONS,
      showIf: { fieldId: 'q2', values: [Q2_OPTIONS[2]] },
      order: 5,
      page: 3,
    },
  ];
}

const SURVEY_PAGES = [
  { title: 'Where you are' },
  { title: 'What you need' },
  { title: "What's driving this" },
  { title: 'Scope' },
];

// ─── Slide builders ──────────────────────────────────────────────────
// Each pitch slide is a single text block whose content is the raw HTML
// from the TF1 v8 file, paired with per-slide `customCss` ported from the
// same source. The block renderer strips most inline styling (e.g. <hr>
// dividers ignore borderWidth, headings hard-code margins), so this
// approach gives us byte-for-byte parity with the standalone HTML while
// still living inside the portal's pitch-deck system.

const HTML_RESET = `
  white-space: normal;
`;

const DECK_GLOBAL_CSS = `
.deck-root {
  --dark-teal:  ${'#005652'};
  --soft-teal:  ${'#9FB7B1'};
  --off-white:  ${'#F6F5F2'};
  --dark-black: ${'#171615'};
  --light-teal: ${'#E2EDEA'};
  --rust:       ${'#C46A3D'};
}
/* Let our HTML control its own layout — strip the inherited Tailwind
   whitespace handling and outer padding from text-block wrappers and
   the slide-stage container. */
.deck-root .slide-stage { padding: 0 !important; align-items: stretch; }
.deck-root .slide-stage [data-editable-field="content"] { ${HTML_RESET} }

/* Common building blocks reused across slides ----------------------- */
.cy-slide { width: 100%; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 52px 80px 92px; box-sizing: border-box; position: relative; }
.cy-slide > .cy-content { width: 100%; max-width: 960px; }

.cy-wordmark { display: inline-flex; align-items: center; gap: 10px; font-family: 'Roboto', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 40px; }
.cy-wordmark::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rust); flex-shrink: 0; }

.cy-eyebrow { font-family: 'Roboto', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 14px; }
.cy-headline { font-family: 'Roboto', sans-serif; font-size: 36px; font-weight: 700; line-height: 1.15; letter-spacing: -0.4px; margin-bottom: 14px; }
.cy-rule { width: 44px; height: 3px; background: var(--rust); border-radius: 2px; margin: 20px 0; }

/* Reset stray block-renderer styles that interfere */
.deck-root .slide-stage h1, .deck-root .slide-stage h2, .deck-root .slide-stage h3 { margin: 0; }
.deck-root .slide-stage p { margin: 0; }
.deck-root .slide-stage ul { margin: 0; padding: 0; list-style: none; }
`;

function buildCoverSlide() {
  const html = `
<div class="cy-slide cover">
  <div class="cy-content cover-grid">
    <div class="cover-left">
      <div class="cy-wordmark cover-wm">CY Strategies</div>
      <div class="cy-eyebrow cover-eb">Marketing Strategy Consultant</div>
      <h1 class="cover-headline">Most companies don't have a marketing problem.</h1>
      <h2 class="cover-punchline">They have a decision problem.</h2>
      <div class="cy-rule"></div>
      <div class="cover-intro">Hi, I'm Cody.</div>
      <p class="cover-body">I figure out what's actually driving growth, what isn't, and what to do about it. So your team stops guessing and starts building the right things.</p>
      <div class="cover-about">
        <p>Most companies don't need more marketing. They need to make better decisions about what's worth doing in the first place.</p>
        <p>This is a quick look at how I think and whether working together would make sense.</p>
      </div>
      <div class="cover-time">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
        About 5 minutes
      </div>
    </div>
    <div class="cover-right">
      <div class="headshot-card"><img src="${HEADSHOT_URL}" alt="Cody York, CY Strategies"></div>
    </div>
  </div>
</div>`.trim();

  const css = `
.cover { background: var(--dark-teal); }
.cover .cy-content { max-width: 1020px; }
.cover-grid { display: grid; grid-template-columns: 1fr 280px; gap: 52px; align-items: center; }
.cover .cy-wordmark { color: rgba(255,255,255,0.95); margin-bottom: 28px; }
.cover .cy-eyebrow { color: var(--soft-teal); margin-bottom: 12px; }
.cover-headline { font-family: 'Roboto', sans-serif; font-size: 40px; font-weight: 900; line-height: 1.08; letter-spacing: -0.5px; color: var(--off-white); margin: 0 0 6px; }
.cover-punchline { font-family: 'Roboto', sans-serif; font-size: 40px; font-weight: 300; line-height: 1.08; letter-spacing: -0.5px; color: var(--light-teal); margin: 0; }
.cover .cy-rule { margin: 20px 0 16px; }
.cover-intro { font-size: 13px; font-weight: 700; letter-spacing: 1.5px; color: var(--soft-teal); margin-bottom: 12px; text-transform: none; }
.cover-body { font-size: 16px; color: var(--light-teal); line-height: 1.65; max-width: 460px; margin: 0 0 20px; }
.cover-about { font-size: 14px; color: var(--soft-teal); line-height: 1.8; max-width: 460px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 18px; margin-top: 4px; }
.cover-about p { margin: 0 0 8px; }
.cover-about p:last-child { margin-bottom: 0; }
.cover-time { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--soft-teal); background: rgba(255,255,255,0.07); padding: 7px 14px; border-radius: 20px; margin-top: 14px; }
.cover-time svg { opacity: 0.7; }
.headshot-card { width: 280px; height: 348px; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.45); margin: 0 auto; }
.headshot-card img { width: 100%; height: 100%; object-fit: cover; object-position: center top; display: block; }
`.trim();

  return {
    id: 'slide-cover',
    label: 'Cover',
    blocks: [{ id: 'cover-html', type: 'text', order: 1, content: html, style: {} }],
    customCss: css,
    pageSettings: { backgroundColor: C.darkTeal, color: C.white, fontFamily: 'Roboto' },
  };
}

function buildHowIThinkSlide() {
  const html = `
<div class="cy-slide think">
  <div class="cy-content">
    <div class="cy-wordmark">CY Strategies</div>
    <div class="cy-eyebrow">How I Think About This</div>
    <h2 class="cy-headline">The gap isn't in execution. It's in understanding the actual problem.</h2>
    <div class="cy-rule"></div>
    <div class="think-paras">
      <p>Most companies know where they want to go.</p>
      <p>Very few know what's actually going to get them there.</p>
    </div>
    <div class="quote-block">
      <div class="quote-text">Take a website.</div>
      <div class="quote-text qb-mt">When someone says "it's not working," that usually means one of three things:</div>
      <ul class="quote-list">
        <li>Not enough people are finding it</li>
        <li>People find it but don't take action</li>
        <li>People don't understand what you offer or why it matters</li>
      </ul>
      <div class="quote-closing">Three different problems. Three completely different solutions. Most teams pick one and start spending. Strategy tells you which one you actually have. Before the spending starts. That applies to messaging, campaigns, audiences, and channels.</div>
    </div>
  </div>
</div>`.trim();

  const css = `
.think { background: var(--off-white); }
.think .cy-wordmark { color: var(--dark-teal); }
.think .cy-eyebrow { color: var(--dark-teal); }
.think .cy-headline { color: var(--dark-black); font-size: 36px; }
.think-paras { max-width: 680px; }
.think-paras p { font-size: 18px; color: #3a4a49; line-height: 1.7; margin: 0; }
.think-paras p + p { margin-top: 12px; }
.quote-block { margin-top: 22px; padding: 22px 26px; border-left: 4px solid var(--dark-teal); border-radius: 0 10px 10px 0; background: rgba(0,86,82,0.05); }
.quote-text { font-size: 17px; line-height: 1.7; color: var(--dark-black); }
.quote-text.qb-mt { margin-top: 8px; }
.quote-list { margin: 10px 0 12px; padding: 0; list-style: none; }
.quote-list li { font-size: 16px; line-height: 1.65; padding: 3px 0 3px 20px; position: relative; color: #3a4a49; }
.quote-list li::before { content: '•'; position: absolute; left: 4px; color: var(--dark-teal); font-weight: 700; }
.quote-closing { font-size: 16px; font-weight: 500; color: var(--dark-black); margin-top: 6px; line-height: 1.5; }
`.trim();

  return {
    id: 'slide-how-i-think',
    label: 'How I Think',
    blocks: [{ id: 'think-html', type: 'text', order: 1, content: html, style: {} }],
    customCss: css,
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
  };
}

function buildStrategySlide() {
  return {
    id: 'slide-strategy',
    label: 'What Good Strategy Is',
    blocks: [
      {
        id: 'strategy-section',
        type: 'section',
        order: 1,
        backgroundColor: C.lightTeal,
        paddingTop: '0px',
        paddingBottom: '0px',
        paddingLeft: '0px',
        paddingRight: '0px',
        maxWidth: '900px',
        blocks: [
          { id: 'strategy-brand', type: 'text', order: 1, content: '●&nbsp;&nbsp;CY STRATEGIES',
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.25em', margin: '0 0 36px 0' } },
          { id: 'strategy-eyebrow', type: 'text', order: 2, content: 'WHAT STRATEGY ACTUALLY DOES',
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.2em', margin: '0 0 14px 0' } },
          { id: 'strategy-heading', type: 'heading', order: 3, level: 2,
            content: "A strategy isn't a plan. It's a set of decisions that make a plan worth following.",
            style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '2.25rem', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px', margin: '0 0 14px 0' } },
          { id: 'strategy-rule', type: 'divider', order: 4,
            style: { borderColor: C.rust, borderWidth: '3px', maxWidth: '44px', margin: '20px 0' } },
          { id: 'strategy-p1', type: 'text', order: 5,
            content: "Most teams can tell you what they're going to do. Very few can tell you why those things and not something else.",
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '1.125rem', lineHeight: '1.72', margin: '0 0 16px 0' } },
          { id: 'strategy-p2', type: 'text', order: 6,
            content: 'Good strategy answers the questions most teams skip. Who exactly are we trying to reach? What has to be true before they act? Which message, which channel, at which moment?',
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '1.125rem', lineHeight: '1.72', margin: '0 0 16px 0' } },
          { id: 'strategy-p3', type: 'text', order: 7,
            content: 'Without those answers, a plan is just activity. Strategy is the thinking that makes the activity matter.',
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '1.125rem', lineHeight: '1.72' } },
        ],
      },
    ],
    pageSettings: { backgroundColor: C.lightTeal, color: C.darkBlack, fontFamily: 'Roboto' },
  };
}

function buildOfferingCard(
  num: string,
  label: string,
  title: string,
  desc: string,
  youGet: string,
  idPrefix: string,
) {
  return {
    id: `${idPrefix}-card`,
    type: 'section',
    order: 1,
    backgroundColor: C.white,
    paddingTop: '22px',
    paddingBottom: '22px',
    paddingLeft: '24px',
    paddingRight: '24px',
    style: { borderLeft: `4px solid ${C.darkTeal}`, borderRadius: '0 12px 12px 0', border: `1px solid rgba(0,86,82,0.12)`, boxShadow: '0 2px 10px rgba(0,86,82,0.06)' },
    blocks: [
      { id: `${idPrefix}-bgnum`, type: 'text', order: 1, content: num, alignment: 'right',
        style: { color: C.lightTeal, fontFamily: 'Roboto', fontSize: '2.375rem', fontWeight: '900', lineHeight: '1', margin: '0 0 -28px 0' } },
      { id: `${idPrefix}-label`, type: 'text', order: 2, content: label,
        style: { color: C.softTeal, fontFamily: 'Roboto', fontSize: '0.625rem', fontWeight: '700', letterSpacing: '0.2em', margin: '0 0 6px 0' } },
      { id: `${idPrefix}-title`, type: 'heading', order: 3, level: 4, content: title,
        style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '0.9375rem', fontWeight: '700', lineHeight: '1.2', margin: '0 0 8px 0' } },
      { id: `${idPrefix}-desc`, type: 'text', order: 4, content: desc,
        style: { color: '#4a5c5a', fontFamily: 'Roboto', fontSize: '0.78125rem', lineHeight: '1.55', margin: '0 0 10px 0' } },
      { id: `${idPrefix}-get`, type: 'text', order: 5, content: `You get: ${youGet}`,
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.71875rem', fontWeight: '500', backgroundColor: C.lightTeal, padding: '5px 10px', borderRadius: '5px', display: 'inline-block', lineHeight: '1.4' } },
    ],
  };
}

function buildFourOfferingsSlide() {
  return {
    id: 'slide-offerings',
    label: 'Four Offerings',
    blocks: [
      {
        id: 'offerings-section',
        type: 'section',
        order: 1,
        backgroundColor: C.offWhite,
        paddingTop: '0px',
        paddingBottom: '0px',
        paddingLeft: '0px',
        paddingRight: '0px',
        maxWidth: '1000px',
        blocks: [
          { id: 'offerings-brand', type: 'text', order: 1, content: '●&nbsp;&nbsp;CY STRATEGIES',
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.25em', margin: '0 0 36px 0' } },
          { id: 'offerings-eyebrow', type: 'text', order: 2, content: 'FOUR WAYS TO WORK TOGETHER',
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.2em', margin: '0 0 14px 0' } },
          { id: 'offerings-heading', type: 'heading', order: 3, level: 2,
            content: "Here's what that looks like in practice.",
            style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '2.25rem', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px', margin: '0 0 22px 0' } },
          {
            id: 'offerings-grid',
            type: 'columns',
            order: 4,
            gap: 'md',
            stackOnMobile: true,
            columns: [
              {
                id: 'offerings-col-left',
                width: '50%',
                verticalAlign: 'top',
                padding: 'sm',
                blocks: [
                  buildOfferingCard('01', '01 / SNAPSHOT', 'Strategy Snapshot: 90-Day Priorities',
                    "When things feel off but it's not clear why. Identifies what's driving results, what's wasting time, and the few moves that actually matter next.",
                    'A focused 90-day plan with clear priorities your team can act on immediately',
                    'off-01'),
                  { id: 'off-spacer-1', type: 'spacer', order: 2, height: 'sm' },
                  buildOfferingCard('03', '03 / BLUEPRINT', 'Campaign Blueprint',
                    'For when you need one specific thing to work. Designs the campaign around the right audience, message, and channels. Built for your team to execute without guessing.',
                    'A complete campaign structure ready to build and launch',
                    'off-03'),
                ],
              },
              {
                id: 'offerings-col-right',
                width: '50%',
                verticalAlign: 'top',
                padding: 'sm',
                blocks: [
                  buildOfferingCard('02', '02 / ROADMAP', 'Marketing Roadmap',
                    "Before you invest in execution, we make the decisions most teams avoid. What actually matters, what doesn't, what gets built first.",
                    'A sequenced roadmap your team or partners can execute with confidence',
                    'off-02'),
                  { id: 'off-spacer-2', type: 'spacer', order: 2, height: 'sm' },
                  buildOfferingCard('04', '04 / ADVISORY', 'Fractional Marketing Advisory',
                    'Ongoing strategic input as priorities shift. Keeps decisions tight and execution pointed in the right direction. Strategy only.',
                    'Consistent guidance that keeps marketing aligned with what actually matters',
                    'off-04'),
                ],
              },
            ],
          },
        ],
      },
    ],
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
  };
}

function buildClientCard(initials: string, name: string, story: string, proof: string, idPrefix: string) {
  return {
    id: `${idPrefix}-card`,
    type: 'section',
    order: 1,
    backgroundColor: C.white,
    paddingTop: '16px',
    paddingBottom: '16px',
    paddingLeft: '20px',
    paddingRight: '20px',
    style: { borderLeft: `4px solid ${C.darkTeal}`, borderRadius: '0 12px 12px 0', border: '1px solid rgba(0,86,82,0.1)', boxShadow: '0 2px 10px rgba(0,86,82,0.06)' },
    blocks: [
      {
        id: `${idPrefix}-row`,
        type: 'columns',
        order: 1,
        gap: 'sm',
        stackOnMobile: false,
        columns: [
          {
            id: `${idPrefix}-badge-col`,
            width: '48px',
            verticalAlign: 'top',
            padding: 'none',
            blocks: [
              { id: `${idPrefix}-badge`, type: 'text', order: 1, content: initials, alignment: 'center',
                style: { backgroundColor: C.darkTeal, color: C.offWhite, fontFamily: 'Roboto', fontSize: '0.6875rem', fontWeight: '900', letterSpacing: '0.0625em', width: '36px', height: '36px', lineHeight: '36px', borderRadius: '8px', textAlign: 'center' } },
            ],
          },
          {
            id: `${idPrefix}-text-col`,
            width: 'auto',
            verticalAlign: 'top',
            padding: 'none',
            blocks: [
              { id: `${idPrefix}-name`, type: 'text', order: 1, content: name,
                style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.15em', margin: '0 0 4px 0' } },
              { id: `${idPrefix}-story`, type: 'text', order: 2, content: story,
                style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.90625rem', lineHeight: '1.65', margin: '0 0 8px 0' } },
              { id: `${idPrefix}-proof`, type: 'text', order: 3, content: proof,
                style: { color: C.rust, fontFamily: 'Roboto', fontSize: '0.75rem', fontWeight: '500', backgroundColor: 'rgba(196,106,61,0.08)', border: '1px solid rgba(196,106,61,0.2)', padding: '3px 10px', borderRadius: '5px', display: 'inline-block' } },
            ],
          },
        ],
      },
    ],
  };
}

function buildRecentWorkSlide() {
  return {
    id: 'slide-work',
    label: 'Recent Work',
    blocks: [
      {
        id: 'work-section',
        type: 'section',
        order: 1,
        backgroundColor: C.offWhite,
        paddingTop: '0px',
        paddingBottom: '0px',
        paddingLeft: '0px',
        paddingRight: '0px',
        maxWidth: '900px',
        blocks: [
          { id: 'work-brand', type: 'text', order: 1, content: '●&nbsp;&nbsp;CY STRATEGIES',
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.25em', margin: '0 0 36px 0' } },
          { id: 'work-eyebrow', type: 'text', order: 2, content: 'RECENT WORK',
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.2em', margin: '0 0 14px 0' } },
          { id: 'work-heading', type: 'heading', order: 3, level: 2, content: 'A few examples.',
            style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '2.25rem', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px', margin: '0 0 18px 0' } },
          buildClientCard('PC', 'POST CAPTAIN CONSULTING',
            'A niche B2B firm that had grown on reputation and needed a foundation to grow intentionally. Work started with positioning and story, led to a full website rebuild, and established a clearer model for generating business beyond referrals.',
            'Clear positioning and a foundation built for intentional growth',
            'pc'),
          { id: 'work-spacer-1', type: 'spacer', order: 5, height: 'xs' },
          buildClientCard('CC', 'CROSSOVER CAPITAL',
            'A financial advisory firm targeting a specific audience with a message that needed to land exactly right. Narrowed the target, rebuilt the positioning, and structured the campaign and outreach around what would actually resonate. An attorney who said he never clicks ads reached out after clicking this one.',
            'Right strategy, right message, right audience',
            'cc'),
          { id: 'work-spacer-2', type: 'spacer', order: 7, height: 'xs' },
          buildClientCard('JM', 'JM LAW GROUP',
            'A franchise attorney without a consistent system for reaching the right referral sources. Built a LinkedIn strategy and outreach process targeting brokers and franchisors, with content and templates to make it consistent and repeatable.',
            'Focused outreach, better relationships, more consistency',
            'jm'),
        ],
      },
    ],
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
  };
}

function buildCtaSlide(targetVisibleSlide: number) {
  return {
    id: 'slide-cta',
    label: "What's Next",
    blocks: [
      {
        id: 'cta-section',
        type: 'section',
        order: 1,
        backgroundColor: C.lightTeal,
        paddingTop: '0px',
        paddingBottom: '0px',
        paddingLeft: '0px',
        paddingRight: '0px',
        maxWidth: '760px',
        blocks: [
          { id: 'cta-brand', type: 'text', order: 1, content: '●&nbsp;&nbsp;CY STRATEGIES',
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.25em', margin: '0 0 36px 0' } },
          { id: 'cta-eyebrow', type: 'text', order: 2, content: "WHAT'S NEXT",
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.2em', margin: '0 0 14px 0' } },
          { id: 'cta-heading', type: 'heading', order: 3, level: 2, content: 'Two ways to move forward.',
            style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '2.25rem', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px', margin: '0 0 14px 0' } },
          { id: 'cta-rule', type: 'divider', order: 4,
            style: { borderColor: C.rust, borderWidth: '3px', maxWidth: '44px', margin: '20px 0' } },
          { id: 'cta-body', type: 'text', order: 5,
            content: "If you want a clearer picture of which offering fits before we talk, walk through the three questions. If you'd rather just have a conversation, that works too.",
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '1.125rem', fontWeight: '300', lineHeight: '1.55', margin: '0 0 28px 0', maxWidth: '560px' } },
          {
            id: 'cta-primary-wrap',
            type: 'section',
            order: 6,
            backgroundColor: 'transparent',
            paddingTop: '0px',
            paddingBottom: '0px',
            paddingLeft: '0px',
            paddingRight: '0px',
            blocks: [
              { id: 'cta-primary-label', type: 'text', order: 1, content: 'GET CLARITY FIRST',
                style: { color: C.softTeal, fontFamily: 'Roboto', fontSize: '0.5625rem', fontWeight: '700', letterSpacing: '0.25em', margin: '0 0 6px 0' } },
              {
                id: 'cta-primary-btn',
                type: 'deck-jump-to',
                order: 2,
                text: 'Walk me through it  →',
                targetSlide: targetVisibleSlide,
                variant: 'primary',
                alignment: 'left',
                size: 'lg',
                style: { backgroundColor: C.darkTeal, color: C.offWhite, fontFamily: 'Roboto', fontSize: '1.0625rem', fontWeight: '700', padding: '18px 24px', borderRadius: '12px' },
              },
              { id: 'cta-primary-support', type: 'text', order: 3,
                content: 'A few questions that help identify which offering fits your situation and what getting started would look like.',
                style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6', opacity: '0.72', padding: '10px 14px 0', maxWidth: '480px' } },
            ],
          },
          { id: 'cta-stack-spacer', type: 'spacer', order: 7, height: 'sm' },
          {
            id: 'cta-secondary-wrap',
            type: 'section',
            order: 8,
            backgroundColor: 'transparent',
            paddingTop: '0px',
            paddingBottom: '0px',
            paddingLeft: '0px',
            paddingRight: '0px',
            blocks: [
              { id: 'cta-secondary-label', type: 'text', order: 1, content: 'START WITH A CONVERSATION',
                style: { color: C.softTeal, fontFamily: 'Roboto', fontSize: '0.5625rem', fontWeight: '700', letterSpacing: '0.25em', margin: '0 0 6px 0' } },
              {
                id: 'cta-secondary-btn',
                type: 'button',
                order: 2,
                text: 'Book a 30-minute call  →',
                url: CALENDLY,
                variant: 'secondary',
                alignment: 'left',
                size: 'lg',
                openInNewTab: true,
                style: { backgroundColor: 'transparent', color: C.darkTeal, border: `2px solid ${C.darkTeal}`, fontFamily: 'Roboto', fontSize: '1.0625rem', fontWeight: '700', padding: '18px 24px', borderRadius: '12px' },
              },
              { id: 'cta-secondary-support', type: 'text', order: 3,
                content: 'If you already have context and want to talk it through, we can start there and figure out fit together.',
                style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6', opacity: '0.72', padding: '10px 14px 0', maxWidth: '480px' } },
            ],
          },
        ],
      },
    ],
    pageSettings: { backgroundColor: C.lightTeal, color: C.darkBlack, fontFamily: 'Roboto' },
  };
}

function buildSurveySlide(surveyId: number) {
  // Mirror the TF2 v4 logic: vote across Q1/Q2/Q3, advisory override (Q2=D or Q3=D),
  // hybrid case (Q1=C + Q2=A → Snapshot into Roadmap), advisory always shown as a backstop.
  const recommendation = {
    bookUrl: CALENDLY,
    eyebrow: "Here's where this lands",
    narrativeTemplate:
      "You're {{q1Context}}, {{q3Context}}. {{q2Context}}. Based on that, **{{primary}}** is the right starting point.",
    offerings: [
      {
        key: 'snapshot',
        name: 'Strategy Snapshot',
        tagline:
          "When things feel off but it's not clear why. Identifies what's driving results, what's wasting effort, and the few moves that actually matter next.",
        youGet:
          'A prioritized picture of what to focus on for the next 90 days and why. Clarity on where to aim before anything gets built.',
        price: '$7,500',
        duration: '3-4 weeks',
      },
      {
        key: 'roadmap',
        name: 'Marketing Roadmap',
        tagline:
          "Before you invest in execution, make the decisions most teams avoid. What actually matters, what doesn't, what gets built first.",
        youGet:
          'A sequenced marketing plan your team can take and execute from. Covers what to build, in what order, and why.',
        price: '$12K-$18K',
        duration: '4-6 weeks',
      },
      {
        key: 'blueprint',
        name: 'Campaign Blueprint',
        tagline:
          'For when you need one specific thing to work. Designs the campaign around the right audience, message, and channels.',
        youGet:
          'A fully designed campaign your team can build and launch. One audience, one goal, one motion.',
        price: '$7,500-$12K',
        duration: '3-4 weeks',
      },
      {
        key: 'advisory',
        name: 'Fractional Marketing Advisory',
        tagline:
          'Ongoing strategic input as priorities shift. Keeps decisions tight and execution pointed in the right direction.',
        youGet:
          'A strategic partner who shows up consistently as decisions come up. Ongoing guidance that keeps execution pointed in the right direction.',
        price: 'Starting at $3K/month',
        duration: '6-month minimum',
      },
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
          [Q1_OPTIONS[0]]: 'snapshot',
          [Q1_OPTIONS[1]]: 'roadmap',
          [Q1_OPTIONS[2]]: 'snapshot',
          [Q1_OPTIONS[3]]: 'blueprint',
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
          [Q2_OPTIONS[0]]: 'snapshot',
          [Q2_OPTIONS[1]]: 'roadmap',
          [Q2_OPTIONS[2]]: 'blueprint',
          [Q2_OPTIONS[3]]: 'advisory',
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
          [Q3_OPTIONS[0]]: 'snapshot',
          [Q3_OPTIONS[1]]: 'blueprint',
          [Q3_OPTIONS[2]]: 'roadmap',
          [Q3_OPTIONS[3]]: 'advisory',
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
    id: 'slide-survey',
    label: 'Qualifier',
    surveySlide: true,
    surveyId,
    blocks: [],
    surveyRecommendation: recommendation,
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
  };
}

function buildSlides(surveyId: number) {
  // First survey virtual slide = email entry (requireEmail=true).
  // 6 content slides precede it, so it lives at visible position 7 (1-indexed).
  const FIRST_SURVEY_VISIBLE_SLIDE = 7;
  return [
    buildCoverSlide(),
    buildHowIThinkSlide(),
    buildStrategySlide(),
    buildFourOfferingsSlide(),
    buildRecentWorkSlide(),
    buildCtaSlide(FIRST_SURVEY_VISIBLE_SLIDE),
    buildSurveySlide(surveyId),
  ];
}

async function main() {
  const { db } = await import('../../../lib/db');
  const { pitchDecks, clients, users, surveys } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // ── Resolve CY Strategies user + client ──────────────────────────────
  const [user] = await db.select().from(users).where(eq(users.email, CY_STRATEGIES_USER_EMAIL)).limit(1);
  if (!user) {
    console.error(`CY Strategies user not found (${CY_STRATEGIES_USER_EMAIL}). Run setup-client.ts first.`);
    process.exit(1);
  }
  const [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) {
    console.error('CY Strategies client not found.');
    process.exit(1);
  }

  console.log(`Resolved: user ${user.id}, client ${client.id}`);

  // ── Upsert qualifier survey ─────────────────────────────────────────
  const fields = buildSurveyFields();
  const pages = SURVEY_PAGES;

  const [existingSurvey] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.clientId, client.id), eq(surveys.slug, SURVEY_SLUG)))
    .limit(1);

  let surveyId: number;
  if (existingSurvey) {
    await db.update(surveys)
      .set({
        title: 'Figure Out Your Fit',
        description: "Three questions to map your situation to the right starting point. Takes about two minutes.",
        fields: fields as any,
        pages: pages as any,
        thankYouTitle: 'Got it.',
        thankYouMessage: "Here's where this lands based on what you shared.",
        color: C.darkTeal,
        status: 'active',
        allowMultiple: true,
        requireEmail: true,
        notifyOnResponse: true,
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, existingSurvey.id));
    surveyId = existingSurvey.id;
    console.log(`Survey updated: ID ${surveyId}`);
  } else {
    const [inserted] = await db.insert(surveys).values({
      clientId: client.id,
      title: 'Figure Out Your Fit',
      slug: SURVEY_SLUG,
      description: "Three questions to map your situation to the right starting point. Takes about two minutes.",
      fields: fields as any,
      pages: pages as any,
      thankYouTitle: 'Thanks — got it.',
      thankYouMessage: "I'll take a look at your answers and follow up with a clear-eyed take on where I think I can help and what getting started would look like. No obligation, no pitch.",
      color: C.darkTeal,
      status: 'active',
      allowMultiple: true,
      requireEmail: true,
      notifyOnResponse: true,
      createdBy: user.id,
    }).returning();
    surveyId = inserted.id;
    console.log(`Survey created: ID ${surveyId}`);
  }

  // ── Upsert pitch deck ───────────────────────────────────────────────
  const slides = buildSlides(surveyId);
  const theme = {
    primaryColor: C.darkTeal,
    accentColor: C.rust,
    backgroundColor: C.offWhite,
    textColor: C.darkBlack,
    headingFont: 'Roboto',
    bodyFont: 'Roboto',
  };
  const title = 'CY Strategies — Figure Out Your Fit';
  const description = 'Marketing strategy pitch with an integrated qualifier survey.';

  const [existingDeck] = await db
    .select()
    .from(pitchDecks)
    .where(and(eq(pitchDecks.clientId, client.id), eq(pitchDecks.slug, DECK_SLUG)))
    .limit(1);

  let deckId: number;
  if (existingDeck) {
    await db.update(pitchDecks)
      .set({
        title,
        description,
        slides: slides as any,
        theme,
        formatVersion: 2,
        status: 'published',
        updatedAt: new Date(),
      })
      .where(eq(pitchDecks.id, existingDeck.id));
    deckId = existingDeck.id;
    console.log(`Pitch deck updated: ID ${deckId}`);
  } else {
    const [inserted] = await db.insert(pitchDecks).values({
      clientId: client.id,
      title,
      slug: DECK_SLUG,
      description,
      status: 'published',
      slides: slides as any,
      theme,
      formatVersion: 2,
      createdBy: user.id,
    }).returning();
    deckId = inserted.id;
    console.log(`Pitch deck created: ID ${deckId}`);
  }

  // ── Link survey back to deck ────────────────────────────────────────
  await db.update(surveys)
    .set({ linkedType: 'pitch_deck', linkedId: deckId, updatedAt: new Date() })
    .where(eq(surveys.id, surveyId));

  console.log(`\nDeck slug:   ${DECK_SLUG}`);
  console.log(`Survey slug: ${SURVEY_SLUG}`);
  console.log(`\nView:  /pitch-deck/${DECK_SLUG}`);
  console.log('\n=== DONE ===');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
