import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Updates ONLY `theme.customCss` on the CY Strategies `pitch-deck-2` deck so
 * the survey question slides get the TF3 HTML look (s-eyebrow / s-question /
 * s-subtext / answer-card with A/B/C letter badge).
 *
 * Does not touch slides, survey fields, recommendation config, or other theme
 * fields — safe to re-run after manual edits in the visual editor.
 */

const DECK_SLUG = 'pitch-deck-2';
const CY_STRATEGIES_USER_EMAIL = 'cystrategies@simplerdevelopment.com';

const DECK_GLOBAL_CSS = `
.deck-root {
  --dark-teal:  #005652;
  --soft-teal:  #9FB7B1;
  --off-white:  #F6F5F2;
  --dark-black: #171615;
  --light-teal: #E2EDEA;
  --rust:       #C46A3D;
}
/* Let our HTML control its own layout — strip the inherited Tailwind
   whitespace handling and outer padding from text-block wrappers and
   the slide-stage container. */
.deck-root .slide-stage { padding: 0 !important; align-items: stretch; }
.deck-root .slide-stage [data-editable-field="content"] { white-space: normal; }

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

/* =================================================================
   Survey question slides — restyled to match TF3 HTML question slides
   (s-eyebrow / s-question / s-subtext / answer-card + letter badge)
   Scopes via :not([data-slide-id]) + .w-full wrapper so we only hit
   SurveySlideRenderer's non-heading branch (not heading, thanks, or
   recommendation slides).
   ================================================================= */
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col {
  padding: 52px 80px 92px;
  min-height: 100vh;
}
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl {
  max-width: 680px !important;
  width: 100%;
}
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > * + * {
  margin-top: 0 !important;
}

/* Survey-title badge → s-eyebrow */
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > div:first-child {
  opacity: 1 !important;
  margin-bottom: 12px !important;
}
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > div:first-child > .material-icons {
  display: none !important;
}
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > div:first-child > span:not(.material-icons) {
  font-family: 'Roboto', sans-serif !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  letter-spacing: 3px !important;
  text-transform: uppercase;
  color: var(--soft-teal) !important;
}

/* Question heading → s-question */
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > h2 {
  font-family: 'Roboto', sans-serif !important;
  font-size: 26px !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
  letter-spacing: -0.3px !important;
  color: var(--dark-black) !important;
  margin: 0 0 8px !important;
}

/* Help text → s-subtext */
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > p {
  font-family: 'Roboto', sans-serif !important;
  font-size: 14px !important;
  color: #5a6b69 !important;
  line-height: 1.6 !important;
  opacity: 1 !important;
  margin: 0 0 24px !important;
}

/* Field wrapper (.pt-2) — drop extra top spacing */
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > .pt-2 {
  padding-top: 0 !important;
}

/* Radio/checkbox option list → answer-list / answer-card */
.deck-root .slide-stage:not([data-slide-id]) .space-y-3 {
  counter-reset: answer;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.deck-root .slide-stage:not([data-slide-id]) .space-y-3 > * + * { margin-top: 0 !important; }
.deck-root .slide-stage:not([data-slide-id]) .space-y-3 > button {
  counter-increment: answer;
  padding: 15px 20px !important;
  border: 2px solid rgba(0,86,82,0.1) !important;
  border-radius: 10px !important;
  background: #ffffff !important;
  display: flex !important;
  align-items: flex-start !important;
  gap: 14px !important;
  text-align: left !important;
  transition: all 0.15s !important;
}
.deck-root .slide-stage:not([data-slide-id]) .space-y-3 > button:hover {
  border-color: var(--dark-teal) !important;
  background: rgba(0,86,82,0.03) !important;
}
/* Selected state — SurveySlideRenderer renders an inner filled dot only when selected */
.deck-root .slide-stage:not([data-slide-id]) .space-y-3 > button:has(> div:first-child > div) {
  border-color: var(--dark-teal) !important;
  background: rgba(0,86,82,0.07) !important;
}
/* Hide the rendered radio/checkbox indicator — replaced by letter badge */
.deck-root .slide-stage:not([data-slide-id]) .space-y-3 > button > div:first-child {
  display: none !important;
}

/* Letter badge → a-letter (auto A, B, C…) */
.deck-root .slide-stage:not([data-slide-id]) .space-y-3 > button::before {
  content: counter(answer, upper-alpha);
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--light-teal);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'Roboto', sans-serif;
  font-size: 11px;
  font-weight: 900;
  color: var(--dark-teal);
  flex-shrink: 0;
  transition: all 0.15s;
}
.deck-root .slide-stage:not([data-slide-id]) .space-y-3 > button:hover::before,
.deck-root .slide-stage:not([data-slide-id]) .space-y-3 > button:has(> div:first-child > div)::before {
  background: var(--dark-teal);
  color: #ffffff;
}

/* Answer text → a-text */
.deck-root .slide-stage:not([data-slide-id]) .space-y-3 > button > span {
  font-family: 'Roboto', sans-serif !important;
  font-size: 15px !important;
  color: var(--dark-black) !important;
  line-height: 1.55 !important;
  padding-top: 3px !important;
}

/* Text inputs / textarea / select — answer-card palette */
.deck-root .slide-stage:not([data-slide-id]) input[type="text"],
.deck-root .slide-stage:not([data-slide-id]) input[type="email"],
.deck-root .slide-stage:not([data-slide-id]) input[type="tel"],
.deck-root .slide-stage:not([data-slide-id]) input[type="url"],
.deck-root .slide-stage:not([data-slide-id]) input[type="number"],
.deck-root .slide-stage:not([data-slide-id]) input[type="date"],
.deck-root .slide-stage:not([data-slide-id]) textarea,
.deck-root .slide-stage:not([data-slide-id]) select {
  background: #ffffff !important;
  border: 2px solid rgba(0,86,82,0.1) !important;
  border-radius: 10px !important;
  padding: 14px 18px !important;
  font-family: 'Roboto', sans-serif !important;
  font-size: 15px !important;
  color: var(--dark-black) !important;
}
.deck-root .slide-stage:not([data-slide-id]) input:focus,
.deck-root .slide-stage:not([data-slide-id]) textarea:focus,
.deck-root .slide-stage:not([data-slide-id]) select:focus {
  border-color: var(--dark-teal) !important;
  box-shadow: 0 0 0 3px rgba(0,86,82,0.08) !important;
  outline: none !important;
}

/* Nav row → survey-nav */
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > .flex.items-center.justify-between {
  margin-top: 22px !important;
  padding-top: 0 !important;
}
/* Back (first button when both present) → back-btn text link */
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > .flex.items-center.justify-between > button:first-of-type:not(:last-of-type) {
  font-family: 'Roboto', sans-serif !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  letter-spacing: 1.5px !important;
  text-transform: uppercase !important;
  background: transparent !important;
  color: var(--soft-teal) !important;
  padding: 0 !important;
  border-radius: 0 !important;
  gap: 4px !important;
}
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > .flex.items-center.justify-between > button:first-of-type:not(:last-of-type):hover {
  color: var(--dark-teal) !important;
  opacity: 1 !important;
}
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > .flex.items-center.justify-between > button:first-of-type:not(:last-of-type) .material-icons {
  font-size: 14px !important;
}
/* Next / Submit (last button) → solid dark-teal pill matching TF3 primary */
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > .flex.items-center.justify-between > button:last-of-type {
  background: var(--dark-teal) !important;
  color: var(--off-white) !important;
  font-family: 'Roboto', sans-serif !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  letter-spacing: 1px !important;
  text-transform: uppercase !important;
  padding: 12px 22px !important;
  border-radius: 10px !important;
  gap: 6px !important;
}
.deck-root .slide-stage:not([data-slide-id]) > .w-full.flex.flex-col > .max-w-3xl > .flex.items-center.justify-between > button:last-of-type:hover {
  opacity: 0.88 !important;
}
`;

async function main() {
  const { db } = await import('../../../lib/db');
  const { pitchDecks, clients, users } = await import('../../../lib/db/schema');
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

  const [deck] = await db
    .select()
    .from(pitchDecks)
    .where(and(eq(pitchDecks.clientId, client.id), eq(pitchDecks.slug, DECK_SLUG)))
    .limit(1);
  if (!deck) {
    console.error(`Deck not found: ${DECK_SLUG}`);
    process.exit(1);
  }

  const existingTheme = (deck.theme || {}) as Record<string, unknown>;
  const nextTheme = { ...existingTheme, customCss: DECK_GLOBAL_CSS };

  await db.update(pitchDecks)
    .set({ theme: nextTheme as any, updatedAt: new Date() })
    .where(eq(pitchDecks.id, deck.id));

  console.log(`Updated theme.customCss on deck ${DECK_SLUG} (id ${deck.id}).`);
  console.log(`CSS length: ${DECK_GLOBAL_CSS.length} chars`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
