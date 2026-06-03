/**
 * Import PropertyRadar /compare/propertyradar-vs-batchleads page.
 * Run: npx tsx scripts/migrations/propertyradar/import-compare-batchleads.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// 1. Hero
p.add(p.hero({
  title: 'PropertyRadar vs BatchLeads',
  subtitle: 'HONEST COMPARISON',
  description: 'Your search for a BatchLeads alternative is finally over. PropertyRadar gives you 300+ targeting criteria, all-in-one transparent pricing, and built-in multi-channel marketing — in a single platform.',
  ctaText: 'Try it Free', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// 2. Head-to-head feature accordion (T.WHITE)
p.add(p.section('sec-compare', T.WHITE, 96, [
  p.overline('cmp-ov', 'HEAD-TO-HEAD'),
  p.heading('cmp-h', 'Why choose PropertyRadar over BatchLeads?'),
  p.lead('cmp-l', 'A transparent look at search depth, data quality, marketing automation, and pricing — so you can make the right call for your business.'),
  p.spacer('cmp-sp', 'md'),
  {
    id: 'cmp-accordion', type: 'accordion', order: p.ord(),
    items: [
      {
        id: 'a1',
        title: 'Search criteria — 300+ vs 50',
        content: 'PropertyRadar gives you 300+ distinct search criteria and 100+ Quick Lists to build exclusive lists in your market. BatchLeads offers around 50 search criteria and only 11 Quick Lists — meaning you\'ll be working the same leads as everyone else in your area.',
      },
      {
        id: 'a2',
        title: 'Pricing — all-in vs add-on stacking',
        content: 'PropertyRadar\'s subscription includes list building, list monitoring, comping, skip tracing, unlimited properties and lists, and driving for dollars — everything you need to scale. BatchLeads requires separate add-ons for list monitoring and list building, so costs grow quickly.',
      },
      {
        id: 'a3',
        title: 'Owner demographic data',
        content: 'PropertyRadar includes comprehensive owner demographic data: age, income level, ethnicity, presence of children, and more — all searchable before you build your list. BatchLeads offers limited demographic access and not in all states.',
      },
      {
        id: 'a4',
        title: 'Multi-sourced data vs single aggregator',
        content: 'PropertyRadar tests multiple data sources head-to-head per county, back-tests against actual county records, and uses NLP/ML enrichment. BatchLeads pulls from a single data vendor without comparative quality testing.',
      },
      {
        id: 'a5',
        title: 'Marketing & automation',
        content: 'PropertyRadar: 6-channel automated outreach (mail, email, phone, SMS, display ads, door-knocking) that fires automatically when new leads hit your criteria. BatchLeads\' marketing capabilities are more limited and require more manual coordination.',
      },
      {
        id: 'a6',
        title: 'Skip tracing',
        content: 'PropertyRadar includes 250 phone lookups free per month ($.08/record after) — with contact data that is searchable and includes LLC-to-person resolution via OwnerGraph™. BatchLeads charges separately for skip tracing on most plans.',
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
    description: 'BatchLeads users who switch to PropertyRadar consistently cite these four advantages as game-changers for their business.',
    services: [
      {
        id: 'sw1',
        title: 'Carve out your own opportunities',
        description: 'With 300+ targeting criteria, you can find leads that go far beyond vacancies and foreclosures — empty nesters, high-equity owners, vacation homeowners, and more. Criteria your competitors aren\'t using.',
        icon: 'explore',
      },
      {
        id: 'sw2',
        title: 'Segment and test criteria',
        description: 'Create unlimited lists with different criteria sets to test your targeting and outreach strategies. Find what converts, then automate it at scale.',
        icon: 'tune',
      },
      {
        id: 'sw3',
        title: 'Deep insights on every lead',
        description: 'For every lead, you get the full picture: property details, owner demographics, equity, distress signals, and contact info. For every list, you get trends and insights to sharpen your messaging.',
        icon: 'insights',
      },
      {
        id: 'sw4',
        title: 'No hidden add-on costs',
        description: 'Property comps, skip tracing, list monitoring, driving for dollars — all included in your plan. No surprise charges when you need a feature that should have been included from day one.',
        icon: 'price_check',
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
  p.overline('t-ov', 'WHAT CUSTOMERS SAY'),
  p.heading('t-h', 'See why pros trust PropertyRadar over anything else'),
  p.spacer('t-sp', 'md'),
  {
    id: 'test1', type: 'testimonial', order: p.ord(),
    quote: 'PropertyRadar is the only software that gives you everything you need in one place — data, targeting, marketing, and automation. With BatchLeads I was always patching together extra tools just to do what PropertyRadar does natively.',
    author: 'PropertyRadar Customer',
    role: 'Real Estate Investor',
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
  description: 'Try PropertyRadar free — full access to data, filters, and marketing tools. No credit card required.',
  primaryButtonText: 'Try it Free',
  primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing',
  secondaryButtonUrl: '/pricing',
}));

// 6. Footer
p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'compare/propertyradar-vs-batchleads',
  title: 'PropertyRadar vs BatchLeads',
  seoTitle: 'PropertyRadar Vs. BatchLeads | Full Comparison',
  seoDescription: 'Curious about the difference between PropertyRadar vs. BatchLeads? Check out our feature chart and learn about PropertyRadar as a BatchLeads alternative.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
