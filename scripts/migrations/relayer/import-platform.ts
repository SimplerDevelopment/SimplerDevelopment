/**
 * Relayer platform page — faithful rebuild of userelayer.com/platform.
 *
 * Section map:
 *   1. HERO          forest — title + description + CTA
 *   2. HOW IT WORKS  cream  — heading + lead + 3-column card-grid
 *   3. FROM FRAG→SEAM cream  — heading + lead + BEFORE/AFTER panels + statement columns
 *   4. CAPABILITIES  cream  — heading + 6-card grid
 *   5. BRIEFING CTA  forest — schedule a product briefing
 *
 * Run after setup-client.ts:
 *   npx tsx scripts/migrations/relayer/import-platform.ts
 */
import { T, makePage, upsertPage, ASSETS } from './_shared';

type Dict = Record<string, unknown>;
const p = makePage();

// ─── 1. HERO (forest) ──────────────────────────────────────────────────────────
p.add(p.hero({
  id: 'hero',
  subtitle: 'THE PLATFORM',
  title: 'The shared operational layer for post-sale customer care.',
  description: 'Relayer connects manufacturers and dealer networks in one system — so programs execute consistently, performance is visible in real time, and customer care actually improves.',
  ctaText: 'Request a briefing',
  ctaLink: '/contact',
}));

// ─── 2. HOW RELAYER WORKS (cream) ──────────────────────────────────────────────
p.add(p.section('how-it-works', T.CREAM, 96, [
  p.heading('hiw-h', 'How Relayer works', 2, T.INK, 'center', { fontSize: 'clamp(2.25rem,4vw,4rem)' }),
  p.lead('hiw-lead', 'Purpose-built for OEMs managing dealer networks at scale.', T.INK_SOFT, 'center'),
  p.spacer('hiw-sp', 'lg'),
  {
    id: 'hiw-grid', type: 'card-grid', order: p.ord(), columns: 3,
    cards: [
      {
        id: 'hiw-c1', title: 'AI-powered workflows', icon: 'smart_toy',
        description: 'Relayer turns each OEM program into guided, AI-assisted workflows that run the same way at every dealership — routing the right action to the right person at the right moment.',
      },
      {
        id: 'hiw-c2', title: 'OEM + dealer visibility', icon: 'visibility',
        description: 'Both sides work from one shared operational picture. Manufacturers see what\'s happening at the store level; dealers see exactly what\'s expected of them.',
      },
      {
        id: 'hiw-c3', title: 'Network-wide execution', icon: 'hub',
        description: 'Programs launch once and execute everywhere. Relayer makes consistency the default across the entire network, not the exception.',
      },
    ],
    elementStyles: {
      card: {
        backgroundColor: T.WHITE, borderRadius: '20px', borderWidth: '1px',
        borderColor: 'rgba(3,41,22,0.10)', borderStyle: 'solid',
        customCSS: 'box-shadow:0 14px 40px rgba(3,41,22,0.06)',
      },
      cardTitle: { color: T.INK, fontFamily: T.HEAD, fontWeight: '600' },
      cardDescription: { color: T.INK_SOFT, fontFamily: T.BODY },
      cardIcon: { color: T.MINT_D },
    },
  },
]));

// ─── 3. FROM FRAGMENTED TO SEAMLESS (cream) ─────────────────────────────────────
const panel = (id: string, tag: string, svg: string, alt: string): Dict => ({
  id: `${id}-col`, width: 50, padding: 'lg', verticalAlign: 'top',
  backgroundColor: T.FOREST,
  blocks: [
    {
      id: `${id}-tag`, type: 'text', order: p.ord(), content: tag, alignment: 'left',
      style: {
        color: T.MINT, fontFamily: T.BODY, fontWeight: '600',
        letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: '0.75rem', marginBottom: '18px',
      },
    },
    { id: `${id}-img`, type: 'image', order: p.ord(), url: svg, alt, width: 'full', alignment: 'center' },
  ],
});

const statement = (id: string, bold: string, body: string): Dict => ({
  id: `${id}-col`, width: 50, padding: 'sm', verticalAlign: 'top',
  blocks: [
    {
      id: `${id}-bold`, type: 'heading', order: p.ord(), content: bold, level: 3, alignment: 'left',
      style: {
        color: T.INK, fontFamily: T.HEAD, fontWeight: '600',
        fontSize: '1.5rem', letterSpacing: '-0.01em', lineHeight: '1.2', textAlign: 'left',
      },
    },
    p.text(`${id}-body`, body, T.INK_SOFT, 'left', { marginTop: '12px' }),
  ],
});

p.add(p.section('frag-to-seam', T.CREAM, 96, [
  p.heading('fts-h', 'From fragmented to seamless', 2, T.INK, 'center', { fontSize: 'clamp(2.25rem,4vw,4rem)' }),
  p.lead('fts-lead', 'Relayer replaces disconnected post-sale systems with one shared operational layer.', T.INK_SOFT, 'center'),
  p.spacer('fts-sp', 'lg'),
  {
    id: 'fts-panels', type: 'columns', order: p.ord(), gap: 'md', stackOnMobile: true,
    columns: [
      panel('frag', 'BEFORE — FRAGMENTED', ASSETS.fragmented, 'Fragmented post-sale systems: disconnected circuit lines'),
      panel('seam', 'AFTER — SEAMLESS', ASSETS.seamless, 'Seamless shared system: aligned circuit lines'),
    ],
  },
  p.spacer('fts-sp2', 'md'),
  {
    id: 'fts-statements', type: 'columns', order: p.ord(), gap: 'md', stackOnMobile: true,
    columns: [
      statement('frag-s', 'OEMs and dealers operate in disconnected systems after the sale.', "Programs are launched centrally but executed locally, with no shared visibility into what's actually happening at the dealer level."),
      statement('seam-s', 'OEMs and dealers work from one shared operational system.', 'Execution becomes consistent across the network and outcomes become measurable — regardless of the store.'),
    ],
  },
]));

// ─── 4. CAPABILITIES (cream) ────────────────────────────────────────────────────
p.add(p.section('capabilities', T.CREAM, 96, [
  p.heading('cap-h', 'Capabilities', 2, T.INK, 'center', { fontSize: 'clamp(2.25rem,4vw,4rem)' }),
  p.spacer('cap-sp', 'lg'),
  {
    id: 'cap-grid', type: 'card-grid', order: p.ord(), columns: 3,
    cards: [
      {
        id: 'cap-c1', title: 'Program orchestration', icon: 'account_tree',
        description: 'Design a customer-care program once; Relayer runs it across every store.',
      },
      {
        id: 'cap-c2', title: 'Case management', icon: 'support_agent',
        description: 'Track every post-sale case to resolution with shared context.',
      },
      {
        id: 'cap-c3', title: 'Dealer scorecards', icon: 'scoreboard',
        description: 'Transparent, shared performance — not opaque survey scores.',
      },
      {
        id: 'cap-c4', title: 'Real-time alerts', icon: 'notifications_active',
        description: 'Surface issues while they\'re still fixable, store by store.',
      },
      {
        id: 'cap-c5', title: 'Outcome analytics', icon: 'insights',
        description: 'Measure what the program was designed to achieve.',
      },
      {
        id: 'cap-c6', title: 'Network benchmarking', icon: 'leaderboard',
        description: 'Compare performance across the network to find what works.',
      },
    ],
    elementStyles: {
      card: {
        backgroundColor: T.WHITE, borderRadius: '20px', borderWidth: '1px',
        borderColor: 'rgba(3,41,22,0.10)', borderStyle: 'solid',
        customCSS: 'box-shadow:0 14px 40px rgba(3,41,22,0.06)',
      },
      cardTitle: { color: T.INK, fontFamily: T.HEAD, fontWeight: '600' },
      cardDescription: { color: T.INK_SOFT, fontFamily: T.BODY },
      cardIcon: { color: T.MINT_D },
    },
  },
]));

// ─── 5. BRIEFING CTA (forest) ───────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Schedule a product briefing',
  description: 'See how Relayer creates shared visibility and execution across your dealer network.',
  primaryButtonText: 'Request a briefing',
  primaryButtonUrl: '/contact',
}));

upsertPage({
  slug: 'platform',
  title: 'Platform',
  seoTitle: 'Platform | Relayer — Shared operational layer for post-sale customer care',
  seoDescription: 'Relayer connects OEMs and dealer networks in one shared operational system — consistent program execution, real-time visibility, and measurable customer care outcomes.',
  ogImage: ASSETS.og,
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
