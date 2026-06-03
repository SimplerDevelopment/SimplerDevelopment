/**
 * Relayer solutions page — faithful rebuild of the Solutions page.
 *
 * Section map:
 *   1. HERO              forest #032916 — "Built for both sides of the network."
 *   2. FOR OEMs          cream  #E1DDD5 — heading + lead + 3-card grid
 *   3. FOR DEALER GROUPS forest #032916 — heading + text + 3-card grid (dark cards)
 *   4. FOR TECH PARTNERS cream  #E1DDD5 — heading + centered text
 *   5. BRIEFING CTA      forest #032916 — standard CTA
 *
 * Run after setup-client.ts:
 *   npx tsx scripts/migrations/relayer/import-solutions.ts
 */
import { T, makePage, upsertPage } from './_shared';

const p = makePage();

// ─── 1. HERO (forest) ──────────────────────────────────────────────────────
p.add(p.hero({
  subtitle: 'SOLUTIONS',
  title: 'Built for both sides of the network.',
  description: 'Relayer serves the manufacturer and the dealer with one shared system — aligning visibility, incentives, and execution across post-sale customer care.',
  ctaText: 'Request a briefing',
  ctaLink: '/contact',
}));

// ─── 2. FOR OEMs & MANUFACTURERS (cream) ────────────────────────────────────
const oemGrid = {
  id: 'oem-grid',
  type: 'card-grid',
  order: p.ord(),
  columns: 3,
  cards: [
    { id: 'card-see-first', title: 'See first', icon: 'visibility', description: 'Replace lagging survey scores with leading operational signals you can act on first.' },
    { id: 'card-launch-once', title: 'Launch once', icon: 'rocket_launch', description: 'Design a program centrally and execute it uniformly across the whole network.' },
    { id: 'card-prove-impact', title: 'Prove impact', icon: 'insights', description: 'Measure outcomes store by store, not quarters after the fact.' },
  ],
  elementStyles: {
    card: { backgroundColor: T.WHITE, borderRadius: '20px', borderWidth: '1px', borderColor: 'rgba(3,41,22,0.10)', borderStyle: 'solid', customCSS: 'box-shadow:0 14px 40px rgba(3,41,22,0.06)' },
    cardTitle: { color: T.INK, fontFamily: T.HEAD, fontWeight: '600' },
    cardDescription: { color: T.INK_SOFT, fontFamily: T.BODY },
    cardIcon: { color: T.MINT_D },
  },
};

p.add(p.section('for-oems', T.CREAM, 96, [
  p.heading('oem-h', 'For OEMs & Manufacturers', 2, T.INK, 'center'),
  p.lead('oem-lead', "See what's actually happening at the dealer level — in real time. Launch customer-care programs once and trust they'll execute consistently across every store."),
  p.spacer('oem-sp', 'md'),
  oemGrid,
]));

// ─── 3. FOR DEALER GROUPS (forest) ──────────────────────────────────────────
const dealerGrid = {
  id: 'dealer-grid',
  type: 'card-grid',
  order: p.ord(),
  columns: 3,
  cards: [
    { id: 'card-clear-expectations', title: 'Clear expectations', icon: 'checklist', description: 'Guided, AI-assisted workflows make every OEM program simple to execute.' },
    { id: 'card-transparent-perf', title: 'Transparent performance', icon: 'scoreboard', description: 'Shared data instead of opaque scores you can\'t influence.' },
    { id: 'card-competitive-edge', title: 'Competitive edge', icon: 'workspace_premium', description: 'Turn customer care into an advantage at every rooftop.' },
  ],
  elementStyles: {
    card: { backgroundColor: '#0A3A22', borderRadius: '20px', borderWidth: '1px', borderColor: 'rgba(35,238,146,0.18)', borderStyle: 'solid', customCSS: 'box-shadow:0 24px 60px rgba(0,0,0,0.28);transition:all .3s ease' },
    cardTitle: { color: T.OFFWHITE, fontFamily: T.HEAD, fontWeight: '600' },
    cardDescription: { color: T.ON_DARK_SOFT, fontFamily: T.BODY },
    cardIcon: { color: T.MINT },
  },
};

p.add(p.section('for-dealers', T.FOREST, 96, [
  p.heading('dealer-h', 'For Dealer Groups', 2, T.OFFWHITE, 'center'),
  p.text('dealer-body', "Know exactly what each OEM program expects, with guided workflows that make execution simple — and show your performance with shared, transparent data.", T.ON_DARK_SOFT, 'center', { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' }),
  p.spacer('dealer-sp', 'md'),
  dealerGrid,
]));

// ─── 4. FOR TECHNOLOGY PARTNERS (cream) ──────────────────────────────────────
p.add(p.section('for-tech-partners', T.CREAM, 96, [
  p.heading('tech-h', 'For Technology Partners', 2, T.INK, 'center'),
  p.text('tech-body', 'Relayer is built to integrate. Partner with us to extend the shared layer across the tools OEMs and dealers already rely on.', T.INK_SOFT, 'center', { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' }),
]));

// ─── 5. BRIEFING CTA ─────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Schedule a product briefing',
  description: 'See how Relayer creates shared visibility and execution across your dealer network.',
  primaryButtonText: 'Request a briefing',
  primaryButtonUrl: '/contact',
}));

upsertPage({
  slug: 'solutions',
  title: 'Solutions',
  seoTitle: 'Solutions | Relayer — Built for both sides of the network',
  seoDescription: 'Relayer serves the manufacturer and the dealer with one shared system — aligning visibility, incentives, and execution across post-sale customer care.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
