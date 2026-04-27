import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Restyles the CTA (final) slide of the `figure-out-your-fit` deck so its
 * primary + secondary buttons match the simple full-rounded button used on
 * the `pitch-deck-3` book-call slide. Drops the label-cap pattern (header
 * sticker glued onto the top of each button) — labels become plain
 * uppercase eyebrow text instead.
 *
 * Idempotent: re-running just rewrites the same blocks + customCss.
 */

const DECK_SLUG = 'figure-out-your-fit';

const C = {
  darkTeal:  '#005652',
  softTeal:  '#9FB7B1',
  offWhite:  '#F6F5F2',
  darkBlack: '#171615',
  lightTeal: '#E2EDEA',
  rust:      '#C46A3D',
};

const CALENDLY = 'https://calendly.com/cody-cystrategies/30min';

function buildCtaSlide() {
  const css = `
[data-slide-id="slide-cta"] .block-content { max-width: 640px; margin: 0 auto; }
[data-block-id="cta-brand"] [data-editable-field="content"] { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 28px; }
[data-block-id="cta-brand"] [data-editable-field="content"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rust); flex-shrink: 0; }
[data-block-id="cta-heading"] h2 { margin: 0 0 14px !important; }
[data-block-id="cta-rule"] hr { border: none; background: var(--rust); height: 3px; width: 44px; max-width: 44px; margin: 20px 0; border-radius: 2px; }

/* Eyebrow labels above each button — plain uppercase text, no sticker cap */
[data-block-id="cta-primary-label"],
[data-block-id="cta-secondary-label"] { margin: 0 0 8px !important; }
[data-block-id="cta-primary-label"] [data-editable-field="content"],
[data-block-id="cta-secondary-label"] [data-editable-field="content"] {
  font-size: 11px !important; font-weight: 700 !important; letter-spacing: 3px !important;
  text-transform: uppercase; color: var(--dark-teal) !important;
  margin: 0 !important;
}

/* Primary CTA — solid dark-teal pill, full rounded */
[data-block-id="cta-primary-btn"] button, [data-block-id="cta-primary-btn"] > div > button {
  background: var(--dark-teal) !important; color: var(--off-white) !important;
  padding: 18px 24px !important; border-radius: 12px !important; border: none !important;
  font-family: 'Roboto', sans-serif !important; font-size: 17px !important; font-weight: 700 !important;
  width: 100% !important; display: flex !important; align-items: center !important;
  justify-content: space-between !important; text-align: left !important; margin-top: 0 !important;
}
[data-block-id="cta-primary-btn"] > div { margin-top: 0 !important; }

/* Secondary CTA — outline pill in matching dark-teal */
[data-block-id="cta-secondary-btn"] a, [data-block-id="cta-secondary-btn"] > div > a {
  background: transparent !important; color: var(--dark-teal) !important;
  padding: 18px 24px !important;
  border: 2px solid var(--dark-teal) !important;
  border-radius: 12px !important;
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
        style: { color: C.darkTeal } },
      { id: 'cta-primary-btn', type: 'button', order: 7,
        text: 'Walk me through it  →', url: '/pitch-deck/pitch-deck-3',
        variant: 'primary', alignment: 'left', size: 'lg' },
      { id: 'cta-primary-support', type: 'text', order: 8,
        content: 'A few questions that help identify which offering fits your situation and what getting started would look like.',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '14px', lineHeight: '1.6', opacity: '0.72', maxWidth: '480px', margin: '10px 0 24px' } },
      { id: 'cta-secondary-label', type: 'text', order: 9, content: 'START WITH A CONVERSATION',
        style: { color: C.darkTeal } },
      { id: 'cta-secondary-btn', type: 'button', order: 10,
        text: 'Book a 30-minute call  →', url: CALENDLY,
        variant: 'secondary', alignment: 'left', size: 'lg', openInNewTab: true },
      { id: 'cta-secondary-support', type: 'text', order: 11,
        content: 'If you already have context and want to talk it through, we can start there and figure out fit together.',
        style: { color: C.darkTeal, fontFamily: 'Roboto', fontSize: '14px', lineHeight: '1.6', opacity: '0.72', maxWidth: '480px', margin: '10px 0 0' } },
    ],
  };
}

async function main() {
  const { db } = await import('../../../lib/db');
  const { pitchDecks } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const [deck] = await db.select().from(pitchDecks).where(eq(pitchDecks.slug, DECK_SLUG)).limit(1);
  if (!deck) {
    console.error(`Deck not found: slug=${DECK_SLUG}`);
    process.exit(1);
  }
  console.log(`Found deck id=${deck.id} slug=${deck.slug}`);

  const slides = (deck.slides as Array<{ id: string }>) || [];
  const ctaIdx = slides.findIndex(s => s.id === 'slide-cta');
  if (ctaIdx < 0) {
    console.error('No slide-cta in this deck');
    process.exit(1);
  }

  const next = [...slides];
  next[ctaIdx] = buildCtaSlide();

  await db.update(pitchDecks)
    .set({ slides: next as never, updatedAt: new Date() })
    .where(eq(pitchDecks.id, deck.id));

  console.log(`Updated CTA slide on deck ${deck.id}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
