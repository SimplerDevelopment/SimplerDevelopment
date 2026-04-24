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
  const css = `
[data-slide-id="slide-cover"] .block-content { max-width: 1020px; margin: 0 auto; }
/* Two-column layout — columns block renders as grid by default */
[data-block-id="cover-columns"] > div { grid-template-columns: 1fr 280px !important; gap: 52px !important; align-items: center !important; }
/* Wordmark with rust dot via ::before */
[data-block-id="cover-brand"] [data-editable-field="content"] { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 28px; }
[data-block-id="cover-brand"] [data-editable-field="content"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rust); flex-shrink: 0; }
/* Headline + punchline */
[data-block-id="cover-headline"] h1 { margin: 0 0 6px !important; }
[data-block-id="cover-punchline"] h2 { margin: 0 0 20px !important; }
/* Rust rule */
[data-block-id="cover-rule"] hr { border: none; background: var(--rust); height: 3px; width: 44px; max-width: 44px; margin: 0 0 16px; border-radius: 2px; }
/* Body + about block */
[data-block-id="cover-about"] [data-editable-field="content"] { border-top: 1px solid rgba(255,255,255,0.1); padding-top: 18px; margin-top: 4px; }
[data-block-id="cover-about"] [data-editable-field="content"] br + br { display: block; content: ''; margin-top: 8px; }
/* "About 5 minutes" pill */
[data-block-id="cover-time"] [data-editable-field="content"] { display: inline-block; background: rgba(255,255,255,0.07); padding: 7px 14px; border-radius: 20px; margin-top: 14px; }
/* Headshot with shadow */
[data-block-id="cover-photo"] img { border-radius: 16px !important; box-shadow: 0 24px 60px rgba(0,0,0,0.45); width: 280px; height: 348px; object-fit: cover; object-position: center top; }
`.trim();

  return {
    id: 'slide-cover',
    label: 'Cover',
    customCss: css,
    pageSettings: { backgroundColor: C.darkTeal, color: C.white, fontFamily: 'Roboto' },
    blocks: [
      {
        id: 'cover-columns',
        type: 'columns',
        order: 1,
        gap: 'xl',
        stackOnMobile: true,
        columns: [
          {
            id: 'cover-text-col',
            width: '60%',
            verticalAlign: 'middle',
            padding: 'none',
            blocks: [
              { id: 'cover-brand', type: 'text', order: 1, content: 'CY STRATEGIES',
                style: { color: 'rgba(255,255,255,0.95)', fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '4px', textTransform: 'uppercase' } },
              { id: 'cover-eyebrow', type: 'text', order: 2, content: 'MARKETING STRATEGY CONSULTANT',
                style: { color: C.softTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '3px', margin: '0 0 14px' } },
              { id: 'cover-headline', type: 'heading', order: 3, level: 1,
                content: "Most companies don't have a marketing problem.",
                style: { color: C.offWhite, fontFamily: 'Roboto', fontSize: '40px', fontWeight: '900', lineHeight: '1.08', letterSpacing: '-0.5px' } },
              { id: 'cover-punchline', type: 'heading', order: 4, level: 2,
                content: 'They have a decision problem.',
                style: { color: C.lightTeal, fontFamily: 'Roboto', fontSize: '40px', fontWeight: '300', lineHeight: '1.08', letterSpacing: '-0.5px' } },
              { id: 'cover-rule', type: 'divider', order: 5, style: { borderColor: C.rust } },
              { id: 'cover-intro', type: 'text', order: 6, content: "Hi, I'm Cody.",
                style: { color: C.softTeal, fontFamily: 'Roboto', fontSize: '13px', fontWeight: '700', letterSpacing: '1.5px', margin: '0 0 12px' } },
              { id: 'cover-body', type: 'text', order: 7,
                content: "I figure out what's actually driving growth, what isn't, and what to do about it. So your team stops guessing and starts building the right things.",
                style: { color: C.lightTeal, fontFamily: 'Roboto', fontSize: '16px', lineHeight: '1.65', maxWidth: '460px', margin: '0 0 20px' } },
              { id: 'cover-about', type: 'text', order: 8,
                content: "Most companies don't need more marketing. They need to make better decisions about what's worth doing in the first place.<br/><br/>This is a quick look at how I think and whether working together would make sense.",
                style: { color: C.softTeal, fontFamily: 'Roboto', fontSize: '14px', lineHeight: '1.8', maxWidth: '460px' } },
              { id: 'cover-time', type: 'text', order: 9, content: '⏱  ABOUT 5 MINUTES',
                style: { color: C.softTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '2px' } },
            ],
          },
          {
            id: 'cover-photo-col',
            width: '40%',
            verticalAlign: 'middle',
            padding: 'none',
            blocks: [
              { id: 'cover-photo', type: 'image', order: 1, url: HEADSHOT_URL, alt: 'Cody York, CY Strategies', width: 'full', alignment: 'center' },
            ],
          },
        ],
      },
    ],
  };
}

function buildHowIThinkSlide() {
  const css = `
[data-slide-id="slide-how-i-think"] .block-content { max-width: 900px; margin: 0 auto; }
[data-block-id="think-brand"] [data-editable-field="content"] { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 36px; }
[data-block-id="think-brand"] [data-editable-field="content"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rust); flex-shrink: 0; }
[data-block-id="think-heading"] h2 { margin: 0 0 14px !important; }
[data-block-id="think-rule"] hr { border: none; background: var(--rust); height: 3px; width: 44px; max-width: 44px; margin: 20px 0; border-radius: 2px; }
[data-block-id="think-quote"] { margin-top: 22px; padding: 22px 26px; border-left: 4px solid var(--dark-teal); border-radius: 0 10px 10px 0; background: rgba(0,86,82,0.05); }
[data-block-id="think-quote"] [data-editable-field="content"] { margin: 0; }
[data-block-id="think-bullet-1"] [data-editable-field="content"],
[data-block-id="think-bullet-2"] [data-editable-field="content"],
[data-block-id="think-bullet-3"] [data-editable-field="content"] { padding-left: 20px; position: relative; }
[data-block-id="think-bullet-1"] [data-editable-field="content"]::before,
[data-block-id="think-bullet-2"] [data-editable-field="content"]::before,
[data-block-id="think-bullet-3"] [data-editable-field="content"]::before { content: '•'; position: absolute; left: 4px; color: var(--dark-teal); font-weight: 700; }
`.trim();

  return {
    id: 'slide-how-i-think',
    label: 'How I Think',
    customCss: css,
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
    blocks: [
      { id: 'think-brand', type: 'text', order: 1, content: 'CY STRATEGIES',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '4px', textTransform: 'uppercase' } },
      { id: 'think-eyebrow', type: 'text', order: 2, content: 'HOW I THINK ABOUT THIS',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '3px', margin: '0 0 14px' } },
      { id: 'think-heading', type: 'heading', order: 3, level: 2,
        content: "The gap isn't in execution. It's in understanding the actual problem.",
        style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '36px', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px' } },
      { id: 'think-rule', type: 'divider', order: 4, style: { borderColor: C.rust } },
      { id: 'think-body-1', type: 'text', order: 5, content: 'Most companies know where they want to go.',
        style: { color: '#3a4a49', fontFamily: 'Roboto', fontSize: '18px', lineHeight: '1.7', margin: '0 0 12px' } },
      { id: 'think-body-2', type: 'text', order: 6, content: "Very few know what's actually going to get them there.",
        style: { color: '#3a4a49', fontFamily: 'Roboto', fontSize: '18px', lineHeight: '1.7' } },
      {
        id: 'think-quote',
        type: 'section',
        order: 7,
        paddingTop: '0',
        paddingBottom: '0',
        paddingLeft: '0',
        paddingRight: '0',
        blocks: [
          { id: 'think-quote-1', type: 'text', order: 1, content: 'Take a website.',
            style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '17px', lineHeight: '1.7', margin: '0 0 8px' } },
          { id: 'think-quote-2', type: 'text', order: 2,
            content: 'When someone says "it\'s not working," that usually means one of three things:',
            style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '17px', lineHeight: '1.7', margin: '0 0 10px' } },
          { id: 'think-bullet-1', type: 'text', order: 3, content: 'Not enough people are finding it',
            style: { color: '#3a4a49', fontFamily: 'Roboto', fontSize: '16px', lineHeight: '1.65', margin: '3px 0' } },
          { id: 'think-bullet-2', type: 'text', order: 4, content: "People find it but don't take action",
            style: { color: '#3a4a49', fontFamily: 'Roboto', fontSize: '16px', lineHeight: '1.65', margin: '3px 0' } },
          { id: 'think-bullet-3', type: 'text', order: 5, content: "People don't understand what you offer or why it matters",
            style: { color: '#3a4a49', fontFamily: 'Roboto', fontSize: '16px', lineHeight: '1.65', margin: '3px 0 12px' } },
          { id: 'think-close', type: 'text', order: 6,
            content: 'Three different problems. Three completely different solutions. Most teams pick one and start spending. Strategy tells you which one you actually have. Before the spending starts. That applies to messaging, campaigns, audiences, and channels.',
            style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '16px', fontWeight: '500', lineHeight: '1.5' } },
        ],
      },
    ],
  };
}

function buildStrategySlide() {
  const css = `
[data-slide-id="slide-strategy"] .block-content { max-width: 900px; margin: 0 auto; }
[data-block-id="strategy-brand"] [data-editable-field="content"] { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 36px; }
[data-block-id="strategy-brand"] [data-editable-field="content"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rust); flex-shrink: 0; }
[data-block-id="strategy-heading"] h2 { margin: 0 0 14px !important; }
[data-block-id="strategy-rule"] hr { border: none; background: var(--rust); height: 3px; width: 44px; max-width: 44px; margin: 20px 0; border-radius: 2px; }
`.trim();

  return {
    id: 'slide-strategy',
    label: 'What Good Strategy Is',
    customCss: css,
    pageSettings: { backgroundColor: C.lightTeal, color: C.darkBlack, fontFamily: 'Roboto' },
    blocks: [
      { id: 'strategy-brand', type: 'text', order: 1, content: 'CY STRATEGIES',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '4px', textTransform: 'uppercase' } },
      { id: 'strategy-eyebrow', type: 'text', order: 2, content: 'WHAT STRATEGY ACTUALLY DOES',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '3px', margin: '0 0 14px' } },
      { id: 'strategy-heading', type: 'heading', order: 3, level: 2,
        content: "A strategy isn't a plan. It's a set of decisions that make a plan worth following.",
        style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '36px', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px' } },
      { id: 'strategy-rule', type: 'divider', order: 4, style: { borderColor: C.rust } },
      { id: 'strategy-p-1', type: 'text', order: 5,
        content: "Most teams can tell you what they're going to do. Very few can tell you why those things and not something else.",
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '18px', lineHeight: '1.72', margin: '0 0 16px' } },
      { id: 'strategy-p-2', type: 'text', order: 6,
        content: 'Good strategy answers the questions most teams skip. Who exactly are we trying to reach? What has to be true before they act? Which message, which channel, at which moment?',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '18px', lineHeight: '1.72', margin: '0 0 16px' } },
      { id: 'strategy-p-3', type: 'text', order: 7,
        content: 'Without those answers, a plan is just activity. Strategy is the thinking that makes the activity matter.',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '18px', lineHeight: '1.72' } },
    ],
  };
}

// SVG icons (inline) for each offering — matches TF1 v8 stroke-based Feather-style
const SNAPSHOT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const ROADMAP_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>';
const BLUEPRINT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
const ADVISORY_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';

function offeringCardBlock(idPrefix: string, num: string, label: string, title: string, desc: string, youGet: string, iconSvg: string) {
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
    ],
  };
}

function buildFourOfferingsSlide() {
  const css = `
[data-slide-id="slide-offerings"] .block-content { max-width: 1000px; margin: 0 auto; }
[data-block-id="offerings-brand"] [data-editable-field="content"] { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 28px; }
[data-block-id="offerings-brand"] [data-editable-field="content"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rust); flex-shrink: 0; }
[data-block-id="offerings-heading"] h2 { margin: 0 0 18px !important; }
/* Columns wrapper — kill the block renderer's default py-8 my-8 spacing */
[data-block-id="offerings-grid"] .py-8 { padding: 0 !important; }
[data-block-id="offerings-grid"] .my-8 { margin: 0 !important; }
/* Grid — tighten to 2-col with minimal gap; spacer blocks add vertical gap */
[data-block-id="offerings-grid"] .flex.flex-row { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 16px !important; }
/* Section inside each column — kill the inner top margin from the block wrapper */
[data-block-id="offerings-grid"] [data-block-id^="off-0"] { margin: 0 !important; }
[data-block-id="offerings-grid"] [data-col-stacks-never] { width: auto !important; flex: 1 1 auto !important; }
/* Each offering card */
[data-block-id^="off-0"][data-block-type="section"] section { border: 1px solid rgba(0,86,82,0.12) !important; border-left: 4px solid var(--dark-teal) !important; border-radius: 0 12px 12px 0 !important; box-shadow: 0 2px 10px rgba(0,86,82,0.06); position: relative !important; overflow: hidden !important; }
/* Big background number positioned absolute in the card's top-right */
[data-block-id$="-bgnum"] { position: absolute !important; top: 6px; right: 14px; z-index: 0; pointer-events: none; user-select: none; margin: 0 !important; }
/* Inline SVG icon */
[data-block-id$="-icon"] [data-editable-field="content"] svg { display: block; }
/* Title — need room for bgnum on right */
[data-block-id$="-title"] h4 { margin: 0 !important; padding-right: 40px; }
/* "You get" pill — inline display so it wraps as a single row */
[data-block-id$="-get"] [data-editable-field="content"] { background: var(--light-teal); padding: 6px 10px; border-radius: 5px; display: inline-block; line-height: 1.4; margin-top: 4px; }
`.trim();

  return {
    id: 'slide-offerings',
    label: 'Four Offerings',
    customCss: css,
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
    blocks: [
      { id: 'offerings-brand', type: 'text', order: 1, content: 'CY STRATEGIES',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '4px', textTransform: 'uppercase' } },
      { id: 'offerings-eyebrow', type: 'text', order: 2, content: 'FOUR WAYS TO WORK TOGETHER',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '3px', margin: '0 0 14px' } },
      { id: 'offerings-heading', type: 'heading', order: 3, level: 2, content: "Here's what that looks like in practice.",
        style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '36px', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px' } },
      {
        id: 'offerings-grid',
        type: 'columns',
        order: 4,
        gap: 'md',
        stackOnMobile: true,
        columns: [
          {
            id: 'offerings-col-left', width: '50%', verticalAlign: 'top', padding: 'none',
            blocks: [
              offeringCardBlock('off-01', '01', '01 / SNAPSHOT', 'Strategy Snapshot: 90-Day Priorities',
                "When things feel off but it's not clear why. Identifies what's driving results, what's wasting time, and the few moves that actually matter next.",
                'A focused 90-day plan with clear priorities your team can act on immediately',
                SNAPSHOT_ICON),
              { id: 'off-spacer-left', type: 'spacer', order: 2, height: 'xs' },
              offeringCardBlock('off-03', '03', '03 / BLUEPRINT', 'Campaign Blueprint',
                'For when you need one specific thing to work. Designs the campaign around the right audience, message, and channels. Built for your team to execute without guessing.',
                'A complete campaign structure ready to build and launch',
                BLUEPRINT_ICON),
            ],
          },
          {
            id: 'offerings-col-right', width: '50%', verticalAlign: 'top', padding: 'none',
            blocks: [
              offeringCardBlock('off-02', '02', '02 / ROADMAP', 'Marketing Roadmap',
                "Before you invest in execution, we make the decisions most teams avoid. What actually matters, what doesn't, what gets built first.",
                'A sequenced roadmap your team or partners can execute with confidence',
                ROADMAP_ICON),
              { id: 'off-spacer-right', type: 'spacer', order: 2, height: 'xs' },
              offeringCardBlock('off-04', '04', '04 / ADVISORY', 'Fractional Marketing Advisory',
                'Ongoing strategic input as priorities shift. Keeps decisions tight and execution pointed in the right direction. Strategy only.',
                'Consistent guidance that keeps marketing aligned with what actually matters',
                ADVISORY_ICON),
            ],
          },
        ],
      },
    ],
  };
}

function clientCardBlock(idPrefix: string, initials: string, name: string, story: string, proof: string) {
  return {
    id: idPrefix,
    type: 'columns',
    order: 1,
    gap: 'sm',
    stackOnMobile: false,
    columns: [
      {
        id: `${idPrefix}-badge-col`, width: '40px', verticalAlign: 'top', padding: 'none',
        blocks: [
          { id: `${idPrefix}-badge`, type: 'text', order: 1, content: initials,
            style: { color: C.offWhite, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '900', letterSpacing: '1px' } },
        ],
      },
      {
        id: `${idPrefix}-body-col`, width: 'auto', verticalAlign: 'top', padding: 'none',
        blocks: [
          { id: `${idPrefix}-name`, type: 'text', order: 1, content: name.toUpperCase(),
            style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '12px', fontWeight: '700', letterSpacing: '2px', margin: '0 0 4px' } },
          { id: `${idPrefix}-story`, type: 'text', order: 2, content: story,
            style: { color: '#3a4a49', fontFamily: 'Roboto', fontSize: '14.5px', lineHeight: '1.65' } },
          { id: `${idPrefix}-proof`, type: 'text', order: 3, content: proof,
            style: { color: C.rust, fontFamily: 'Roboto', fontSize: '12px', fontWeight: '500' } },
        ],
      },
    ],
  };
}

function clientCardSection(idPrefix: string, initials: string, name: string, story: string, proof: string) {
  return {
    id: `${idPrefix}-card`,
    type: 'section',
    order: 1,
    paddingTop: '14px',
    paddingBottom: '14px',
    paddingLeft: '18px',
    paddingRight: '20px',
    backgroundColor: '#ffffff',
    blocks: [clientCardBlock(idPrefix, initials, name, story, proof)],
  };
}

function buildRecentWorkSlide() {
  const css = `
[data-slide-id="slide-work"] .block-content { max-width: 900px; margin: 0 auto; }
[data-block-id="work-brand"] [data-editable-field="content"] { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 28px; }
[data-block-id="work-brand"] [data-editable-field="content"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rust); flex-shrink: 0; }
[data-block-id="work-heading"] h2 { margin: 0 0 14px !important; }
/* Client cards */
[data-block-id$="-card"][data-block-type="section"] section { border: 1px solid rgba(0,86,82,0.1) !important; border-left: 4px solid var(--dark-teal) !important; border-radius: 0 12px 12px 0 !important; box-shadow: 0 2px 10px rgba(0,86,82,0.06); }
/* Tighten spacing between cards */
[data-block-id$="-card"][data-block-type="section"] { margin-top: 8px !important; }
[data-block-id$="-card"][data-block-type="section"]:first-of-type { margin-top: 0 !important; }
/* Columns wrapper — kill the block renderer's default py-8 my-8 spacing */
[data-block-id$="-card"] [data-block-type="columns"] .py-8 { padding: 0 !important; }
[data-block-id$="-card"] [data-block-type="columns"] .my-8 { margin: 0 !important; }
/* Force narrow badge column (width='40px' on the column def gets coerced to 40%) */
[data-block-id$="-card"] [data-col-stacks-never]:first-child { flex: 0 0 36px !important; width: 36px !important; }
[data-block-id$="-card"] [data-col-stacks-never]:last-child { flex: 1 1 auto !important; width: auto !important; }
/* Initials badge */
[data-block-id$="-badge"] [data-editable-field="content"] { width: 36px; height: 36px; border-radius: 8px; background: var(--dark-teal); display: flex !important; align-items: center; justify-content: center; margin: 0 !important; }
/* Proof tag */
[data-block-id$="-proof"] [data-editable-field="content"] { display: inline-block; margin-top: 6px; background: rgba(196,106,61,0.08); border: 1px solid rgba(196,106,61,0.2); padding: 3px 10px; border-radius: 5px; }
/* Story text — constrain so badge+story row reads naturally */
[data-block-id$="-story"] [data-editable-field="content"] { margin: 0; }
[data-block-id$="-name"] [data-editable-field="content"] { margin: 0 0 4px; }
`.trim();

  return {
    id: 'slide-work',
    label: 'Recent Work',
    customCss: css,
    pageSettings: { backgroundColor: C.offWhite, color: C.darkBlack, fontFamily: 'Roboto' },
    blocks: [
      { id: 'work-brand', type: 'text', order: 1, content: 'CY STRATEGIES',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '4px', textTransform: 'uppercase' } },
      { id: 'work-eyebrow', type: 'text', order: 2, content: 'RECENT WORK',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '3px', margin: '0 0 14px' } },
      { id: 'work-heading', type: 'heading', order: 3, level: 2, content: 'A few examples.',
        style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '36px', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px' } },
      clientCardSection('pc', 'PC', 'Post Captain Consulting',
        'A niche B2B firm that had grown on reputation and needed a foundation to grow intentionally. Work started with positioning and story, led to a full website rebuild, and established a clearer model for generating business beyond referrals.',
        'Clear positioning and a foundation built for intentional growth'),
      clientCardSection('cc', 'CC', 'Crossover Capital',
        'A financial advisory firm targeting a specific audience with a message that needed to land exactly right. Narrowed the target, rebuilt the positioning, and structured the campaign and outreach around what would actually resonate. An attorney who said he never clicks ads reached out after clicking this one.',
        'Right strategy, right message, right audience'),
      clientCardSection('jm', 'JM', 'JM Law Group',
        'A franchise attorney without a consistent system for reaching the right referral sources. Built a LinkedIn strategy and outreach process targeting brokers and franchisors, with content and templates to make it consistent and repeatable.',
        'Focused outreach, better relationships, more consistency'),
    ],
  };
}

function buildCtaSlide(targetVisibleSlide: number) {
  const css = `
[data-slide-id="slide-cta"] .block-content { max-width: 720px; margin: 0 auto; }
[data-block-id="cta-brand"] [data-editable-field="content"] { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 28px; }
[data-block-id="cta-brand"] [data-editable-field="content"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rust); flex-shrink: 0; }
[data-block-id="cta-heading"] h2 { margin: 0 0 14px !important; }
[data-block-id="cta-rule"] hr { border: none; background: var(--rust); height: 3px; width: 44px; max-width: 44px; margin: 20px 0; border-radius: 2px; }

/* Primary label — matches button background, sits flush on top as a header cap */
[data-block-id="cta-primary-label"] { margin: 0 !important; }
[data-block-id="cta-primary-label"] [data-editable-field="content"] {
  font-size: 9px !important; font-weight: 700 !important; letter-spacing: 2.5px !important;
  text-transform: uppercase; color: var(--soft-teal) !important;
  background: var(--dark-teal); padding: 14px 24px 0; border-radius: 12px 12px 0 0;
  margin: 0 !important;
}
[data-block-id="cta-primary-btn"] button, [data-block-id="cta-primary-btn"] > div > button {
  background: var(--dark-teal) !important; color: var(--off-white) !important;
  padding: 4px 24px 16px !important; border-radius: 0 0 12px 12px !important; border: none !important;
  font-family: 'Roboto', sans-serif !important; font-size: 17px !important; font-weight: 700 !important;
  width: 100% !important; display: flex !important; align-items: center !important;
  justify-content: space-between !important; text-align: left !important; margin-top: 0 !important;
}
[data-block-id="cta-primary-btn"] > div { margin-top: 0 !important; }

/* Secondary label — transparent background with dark-teal border, top cap */
[data-block-id="cta-secondary-label"] { margin: 0 !important; }
[data-block-id="cta-secondary-label"] [data-editable-field="content"] {
  font-size: 9px !important; font-weight: 700 !important; letter-spacing: 2.5px !important;
  text-transform: uppercase; color: var(--soft-teal) !important;
  background: transparent; padding: 14px 22px 0;
  border: 2px solid var(--dark-teal); border-bottom: none; border-radius: 12px 12px 0 0;
  margin: 0 !important;
}
[data-block-id="cta-secondary-btn"] a, [data-block-id="cta-secondary-btn"] > div > a {
  background: transparent !important; color: var(--dark-teal) !important;
  padding: 4px 22px 16px !important;
  border: 2px solid var(--dark-teal) !important; border-top: none !important;
  border-radius: 0 0 12px 12px !important;
  font-family: 'Roboto', sans-serif !important; font-size: 17px !important; font-weight: 700 !important;
  width: 100% !important; display: flex !important; align-items: center !important;
  justify-content: space-between !important; text-align: left !important; text-decoration: none !important;
  margin-top: 0 !important;
}
[data-block-id="cta-secondary-btn"] > div { margin-top: 0 !important; }
`.trim();

  return {
    id: 'slide-cta',
    label: "What's Next",
    customCss: css,
    pageSettings: { backgroundColor: C.lightTeal, color: C.darkBlack, fontFamily: 'Roboto' },
    blocks: [
      { id: 'cta-brand', type: 'text', order: 1, content: 'CY STRATEGIES',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '4px', textTransform: 'uppercase' } },
      { id: 'cta-eyebrow', type: 'text', order: 2, content: "WHAT'S NEXT",
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '11px', fontWeight: '700', letterSpacing: '3px', margin: '0 0 14px' } },
      { id: 'cta-heading', type: 'heading', order: 3, level: 2, content: 'Two ways to move forward.',
        style: { color: C.darkBlack, fontFamily: 'Roboto', fontSize: '36px', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.4px' } },
      { id: 'cta-rule', type: 'divider', order: 4, style: { borderColor: C.rust } },
      { id: 'cta-body', type: 'text', order: 5,
        content: "If you want a clearer picture of which offering fits before we talk, walk through the three questions. If you'd rather just have a conversation, that works too.",
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '18px', fontWeight: '300', lineHeight: '1.55', maxWidth: '560px', margin: '0 0 28px' } },
      { id: 'cta-primary-label', type: 'text', order: 6, content: 'GET CLARITY FIRST',
        style: { color: C.softTeal } },
      { id: 'cta-primary-btn', type: 'deck-jump-to', order: 7,
        text: 'Walk me through it  →', targetSlide: targetVisibleSlide,
        variant: 'primary', alignment: 'left', size: 'lg' },
      { id: 'cta-primary-support', type: 'text', order: 8,
        content: 'A few questions that help identify which offering fits your situation and what getting started would look like.',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '14px', lineHeight: '1.6', opacity: '0.72', maxWidth: '480px', margin: '10px 0 20px' } },
      { id: 'cta-secondary-label', type: 'text', order: 9, content: 'START WITH A CONVERSATION',
        style: { color: C.softTeal } },
      { id: 'cta-secondary-btn', type: 'button', order: 10,
        text: 'Book a 30-minute call  →', url: CALENDLY,
        variant: 'secondary', alignment: 'left', size: 'lg', openInNewTab: true },
      { id: 'cta-secondary-support', type: 'text', order: 11,
        content: 'If you already have context and want to talk it through, we can start there and figure out fit together.',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '14px', lineHeight: '1.6', opacity: '0.72', maxWidth: '480px', margin: '10px 0 0' } },
    ],
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
    customCss: DECK_GLOBAL_CSS,
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
