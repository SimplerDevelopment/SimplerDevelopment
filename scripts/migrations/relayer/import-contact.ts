/**
 * Relayer — Contact / "Request a Briefing" page
 * slug: contact
 */
import { T, makePage, upsertPage, ASSETS } from './_shared';

const FORM_HTML = `<div style="background:#FFFFFF;border-radius:24px;padding:36px;box-shadow:0 30px 70px rgba(0,0,0,0.18);font-family:'Hanken Grotesk',sans-serif;">
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
    <a href="#" style="display:inline-flex;align-items:center;justify-content:center;gap:10px;margin-top:6px;padding:16px 24px;background:#23EE92;color:#032916;font-weight:600;font-size:1rem;border-radius:52px;text-decoration:none;">Book a demo <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#032916;color:#23EE92;">&#8594;</span></a>
  </div>
</div>`;

const p = makePage();

// 1. HERO
p.add(p.hero({
  subtitle: 'REQUEST A BRIEFING',
  title: 'Schedule a product briefing.',
  description: 'See how Relayer creates shared visibility and execution across your dealer network. The briefing covers the post-sale gap, how the platform works, and a tailored path to implementation.',
}));

// 2. CREAM section with two-column layout
const formBlock = {
  id: 'contact-form',
  type: 'html-render',
  order: p.ord(),
  html: FORM_HTML,
  width: 'full',
};

const twoCol = {
  id: 'contact-columns',
  type: 'columns',
  order: p.ord(),
  gap: 'lg',
  stackOnMobile: true,
  columns: [
    {
      id: 'col-left',
      width: 42,
      padding: 'none',
      verticalAlign: 'top',
      blocks: [
        p.heading('briefing-heading', 'What the briefing covers', 2, T.INK, 'left'),
        p.text('bullet-1', '• The post-sale gap — and where it\'s quietly costing you.', T.INK_SOFT, 'left'),
        p.text('bullet-2', '• How the shared OEM ↔ dealer operational layer works.', T.INK_SOFT, 'left'),
        p.text('bullet-3', '• A live look at AI-powered customer-care workflows.', T.INK_SOFT, 'left'),
        p.text('bullet-4', '• A tailored path to implementation across your network.', T.INK_SOFT, 'left'),
        p.text('private-demos', 'Private demos for manufacturers and qualified partners.', T.MINT, 'left', { fontWeight: '600', marginTop: '16px' }),
      ],
    },
    {
      id: 'col-right',
      width: 58,
      padding: 'none',
      verticalAlign: 'top',
      blocks: [formBlock],
    },
  ],
};

p.add(p.section('contact-body', T.CREAM, 96, [twoCol]));

// 3. Closing email note (no ctaBlock — this page IS the briefing)
p.add(p.section('contact-footer-note', T.CREAM, 32, [
  p.text('email-note', 'Prefer email? Reach us at hello@userelayer.com.', T.INK_SOFT, 'center'),
], {}, { paddingTop: '0px' }));

upsertPage(
  {
    slug: 'contact',
    title: 'Request a Briefing',
    seoTitle: 'Request a Briefing | Relayer',
    seoDescription: 'Schedule a product briefing to see how Relayer creates shared visibility and execution across your dealer network.',
  },
  p.blocks,
).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
