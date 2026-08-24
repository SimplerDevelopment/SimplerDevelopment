// Per-solution card art — the dark 3:2 background behind each solution card in
// the Solutions mega menu and on /solutions. Web paths under public/solutions/.
//
// A separate module rather than a field on SolutionData, for two reasons. The
// first is precedent: solution-screenshots.ts is the same shape for the same
// reason. The second is that lib/data/solutions.ts is a tracked god file the
// file-size budget will not let grow, and nineteen `art:` lines is exactly the
// kind of growth that guardrail exists to stop.
//
// A slug with no entry renders no art and the card falls back to its Material
// icon — deliberately, so a new module can ship before its illustration does.
//
// STYLE CONTRACT for anything added here: 1960s mid-century retro-futurist
// screen-printed poster art, flat vector shapes, thin geometric linework,
// subtle halftone grain, and ONLY the four retro tokens — #0B0D14 near-black
// navy ground, #D8B15A gold, #FF5C2B orange, #F6F4F0 cream used sparingly.
// Horizontal 3:2. Quiet, low-contrast, mostly dark negative space, motif small
// and centred, dark margins on all sides, and no text/letters/numbers at all.
// These sit BEHIND white text — anything busy or bright breaks the card.
//
// They are opaque full-bleed cards, unlike the transparent cutouts in
// public/retro/. Do not run them through the retro pipeline: it trims to the
// alpha bounding box and would crop away the dark margins that make them work.
export const solutionArt: Record<string, string> = {
  'ai-connect': '/solutions/ai-connect.webp',
  'websites': '/solutions/websites.webp',
  'ecommerce': '/solutions/ecommerce.webp',
  'publishing': '/solutions/publishing.webp',
  'email-marketing': '/solutions/email-marketing.webp',
  'crm': '/solutions/crm.webp',
  'contracts': '/solutions/contracts.webp',
  // invoicing is in HIDDEN_SLUGS (see solutions.ts) so this never renders
  // today. Kept because the art exists and is correct — unhide the slug and
  // the card is illustrated with no further work.
  'invoicing': '/solutions/invoicing.webp',
  'booking': '/solutions/booking.webp',
  'surveys': '/solutions/surveys.webp',
  'experiments': '/solutions/experiments.webp',
  'project-management': '/solutions/project-management.webp',
  'help-desk': '/solutions/help-desk.webp',
  'company-brain': '/solutions/company-brain.webp',
  'ai-chatbot': '/solutions/ai-chatbot.webp',
  'automations': '/solutions/automations.webp',
  'pitch-decks': '/solutions/pitch-decks.webp',
  'agency': '/solutions/agency.webp',
  'hosting': '/solutions/hosting.webp',
};

export function getSolutionArt(slug: string): string | undefined {
  return solutionArt[slug];
}
