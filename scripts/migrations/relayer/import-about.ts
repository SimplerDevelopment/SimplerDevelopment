/**
 * Relayer about page — faithful rebuild of userelayer.com/about.
 *
 * Section map:
 *   1. HERO          forest #032916 — "Built by people who live in the dealer network."
 *   2. WHY WE BUILT  cream #E1DDD5  — origin story + mission text
 *   3. WHAT WE BELIEVE cream #E1DDD5 — 3-column card grid (values)
 *   4. WHO WE ARE    forest #032916  — company + location
 *   5. BRIEFING CTA  forest #032916  — standard CTA
 *
 * Run after setup-client.ts:
 *   npx tsx scripts/migrations/relayer/import-about.ts
 */
import { T, makePage, upsertPage } from './_shared';

const p = makePage();

// ─── 1. HERO (forest) ──────────────────────────────────────────────────────
p.add(p.hero({
  subtitle: 'ABOUT RELAYER',
  title: 'Built by people who live in the dealer network.',
  description: 'Relayer is the AI customer care layer for OEMs — created to close the gap between the programs manufacturers design and the experience customers actually get at the dealer.',
  ctaText: 'Request a briefing',
  ctaLink: '/contact',
}));

// ─── 2. WHY WE BUILT RELAYER (cream) ────────────────────────────────────────
p.add(p.section('why-we-built', T.CREAM, 96, [
  p.heading('why-h', 'Why we built Relayer', 2, T.INK, 'center'),
  p.lead('why-lead', "Manufacturers invest millions in customer satisfaction programs. Dealers are expected to execute them. Between the two, there's no shared system — just surveys, scores, and blind spots."),
  p.text('why-body', 'We started Relayer because we\'ve seen this gap from the inside: programs launched centrally, executed locally, and measured only after the customer has already churned. The OEMs that see first, move first — so we built the shared layer that lets them.', T.INK_SOFT, 'center', { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' }),
]));

// ─── 3. WHAT WE BELIEVE (cream) — 3-column card grid ────────────────────────
const valuesGrid = {
  id: 'values-grid',
  type: 'card-grid',
  order: p.ord(),
  columns: 3,
  cards: [
    { id: 'card-visibility', title: 'Shared visibility', icon: 'visibility', description: 'One operational picture across the OEM and every store in the network.' },
    { id: 'card-execution', title: 'Consistent execution', icon: 'sync_alt', description: 'Programs perform the way they were designed to — regardless of the dealership.' },
    { id: 'card-outcomes', title: 'Measurable outcomes', icon: 'insights', description: 'Move from lagging survey scores to leading, store-by-store signals.' },
  ],
  elementStyles: {
    card: { backgroundColor: T.WHITE, borderRadius: '20px', borderWidth: '1px', borderColor: 'rgba(3,41,22,0.10)', borderStyle: 'solid', customCSS: 'box-shadow:0 14px 40px rgba(3,41,22,0.06)' },
    cardTitle: { color: T.INK, fontFamily: T.HEAD, fontWeight: '600' },
    cardDescription: { color: T.INK_SOFT, fontFamily: T.BODY },
    cardIcon: { color: T.MINT_D },
  },
};

p.add(p.section('what-we-believe', T.CREAM, 96, [
  p.heading('believe-h', 'What we believe', 2, T.INK, 'center'),
  p.spacer('believe-sp', 'md'),
  valuesGrid,
]));

// ─── 4. WHO WE ARE (forest) ──────────────────────────────────────────────────
p.add(p.section('who-we-are', T.FOREST, 96, [
  p.heading('who-h', 'Who we are', 2, T.OFFWHITE, 'center'),
  p.text('who-body', 'Relayer is a product of AutoAssist, Inc., an AI-native software company based in West Chester, Pennsylvania. We build operational software for the automotive industry — grounded in the realities of how OEMs and dealer networks actually work together after the sale.', T.ON_DARK_SOFT, 'center', { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' }),
]));

// ─── 5. BRIEFING CTA ─────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Schedule a product briefing',
  description: 'See how Relayer creates shared visibility and execution across your dealer network.',
  primaryButtonText: 'Request a briefing',
  primaryButtonUrl: '/contact',
}));

upsertPage({
  slug: 'about',
  title: 'About',
  seoTitle: 'About Relayer | Built by people who live in the dealer network',
  seoDescription: 'Relayer is the AI customer care layer for OEMs — created to close the gap between the programs manufacturers design and the experience customers actually get at the dealer.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
