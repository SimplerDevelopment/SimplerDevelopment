/**
 * Relayer home page — faithful rebuild of userelayer.com.
 *
 * Section map (verified via computed styles on the live site):
 *   1. HERO          forest #032916, circuit SVG bottom-right — title left / body+CTA right
 *   2. PILL BAND     cream #E1DDD5 — "Purpose-built…" + 3 forest pills
 *   3. MISSING LAYER cream #E1DDD5 — heading + lead + BEFORE/AFTER forest circuit panels
 *   4. BRIEFING CTA  forest #032916 — left copy + white form card (html-render)
 *
 * Copy is VERBATIM from the source. Run after setup-client.ts.
 *   npx tsx scripts/migrations/relayer/import-home.ts
 */
import { T, makePage, upsertPage, ASSETS } from './_shared';
import { HOME_CSS, HOME_JS, panelHtml, marqueeHtml } from './_home-enhance';

type Dict = Record<string, unknown>;
const p = makePage();

// ─── 1. HERO (forest) ──────────────────────────────────────────────────────
const heroTitle = `AI Customer Care Layer <span class="rl-grad">for OEMs</span>`;
const heroCols = {
  id: 'hero-cols', type: 'columns', order: p.ord(), gap: 'lg', stackOnMobile: true,
  columns: [
    {
      id: 'hero-c-left', width: 56, padding: 'none', verticalAlign: 'center', blocks: [
        { id: 'hero-title', type: 'heading', order: p.ord(), content: heroTitle, level: 1, alignment: 'left',
          style: { color: T.OFFWHITE, fontFamily: T.HEAD, fontWeight: '600', fontSize: 'clamp(2.75rem,5.5vw,5rem)', letterSpacing: '-0.025em', lineHeight: '1.02', textAlign: 'left' } },
      ],
    },
    {
      id: 'hero-c-right', width: 44, padding: 'none', verticalAlign: 'center', blocks: [
        p.text('hero-body', "Manufacturers invest millions in customer satisfaction programs. Dealers are expected to execute them. Between the two, there's no shared system — just surveys, scores, and blind spots.", T.ON_DARK_SOFT, 'left', { fontSize: '1.25rem', maxWidth: '460px' }),
        p.text('hero-emph', 'The OEMs that see first, move first.', T.OFFWHITE, 'left', { fontSize: '1.25rem', fontWeight: '600', marginTop: '22px' }),
        p.button('hero-cta', 'Request a briefing', '/contact', 'primary', { alignment: 'left', style: { marginTop: '28px' } }),
      ],
    },
  ],
};
// Section bg is transparent so the wrapper's aurora + particle-network canvas (added by
// HOME_CSS/HOME_JS on [data-block-id="hero"]) show through behind the content.
p.add(p.section('hero', 'transparent', 0, [heroCols], {}, {
  minHeight: '90vh', paddingTop: '160px', paddingBottom: '130px',
}));

// ─── 1b. CAPABILITY MARQUEE (forest, full-bleed) ─────────────────────────────
p.add(p.section('cap-marquee-sec', T.FOREST, 30, [
  { id: 'cap-marquee', type: 'html-render', order: p.ord(), width: 'full', html: marqueeHtml([
    'OEM program orchestration', 'Post-sale customer care', 'Case management', 'Dealer scorecards',
    'Real-time alerts', 'Network benchmarking', 'Shared OEM + dealer visibility', 'Network-wide execution',
  ]) },
], {}, { paddingLeft: '0px', paddingRight: '0px', maxWidth: '100%' }));

// ─── 2. PILL BAND (cream) ────────────────────────────────────────────────────
const pillCols = {
  id: 'pill-cols', type: 'columns', order: p.ord(), gap: 'md', stackOnMobile: true,
  columns: ['AI-powered workflows', 'OEM + dealer visibility', 'Network-wide execution'].map((label, i) => ({
    id: `pill-col-${i}`, width: 33.33, padding: 'none', verticalAlign: 'center',
    blocks: [p.pill(`pill-${i}`, label)],
  })),
};
p.add(p.section('pill-band', T.CREAM, 72, [
  p.text('pill-lead', 'Purpose-built for OEMs managing dealer networks at scale', T.INK, 'center', { fontFamily: T.HEAD, fontWeight: '600', fontSize: '1.375rem', maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto', marginBottom: '36px' }),
  pillCols,
], {}, { paddingBottom: '40px' }));

// ─── 3. THE MISSING LAYER (cream) ────────────────────────────────────────────
const panel = (id: string, tag: string, variant: 'fragmented' | 'seamless', svg: string): Dict => ({
  id: `${id}-col`, width: 50, padding: 'none', verticalAlign: 'top',
  blocks: [
    { id: `${id}-art`, type: 'html-render', order: p.ord(), width: 'full', html: panelHtml(variant, tag, svg) },
  ],
});
const statement = (id: string, bold: string, body: string): Dict => ({
  id: `${id}-col`, width: 50, padding: 'sm', verticalAlign: 'top', blocks: [
    { id: `${id}-bold`, type: 'heading', order: p.ord(), content: bold, level: 3, alignment: 'left',
      style: { color: T.INK, fontFamily: T.HEAD, fontWeight: '600', fontSize: '1.5rem', letterSpacing: '-0.01em', lineHeight: '1.2', textAlign: 'left' } },
    p.text(`${id}-body`, body, T.INK_SOFT, 'left', { marginTop: '12px' }),
  ],
});
p.add(p.section('missing-layer', T.CREAM, 96, [
  p.heading('ml-h', 'The Missing Layer', 2, T.INK, 'center', { fontSize: 'clamp(2.25rem,4vw,4rem)' }),
  p.lead('ml-lead', 'Relayer creates the shared operational layer between manufacturers and dealer networks, replacing fragmented systems with consistent execution.', T.INK_SOFT, 'center'),
  p.spacer('ml-sp', 'lg'),
  { id: 'ml-panels', type: 'columns', order: p.ord(), gap: 'md', stackOnMobile: true, columns: [
    panel('frag', 'Before — Fragmented', 'fragmented', ASSETS.fragmented),
    panel('seam', 'After — Seamless', 'seamless', ASSETS.seamless),
  ] },
  p.spacer('ml-sp2', 'md'),
  { id: 'ml-statements', type: 'columns', order: p.ord(), gap: 'md', stackOnMobile: true, columns: [
    statement('frag-s', 'OEMs and dealers operate in disconnected systems after the sale.', "Programs are launched centrally but executed locally, with no shared visibility into what's actually happening at the dealer level. Performance is difficult to measure and consistency varies across the network."),
    statement('seam-s', 'OEMs and dealers work from one shared operational system.', 'Execution becomes consistent across the network and outcomes become measurable. Programs perform the way they were designed to — regardless of the store.'),
  ] },
]));

// ─── 4. BRIEFING CTA (forest) + white form card ──────────────────────────────
const formCardHtml = `
<div style="background:#FFFFFF;border-radius:24px;padding:36px;box-shadow:0 30px 70px rgba(0,0,0,0.30);font-family:'Hanken Grotesk',sans-serif;">
  <div style="display:grid;gap:16px;">
    <label style="display:block;font-size:0.8125rem;font-weight:600;color:#032916;">Full Name
      <input type="text" placeholder="Jane Doe" style="margin-top:6px;width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #D8D5CE;border-radius:12px;font-size:0.95rem;color:#032916;background:#FBFAF8;" />
    </label>
    <label style="display:block;font-size:0.8125rem;font-weight:600;color:#032916;">Work Email
      <input type="email" placeholder="jane@manufacturer.com" style="margin-top:6px;width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #D8D5CE;border-radius:12px;font-size:0.95rem;color:#032916;background:#FBFAF8;" />
    </label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <label style="display:block;font-size:0.8125rem;font-weight:600;color:#032916;">Company
        <input type="text" placeholder="Company" style="margin-top:6px;width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #D8D5CE;border-radius:12px;font-size:0.95rem;color:#032916;background:#FBFAF8;" />
      </label>
      <label style="display:block;font-size:0.8125rem;font-weight:600;color:#032916;">Title
        <input type="text" placeholder="Title" style="margin-top:6px;width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #D8D5CE;border-radius:12px;font-size:0.95rem;color:#032916;background:#FBFAF8;" />
      </label>
    </div>
    <label style="display:block;font-size:0.8125rem;font-weight:600;color:#032916;">Organization Type
      <select style="margin-top:6px;width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #D8D5CE;border-radius:12px;font-size:0.95rem;color:#032916;background:#FBFAF8;">
        <option>Select…</option><option>OEM / Manufacturer</option><option>Dealer Group</option><option>Technology Partner</option><option>Consultant / Advisor</option><option>Other</option>
      </select>
    </label>
    <a href="/contact" style="display:inline-flex;align-items:center;justify-content:center;gap:10px;margin-top:6px;padding:16px 24px;background:#23EE92;color:#032916;font-weight:600;font-size:1rem;border-radius:52px;text-decoration:none;">Book a demo <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#032916;color:#23EE92;">→</span></a>
  </div>
</div>`.trim();

const briefingCols = {
  id: 'brief-cols', type: 'columns', order: p.ord(), gap: 'lg', stackOnMobile: true,
  columns: [
    { id: 'brief-c-left', width: 46, padding: 'none', verticalAlign: 'center', blocks: [
      { id: 'brief-h', type: 'heading', order: p.ord(), content: `Schedule a <span class="rl-grad">product briefing</span>`, level: 2, alignment: 'left',
        style: { color: T.OFFWHITE, fontFamily: T.HEAD, fontWeight: '600', fontSize: 'clamp(2.25rem,4vw,3.75rem)', letterSpacing: '-0.02em', lineHeight: '1.05', textAlign: 'left' } },
      p.text('brief-body', 'See how Relayer creates shared visibility and execution across your dealer network. The briefing covers the post-sale gap, how the platform works, and a tailored path to implementation.', T.ON_DARK_SOFT, 'left', { fontSize: '1.125rem', marginTop: '20px', maxWidth: '460px' }),
      p.text('brief-note', 'Private demos for manufacturers and qualified partners.', T.MINT, 'left', { fontSize: '0.9375rem', fontWeight: '600', marginTop: '20px' }),
    ] },
    { id: 'brief-c-right', width: 54, padding: 'none', verticalAlign: 'center', blocks: [
      { id: 'brief-form', type: 'html-render', order: p.ord(), html: formCardHtml, width: 'full' },
    ] },
  ],
};
p.add(p.section('briefing', T.FOREST, 104, [briefingCols], { id: 'briefing' }));

upsertPage({
  slug: 'home', title: 'Home',
  seoTitle: 'Relayer | AI Customer Care Layer for OEMs',
  seoDescription: 'Relayer is the AI customer care layer for OEMs — replacing fragmented post-sale systems with shared visibility and consistent execution across dealer networks.',
  ogImage: ASSETS.og,
  customCss: HOME_CSS,
  customJs: HOME_JS,
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
