/**
 * Import PropertyRadar /compare/propertyradar-vs-mashvisor page.
 * Run: npx tsx scripts/migrations/propertyradar/import-compare-mashvisor.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// 1. Hero
p.add(p.hero({
  title: 'PropertyRadar vs Mashvisor',
  subtitle: 'HONEST COMPARISON',
  description: 'Mashvisor helps you analyze on-market properties. PropertyRadar helps you find, qualify, and reach motivated off-market owners — with 300+ criteria, court-sourced signals, and built-in multi-channel outreach.',
  ctaText: 'Try it Free', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// 2. Head-to-head accordion (T.WHITE)
p.add(p.section('sec-compare', T.WHITE, 96, [
  p.overline('cmp-ov', 'HEAD-TO-HEAD'),
  p.heading('cmp-h', 'Why companies are making the switch from Mashvisor to PropertyRadar'),
  p.lead('cmp-l', 'Mashvisor is built for on-market analysis. PropertyRadar is built for finding off-market opportunities, understanding motivation, and acting fast with automated outreach.'),
  p.spacer('cmp-sp', 'md'),
  {
    id: 'cmp-accordion', type: 'accordion', order: p.ord(),
    items: [
      {
        id: 'a1',
        title: 'Off-market vs on-market focus',
        content: 'Mashvisor focuses on analyzing listed properties — Airbnb ROI, rental rates, and market trends for on-market deals. PropertyRadar is built for finding off-market opportunities: pre-foreclosures, probate, high-equity owners, vacant properties, and motivated sellers before they list.',
      },
      {
        id: 'a2',
        title: 'Targeting criteria — 300+ vs limited',
        content: 'PropertyRadar gives you 300+ distinct search criteria and 75+ Quick Lists that teach you exactly which signals to hunt for — and why. Mashvisor\'s filtering is primarily oriented toward investment performance metrics, not seller motivation signals.',
      },
      {
        id: 'a3',
        title: 'Reach out to leads your competitors aren\'t targeting',
        content: 'With PropertyRadar\'s exclusive criteria combinations — owner demographics, court-sourced life events, 30 distress signals — you find leads that go completely uncontested. Mashvisor users are competing for the same on-market listings as everyone else.',
      },
      {
        id: 'a4',
        title: 'Built-in skip tracing & contact data',
        content: 'PropertyRadar includes phone numbers and email addresses in your subscription, searchable before list-build. Mashvisor does not offer skip tracing or direct owner contact data — you\'d need a separate tool and separate cost.',
      },
      {
        id: 'a5',
        title: 'Comparable sales — best in the industry',
        content: 'PropertyRadar\'s comps are heads and shoulders above Mashvisor\'s. Pro investors and agents rely on our recent-sale comps to make confident buy decisions — with coverage across all property types and 3,000+ counties.',
      },
      {
        id: 'a6',
        title: 'Marketing automation & CRM integrations',
        content: 'PropertyRadar includes automated multi-channel campaigns (mail, email, SMS, display ads) and integrates with Pipedrive, LionDesk, SalesRabbit, and more. Mashvisor is an analytics dashboard — outreach is entirely up to you.',
      },
    ],
    elementStyles: {
      itemTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600', fontSize: '1.0625rem' },
      itemContent: { color: T.INK, fontSize: '1rem', lineHeight: '1.7' },
    },
  },
]));

// 3. Dark "moment" — why pros switch (services-grid on navy)
p.add(p.section('sec-switch', T.NAVY, 116, [
  {
    id: 'switch-grid', type: 'services-grid', order: p.ord(), columns: 2, accentColor: T.GREEN,
    overline: 'WHY PROS SWITCH', title: 'What you gain when you move to PropertyRadar',
    description: 'Mashvisor helps you evaluate what\'s already on the market. PropertyRadar helps you find what\'s about to hit the market — before anyone else knows it\'s available.',
    services: [
      {
        id: 'sw1',
        title: 'Built for pros, not beginners',
        description: 'PropertyRadar\'s platform is designed for professional investors and agents who need serious targeting criteria, verified data quality, and marketing automation — not just a dashboard to explore listings.',
        icon: 'workspace_premium',
      },
      {
        id: 'sw2',
        title: 'Acquire off-market deals',
        description: 'Find pre-foreclosures, properties in distress, high-equity owners ready to downsize, empty nesters, and more — all before they list. Paying market rate makes it harder to profit; PropertyRadar helps you buy wholesale.',
        icon: 'trending_up',
      },
      {
        id: 'sw3',
        title: 'Quick Lists that teach you what to hunt for',
        description: 'Not sure where to start? Apply one of 75 Quick Lists to your market and see the exact criteria pre-selected and why. It\'s expert strategy built right into the search interface.',
        icon: 'bolt',
      },
      {
        id: 'sw4',
        title: 'From lead to close, in one platform',
        description: 'PropertyRadar handles the full workflow: find leads with 300+ criteria, understand them with deep property and owner data, reach out with automated multi-channel campaigns, and track results with CRM integrations.',
        icon: 'loop',
      },
    ],
    elementStyles: {
      overline: { color: T.GREEN, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em' },
      description: { color: 'rgba(255,255,255,0.72)' },
      serviceTitle: { color: T.WHITE, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: 'rgba(255,255,255,0.72)' },
      serviceIcon: { color: T.GREEN },
      card: {
        backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: '1px',
        borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'solid', borderRadius: '16px',
      },
    },
  },
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// 4. Testimonial (T.TINT)
p.add(p.section('sec-testimonial', T.TINT, 96, [
  p.overline('t-ov', 'MORE ROI ON YOUR INVESTING'),
  p.heading('t-h', 'See why pros trust PropertyRadar over analytics tools'),
  p.spacer('t-sp', 'md'),
  {
    id: 'test1', type: 'testimonial', order: p.ord(),
    quote: 'The pros buy off-market, and PropertyRadar is how you do it. It gives you the best targeting criteria, the most accurate comps, and marketing integrations so you can build a system — not just a spreadsheet.',
    author: 'PropertyRadar Customer',
    role: 'Real Estate Investor',
    elementStyles: {
      quote: { color: T.NAVY, fontFamily: T.PF, fontSize: '1.1875rem', lineHeight: '1.7', fontStyle: 'italic' },
      author: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '600' },
      role: { color: T.INK },
    },
  },
  p.spacer('t-sp2', 'md'),
  {
    id: 'test2', type: 'testimonial', order: p.ord(),
    quote: 'I have never come across a more well-rounded, accurate, cutting-edge, data-driven tool like PropertyRadar. The off-market opportunities I find here simply don\'t exist anywhere else.',
    author: 'Patrick Ferry',
    role: 'Real Estate Investor, San Diego, CA',
    elementStyles: {
      quote: { color: T.NAVY, fontFamily: T.PF, fontSize: '1.1875rem', lineHeight: '1.7', fontStyle: 'italic' },
      author: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '600' },
      role: { color: T.INK },
    },
  },
]));

// 5. CTA
p.add(p.ctaBlock({
  title: 'See the difference yourself',
  description: 'Try PropertyRadar free — full access to data, 300+ filters, off-market targeting, and marketing tools. Quick setup.',
  primaryButtonText: 'Try it Free',
  primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing',
  secondaryButtonUrl: '/pricing',
}));

// 6. Footer
p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'compare/propertyradar-vs-mashvisor',
  title: 'PropertyRadar vs Mashvisor',
  seoTitle: 'PropertyRadar Vs. Mashvisor | Full Comparison',
  seoDescription: 'Curious about the difference between PropertyRadar vs. Mashvisor? Check out our comparison table and learn about PropertyRadar as a Mashvisor alternative.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
