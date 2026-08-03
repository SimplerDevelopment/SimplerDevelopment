/**
 * Create the "The System Comes to You" benefit-led pitch deck for Crossover Capital Advisors
 * (client_id 103) — a Phase 1 marketing and referral engine deck for CEO Alex Pron.
 *
 * Status: DRAFT — this deck is intentionally written as 'draft' and must not
 * go live without a manual review pass and an explicit status update to
 * 'published'. Do not change the INSERT status below without sign-off.
 *
 * Invoke against the prod METRO proxy URL only:
 *   DATABASE_URL="postgresql://...@metro.proxy.rlwy.net:25565/railway" \
 *     bunx tsx scripts/migrations/crosscap/create-stack-connected-deck.ts
 *
 * Idempotent: upserts the pitch_decks row by (client_id, slug).
 * The file auto-runs only when executed directly — safe to import for tests.
 */

import postgres from 'postgres';

// ── tenant constants ──────────────────────────────────────────────────────────
const CLIENT_ID = 103;
const EXPECTED_WEBSITE_ID = 143;
const BRANDING_PROFILE_ID = 6; // Crossover Capital Brand (gold/navy, Cormorant + Plus Jakarta Sans)

const DECK_SLUG = 'stack-connected';
const DECK_TITLE = 'The System Comes to You';
const DECK_DESC =
  'Crossover Capital × SimplerDevelopment — a Phase 1 marketing and referral engine that runs itself, so Alex can focus on the work only he can do.';

// CrossCap brand theme — gold accent on brand navy, Cormorant Garamond display /
// Plus Jakarta Sans body. Matches branding profile 6.
const theme = {
  primaryColor: '#cfa122',
  accentColor: '#cfa122',
  backgroundColor: '#0a1628',
  textColor: '#faf8f3',
  headingFont: 'Cormorant Garamond',
  bodyFont: 'Plus Jakarta Sans',
};

// ── DB connection (validated; only opens on main() execution path) ────────────
function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required (use the prod metro public proxy URL, not the internal one).');
    process.exit(1);
  }
  if (url.includes('.railway.internal')) {
    console.error('Refusing to use an internal Railway URL — pass the public proxy URL instead.');
    process.exit(1);
  }
  const host = url.replace(/.*@([^/]+)\/.*/, '$1');
  if (!/metro\.proxy\.rlwy\.net/.test(host) && process.env.ALLOW_NON_METRO !== '1') {
    console.error(`Host "${host}" is not the metro prod proxy. Re-run with ALLOW_NON_METRO=1 to override.`);
    process.exit(1);
  }
  console.log(`Targeting: ${url.replace(/:\/\/[^@]+@/, '://***@')}`);
  return postgres(url, { max: 1, idle_timeout: 5 });
}

// ── slide builder ─────────────────────────────────────────────────────────────
// Brand tokens (literals — no HTML entities; renderer prints them verbatim)
//   Navy bg:   #0a1628
//   Card tint: #16273f
//   Gold:      #cfa122
//   Body text: rgba(255,255,255,0.85) on dark
//   Display:   Cormorant Garamond, Georgia, serif
//   Body:      Plus Jakarta Sans, sans-serif
//
// Block types used: section > (heading | text | columns | image)
// columns > column objects with their own blocks[]
// NO divider blocks — DividerBlockRender ignores style, renders a bare <hr>.
// Gold rule effect is achieved with a styled text block (thin gold border-bottom).
// Image blocks: { id, type:'image', order, url, alt, width:'full', alignment:'center' }
//   placed inside their own section (navy bg, 48px vertical padding, maxWidth '1080px')

export function buildSlides(): object[] {
  return [

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 1 — COVER
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-cover',
      label: 'Cover',
      blocks: [
        {
          id: 'scy-cover-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-cover-eyebrow',
              type: 'text',
              order: 1,
              content: 'PREPARED FOR ALEX PRON · CROSSOVER CAPITAL ADVISORS',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 20px 0',
              },
            },
            {
              id: 'scy-cover-heading',
              type: 'heading',
              order: 2,
              content: 'The system comes to you.',
              level: 1,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '3.75rem',
                fontWeight: '500',
                lineHeight: '1.08',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'scy-cover-rule',
              type: 'text',
              order: 3,
              content: '',
              style: {
                borderBottom: '3px solid #cfa122',
                maxWidth: '60px',
                margin: '0 0 28px 0',
                padding: '0',
              },
            },
            {
              id: 'scy-cover-subhead',
              type: 'text',
              order: 4,
              content: 'A marketing and referral engine that runs itself — so you can take your foot off the gas and do the work only you can do.',
              style: {
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.125rem',
                lineHeight: '1.65',
                maxWidth: '760px',
                margin: '0',
              },
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 2 — EVERYTHING NEEDS YOU  (+  p1-today.png image)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-everything-needs-you',
      label: 'Everything Needs You',
      blocks: [
        {
          id: 'scy-eny-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-eny-eyebrow',
              type: 'text',
              order: 1,
              content: 'WHERE THINGS STAND',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'scy-eny-heading',
              type: 'heading',
              order: 2,
              content: 'Right now, everything needs you.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.15',
                margin: '0 0 20px 0',
              },
            },
            {
              id: 'scy-eny-body',
              type: 'text',
              order: 3,
              content: 'Every system wants your attention. You jump in to check one thing, get pulled ten directions, and two hours disappear. The content only moves when you push it. And the referral relationships — the work nobody else can do — wait.',
              style: {
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1rem',
                lineHeight: '1.7',
                maxWidth: '820px',
                margin: '0',
              },
            },
          ],
        },
        {
          id: 'scy-eny-image-section',
          type: 'section',
          order: 2,
          backgroundColor: '#0a1628',
          paddingTop: '48px',
          paddingBottom: '48px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-eny-image',
              type: 'image',
              order: 1,
              url: '/api/media/proxy/media/1e5cc1a0-18da-4997-b171-e6c1bcb93969.png',
              alt: 'Today: every tool and task points at Alex — he is the bottleneck',
              width: 'full',
              alignment: 'center',
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 3 — THE SHIFT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-the-shift',
      label: 'The Shift',
      blocks: [
        {
          id: 'scy-shift-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-shift-eyebrow',
              type: 'text',
              order: 1,
              content: 'THE SHIFT',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'scy-shift-heading',
              type: 'heading',
              order: 2,
              content: 'Stop telling the system. Let it tell you.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.15',
                margin: '0 0 20px 0',
              },
            },
            {
              id: 'scy-shift-body',
              type: 'text',
              order: 3,
              content: 'Picture the website, the content, the emails, and your prospecting all running on their own — with the system simply showing you what\'s working. You stop being the engine. You become the one it reports to.',
              style: {
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1rem',
                lineHeight: '1.7',
                maxWidth: '820px',
                margin: '0',
              },
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 4 — WHAT CHANGES  (+  p1-engine.png image  +  4-card grid)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-what-changes',
      label: 'What Changes',
      blocks: [
        {
          id: 'scy-wc-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-wc-eyebrow',
              type: 'text',
              order: 1,
              content: 'WHAT YOU\'LL FEEL',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'scy-wc-heading',
              type: 'heading',
              order: 2,
              content: 'Less to manage. More of what matters.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.15',
                margin: '0 0 32px 0',
              },
            },
          ],
        },
        {
          id: 'scy-wc-image-section',
          type: 'section',
          order: 2,
          backgroundColor: '#0a1628',
          paddingTop: '48px',
          paddingBottom: '48px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-wc-image',
              type: 'image',
              order: 1,
              url: '/api/media/proxy/media/5ff573f4-81d1-4e42-8c87-3a364da5f53e.png',
              alt: 'Phase 1: the SimplerDevelopment engine runs on autopilot and surfaces only what\'s working up to Alex',
              width: 'full',
              alignment: 'center',
            },
          ],
        },
        {
          id: 'scy-wc-cards-section',
          type: 'section',
          order: 3,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-wc-cards',
              type: 'columns',
              order: 1,
              columns: [
                {
                  id: 'scy-wc-col-content',
                  width: '25%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-wc-content-label',
                      type: 'text',
                      order: 1,
                      content: 'Content that runs without you',
                      style: {
                        color: '#cfa122',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        letterSpacing: '0.1em',
                        margin: '0 0 10px 0',
                        borderBottom: '1px solid rgba(207,161,34,0.35)',
                        paddingBottom: '8px',
                      },
                    },
                    {
                      id: 'scy-wc-content-body',
                      type: 'text',
                      order: 2,
                      content: 'Website, blog, and email produced and published on schedule. You approve the good stuff; the system handles the rest.',
                      style: {
                        color: 'rgba(255,255,255,0.82)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.9375rem',
                        lineHeight: '1.6',
                      },
                    },
                  ],
                },
                {
                  id: 'scy-wc-col-referral',
                  width: '25%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-wc-referral-label',
                      type: 'text',
                      order: 1,
                      content: 'Your referral network, organized',
                      style: {
                        color: '#cfa122',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        letterSpacing: '0.1em',
                        margin: '0 0 10px 0',
                        borderBottom: '1px solid rgba(207,161,34,0.35)',
                        paddingBottom: '8px',
                      },
                    },
                    {
                      id: 'scy-wc-referral-body',
                      type: 'text',
                      order: 2,
                      content: 'Every attorney relationship out of the spreadsheet and into one pipeline that remembers every touch.',
                      style: {
                        color: 'rgba(255,255,255,0.82)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.9375rem',
                        lineHeight: '1.6',
                      },
                    },
                  ],
                },
                {
                  id: 'scy-wc-col-calendar',
                  width: '25%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-wc-calendar-label',
                      type: 'text',
                      order: 1,
                      content: 'A calendar that fills itself',
                      style: {
                        color: '#cfa122',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        letterSpacing: '0.1em',
                        margin: '0 0 10px 0',
                        borderBottom: '1px solid rgba(207,161,34,0.35)',
                        paddingBottom: '8px',
                      },
                    },
                    {
                      id: 'scy-wc-calendar-body',
                      type: 'text',
                      order: 2,
                      content: 'Prospects book time with you directly — no back-and-forth.',
                      style: {
                        color: 'rgba(255,255,255,0.82)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.9375rem',
                        lineHeight: '1.6',
                      },
                    },
                  ],
                },
                {
                  id: 'scy-wc-col-one-place',
                  width: '25%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-wc-one-place-label',
                      type: 'text',
                      order: 1,
                      content: 'One place, no babysitting',
                      style: {
                        color: '#cfa122',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        letterSpacing: '0.1em',
                        margin: '0 0 10px 0',
                        borderBottom: '1px solid rgba(207,161,34,0.35)',
                        paddingBottom: '8px',
                      },
                    },
                    {
                      id: 'scy-wc-one-place-body',
                      type: 'text',
                      order: 2,
                      content: 'Ask in plain language, see what\'s working. No new logins to remember.',
                      style: {
                        color: 'rgba(255,255,255,0.82)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.9375rem',
                        lineHeight: '1.6',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 5 — PHASE 1
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-phase1',
      label: 'Phase 1',
      blocks: [
        {
          id: 'scy-p1-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-p1-eyebrow',
              type: 'text',
              order: 1,
              content: 'PHASE 1 — WHERE WE START',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'scy-p1-heading',
              type: 'heading',
              order: 2,
              content: 'One simple yes to begin.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.15',
                margin: '0 0 20px 0',
              },
            },
            {
              id: 'scy-p1-body',
              type: 'text',
              order: 3,
              content: 'We start with the pieces that work the moment they turn on: your new website, online booking, content and email, and a marketing CRM for your referral network. The day the site goes live, it\'s already working for you.',
              style: {
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1rem',
                lineHeight: '1.7',
                maxWidth: '820px',
                margin: '0 0 36px 0',
              },
            },
            {
              id: 'scy-p1-reassurance',
              type: 'columns',
              order: 4,
              columns: [
                {
                  id: 'scy-p1-reassurance-col',
                  width: '100%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-p1-reassurance-body',
                      type: 'text',
                      order: 1,
                      content: 'Your Wealthbox and client service stay exactly as they are. We\'re not changing how your team serves clients — only lifting the marketing and prospecting off your plate.',
                      style: {
                        color: 'rgba(255,255,255,0.85)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '1rem',
                        lineHeight: '1.7',
                        borderLeft: '3px solid #cfa122',
                        paddingLeft: '20px',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 6 — REFERRAL NETWORK
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-referral-network',
      label: 'Referral Network',
      blocks: [
        {
          id: 'scy-rn-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-rn-eyebrow',
              type: 'text',
              order: 1,
              content: 'BUILT FOR YOUR HIGHEST-AND-BEST',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'scy-rn-heading',
              type: 'heading',
              order: 2,
              content: 'The relationships are yours. The remembering is ours.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.15',
                margin: '0 0 20px 0',
              },
            },
            {
              id: 'scy-rn-body',
              type: 'text',
              order: 3,
              content: 'We\'ve already mapped 1,416 family-law attorneys at 1,226 firms across 50 states — 1,329 of them AAML fellows, the top tier of divorce and high-net-worth practice, including New York, Pennsylvania, and New Jersey in your core market. You nurture the relationships. The system tracks who you\'ve reached, who\'s gone quiet, and who to call next.',
              style: {
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1rem',
                lineHeight: '1.7',
                maxWidth: '820px',
                margin: '0 0 36px 0',
              },
            },
            {
              id: 'scy-rn-stats',
              type: 'columns',
              order: 4,
              columns: [
                {
                  id: 'scy-rn-stat1',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-rn-stat1-label',
                      type: 'text',
                      order: 1,
                      content: '1,416 attorneys mapped',
                      style: {
                        color: '#cfa122',
                        fontFamily: 'Cormorant Garamond, Georgia, serif',
                        fontSize: '1.375rem',
                        fontWeight: '500',
                        margin: '0 0 6px 0',
                      },
                    },
                    {
                      id: 'scy-rn-stat1-body',
                      type: 'text',
                      order: 2,
                      content: 'nationwide family-law network',
                      style: {
                        color: 'rgba(255,255,255,0.65)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.875rem',
                        lineHeight: '1.5',
                      },
                    },
                  ],
                },
                {
                  id: 'scy-rn-stat2',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-rn-stat2-label',
                      type: 'text',
                      order: 1,
                      content: '1,329 AAML fellows',
                      style: {
                        color: '#cfa122',
                        fontFamily: 'Cormorant Garamond, Georgia, serif',
                        fontSize: '1.375rem',
                        fontWeight: '500',
                        margin: '0 0 6px 0',
                      },
                    },
                    {
                      id: 'scy-rn-stat2-body',
                      type: 'text',
                      order: 2,
                      content: 'divorce & high-net-worth focus',
                      style: {
                        color: 'rgba(255,255,255,0.65)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.875rem',
                        lineHeight: '1.5',
                      },
                    },
                  ],
                },
                {
                  id: 'scy-rn-stat3',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-rn-stat3-label',
                      type: 'text',
                      order: 1,
                      content: '50 states covered',
                      style: {
                        color: '#cfa122',
                        fontFamily: 'Cormorant Garamond, Georgia, serif',
                        fontSize: '1.375rem',
                        fontWeight: '500',
                        margin: '0 0 6px 0',
                      },
                    },
                    {
                      id: 'scy-rn-stat3-body',
                      type: 'text',
                      order: 2,
                      content: 'NY, PA & NJ in your core market',
                      style: {
                        color: 'rgba(255,255,255,0.65)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.875rem',
                        lineHeight: '1.5',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 7 — YOUR DASHBOARD  (+  dashboard widget image)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-your-dashboard',
      label: 'Your Dashboard',
      blocks: [
        {
          id: 'scy-dash-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-dash-eyebrow',
              type: 'text',
              order: 1,
              content: 'PHASE 2 — YOUR COCKPIT',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'scy-dash-heading',
              type: 'heading',
              order: 2,
              content: 'One dashboard. Built around your brain.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.15',
                margin: '0 0 20px 0',
              },
            },
            {
              id: 'scy-dash-body',
              type: 'text',
              order: 3,
              content: 'Phase 2 is yours to design — a widget-based dashboard that funnels in exactly what you want to see, and nothing you don’t. Drop in a block for anything: who you haven’t called, your scorecard, cash position, your tasks, the content running without you. Rearrange it until it fits how you actually work.',
              style: {
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1rem',
                lineHeight: '1.7',
                maxWidth: '820px',
                margin: '0',
              },
            },
          ],
        },
        {
          id: 'scy-dash-image-section',
          type: 'section',
          order: 2,
          backgroundColor: '#0a1628',
          paddingTop: '48px',
          paddingBottom: '48px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-dash-image',
              type: 'image',
              order: 1,
              url: '/api/media/proxy/media/37dc9701-f53a-434d-b242-c5e2b4bfd1cc.png',
              alt: 'Alex’s configurable widget dashboard — who to call next, scorecard, cash snapshot, tasks, content on autopilot, and an add-any-widget tile',
              width: 'full',
              alignment: 'center',
            },
          ],
        },
        {
          id: 'scy-dash-closing-section',
          type: 'section',
          order: 3,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-dash-closing',
              type: 'text',
              order: 1,
              content: 'Your widgets. Your layout. Your call.',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.125rem',
                fontWeight: '500',
                textAlign: 'center',
                margin: '0',
              },
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 8 — ROADMAP  (+  p1-roadmap.png image  +  3-card grid)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-roadmap',
      label: 'Roadmap',
      blocks: [
        {
          id: 'scy-rm-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-rm-eyebrow',
              type: 'text',
              order: 1,
              content: 'WHERE THIS GOES — AT YOUR PACE',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'scy-rm-heading',
              type: 'heading',
              order: 2,
              content: 'Start small. Grow when you\'re ready.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.15',
                margin: '0 0 32px 0',
              },
            },
          ],
        },
        {
          id: 'scy-rm-image-section',
          type: 'section',
          order: 2,
          backgroundColor: '#0a1628',
          paddingTop: '48px',
          paddingBottom: '48px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-rm-image',
              type: 'image',
              order: 1,
              url: '/api/media/proxy/media/ded37553-4f2f-49d7-b08f-6d71835f4ac0.png',
              alt: 'The roadmap: Phase 1 marketing engine now, Phase 2 dashboard, Phase 3 whole team — Wealthbox unchanged',
              width: 'full',
              alignment: 'center',
            },
          ],
        },
        {
          id: 'scy-rm-cards-section',
          type: 'section',
          order: 3,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-rm-cards',
              type: 'columns',
              order: 1,
              columns: [
                {
                  id: 'scy-rm-col-p1',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-rm-p1-label',
                      type: 'text',
                      order: 1,
                      content: 'Phase 1 — Now',
                      style: {
                        color: '#cfa122',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        letterSpacing: '0.1em',
                        margin: '0 0 10px 0',
                        borderBottom: '1px solid rgba(207,161,34,0.35)',
                        paddingBottom: '8px',
                      },
                    },
                    {
                      id: 'scy-rm-p1-body',
                      type: 'text',
                      order: 2,
                      content: 'Your marketing & referral engine.',
                      style: {
                        color: 'rgba(255,255,255,0.82)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.9375rem',
                        lineHeight: '1.6',
                      },
                    },
                  ],
                },
                {
                  id: 'scy-rm-col-p2',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-rm-p2-label',
                      type: 'text',
                      order: 1,
                      content: 'Phase 2 — Your cockpit',
                      style: {
                        color: '#cfa122',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        letterSpacing: '0.1em',
                        margin: '0 0 10px 0',
                        borderBottom: '1px solid rgba(207,161,34,0.35)',
                        paddingBottom: '8px',
                      },
                    },
                    {
                      id: 'scy-rm-p2-body',
                      type: 'text',
                      order: 2,
                      content: 'A widget dashboard you configure yourself — finances, tasks, scorecard, and who you haven\'t called, all in one view.',
                      style: {
                        color: 'rgba(255,255,255,0.82)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.9375rem',
                        lineHeight: '1.6',
                      },
                    },
                  ],
                },
                {
                  id: 'scy-rm-col-p3',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'md',
                  blocks: [
                    {
                      id: 'scy-rm-p3-label',
                      type: 'text',
                      order: 1,
                      content: 'Phase 3 — The whole firm',
                      style: {
                        color: '#cfa122',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        letterSpacing: '0.1em',
                        margin: '0 0 10px 0',
                        borderBottom: '1px solid rgba(207,161,34,0.35)',
                        paddingBottom: '8px',
                      },
                    },
                    {
                      id: 'scy-rm-p3-body',
                      type: 'text',
                      order: 2,
                      content: 'When the time is right, the rest of the team comes on — shared knowledge, deeper workflows.',
                      style: {
                        color: 'rgba(255,255,255,0.82)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.9375rem',
                        lineHeight: '1.6',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 8 — YOUR INSTANCE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-your-instance',
      label: 'Your Instance',
      blocks: [
        {
          id: 'scy-yi-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-yi-eyebrow',
              type: 'text',
              order: 1,
              content: 'YOUR DATA, YOUR RULES',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'scy-yi-heading',
              type: 'heading',
              order: 2,
              content: 'A private instance, built for compliance.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.15',
                margin: '0 0 20px 0',
              },
            },
            {
              id: 'scy-yi-body',
              type: 'text',
              order: 3,
              content: 'Crossover gets its own dedicated instance — your data siloed, never mixed with anyone else\'s. If compliance requires it, you can host the database under your own company umbrella. Nothing client-confidential connects until Core signs off.',
              style: {
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1rem',
                lineHeight: '1.7',
                maxWidth: '820px',
                margin: '0',
              },
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 9 — NOT ANOTHER TOOL
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-not-another-tool',
      label: 'Not Another Tool',
      blocks: [
        {
          id: 'scy-nat-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-nat-eyebrow',
              type: 'text',
              order: 1,
              content: 'ONE LESS THING, NOT ONE MORE',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'scy-nat-heading',
              type: 'heading',
              order: 2,
              content: 'A partner, not another app to remember.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.15',
                margin: '0 0 20px 0',
              },
            },
            {
              id: 'scy-nat-body',
              type: 'text',
              order: 3,
              content: 'You\'ve felt it with every tool that promised to help and just added noise. This is the opposite. You talk to it like a person, it surfaces only what\'s worth your time, and a technology partner keeps the whole thing — and your edge in AI — moving without you having to think about it.',
              style: {
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1rem',
                lineHeight: '1.7',
                maxWidth: '820px',
                margin: '0',
              },
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 10 — WHAT'S NEXT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-scy-whats-next',
      label: 'Whats Next',
      blocks: [
        {
          id: 'scy-next-section',
          type: 'section',
          order: 1,
          backgroundColor: '#0a1628',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'scy-next-eyebrow',
              type: 'text',
              order: 1,
              content: 'NEXT STEP',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'scy-next-heading',
              type: 'heading',
              order: 2,
              content: 'Most of it is already built.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.15',
                margin: '0 0 20px 0',
              },
            },
            {
              id: 'scy-next-body',
              type: 'text',
              order: 3,
              content: 'Phase 1 is ready to turn on. Say yes, and your website, booking, content, and referral engine go to work — while you get back to the relationships only you can build.',
              style: {
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1rem',
                lineHeight: '1.7',
                maxWidth: '820px',
                margin: '0',
              },
            },
          ],
        },
      ],
    },

  ];
}

// ── main (DB write path) ──────────────────────────────────────────────────────
async function main() {
  const sql = connect();

  // ── verify the tenant exists before writing anything ──────────────────────
  const client = await sql`
    SELECT id, company FROM clients WHERE id = ${CLIENT_ID} LIMIT 1
  `;
  if (!client[0]) {
    throw new Error(
      `Client ${CLIENT_ID} not found on this DB — wrong database or unprovisioned tenant.`,
    );
  }
  console.log(`Client ${CLIENT_ID}: ${client[0].company ?? '(no company name)'}`);

  const site = await sql`
    SELECT id, subdomain, domain, active FROM client_websites
    WHERE client_id = ${CLIENT_ID}
    ORDER BY id ASC
  `;
  if (!site.length) {
    throw new Error(
      `No client_websites rows for client ${CLIENT_ID}; the deck would not resolve to a public URL.`,
    );
  }
  const primary = site.find((s) => s.id === EXPECTED_WEBSITE_ID) ?? site[0];
  console.log(
    `Website: id=${primary.id} subdomain=${primary.subdomain} domain=${primary.domain ?? '—'} active=${primary.active}` +
      (primary.id !== EXPECTED_WEBSITE_ID
        ? `  (note: expected website id ${EXPECTED_WEBSITE_ID})`
        : ''),
  );

  // ── pitch_decks upsert ────────────────────────────────────────────────────
  const slides = buildSlides();
  const slidesJson = JSON.stringify(slides);
  const themeJson = JSON.stringify(theme);

  const existingDeck = await sql`
    SELECT id FROM pitch_decks
    WHERE client_id = ${CLIENT_ID} AND slug = ${DECK_SLUG}
    LIMIT 1
  `;

  let deckId: number;
  if (existingDeck[0]) {
    deckId = existingDeck[0].id;
    await sql`
      UPDATE pitch_decks
      SET title               = ${DECK_TITLE},
          description         = ${DECK_DESC},
          status              = 'draft',
          slides              = ${slidesJson}::json,
          theme               = ${themeJson}::json,
          branding_profile_id = ${BRANDING_PROFILE_ID},
          format_version      = 2,
          updated_at          = NOW()
      WHERE id = ${deckId}
    `;
    console.log(`Updated pitch_decks row ${deckId} (${slides.length} slides) — status: draft.`);
  } else {
    const inserted = await sql`
      INSERT INTO pitch_decks (
        client_id, title, slug, description, status,
        slides, theme, branding_profile_id, format_version
      ) VALUES (
        ${CLIENT_ID}, ${DECK_TITLE}, ${DECK_SLUG}, ${DECK_DESC}, 'draft',
        ${slidesJson}::json, ${themeJson}::json, ${BRANDING_PROFILE_ID}, 2
      ) RETURNING id
    `;
    deckId = inserted[0].id;
    console.log(`Created pitch_decks row ${deckId} (${slides.length} slides) — status: draft.`);
  }

  console.log('\n=== WRITE COMPLETE (DRAFT — not yet published) ===');
  console.log(`Deck id:    ${deckId}`);
  console.log(`Editor:     /portal/tools/pitch-decks/${deckId}`);
  console.log(`Preview:    https://${primary.subdomain}.simplerdevelopment.com/slides/${DECK_SLUG}`);
  console.log('ACTION REQUIRED: review deck in the editor before publishing.');
  await sql.end();
}

// Only auto-run when executed directly — keeps buildSlides() importable for
// testing or slide-composition scripts without opening a DB connection.
if (process.argv[1]?.includes('create-stack-connected-deck')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
