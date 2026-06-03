/**
 * Import PropertyRadar /compare/propertyradar-vs-propstream page.
 * Run: npx tsx scripts/migrations/propertyradar/import-compare-propstream.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// 1. Hero
p.add(p.hero({
  title: 'PropertyRadar vs PropStream',
  subtitle: 'HONEST COMPARISON',
  description: 'PropStream resells bulk data from aggregators. PropertyRadar earns it, verifies it, and helps you act on it — with 300+ search criteria, court-sourced signals, and 6-channel automated outreach built in.',
  ctaText: 'Try it Free', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// 2. Head-to-head feature accordion (T.WHITE)
p.add(p.section('sec-compare', T.WHITE, 96, [
  p.overline('cmp-ov', 'HEAD-TO-HEAD'),
  p.heading('cmp-h', 'Don\'t leave money — or data — on the table'),
  p.lead('cmp-l', 'A transparent look at where the two platforms diverge on what matters most: data freshness, search depth, marketing automation, and price.'),
  p.spacer('cmp-sp', 'md'),
  {
    id: 'cmp-accordion', type: 'accordion', order: p.ord(),
    items: [
      {
        id: 'a1',
        title: 'Search criteria & targeting',
        content: 'PropertyRadar: 300+ distinct criteria — including owner demographics, 30 distress signals, and OwnerGraph™ LLC-to-person resolution. PropStream: ~165 filters that overlap heavily, no owner demographics or court-sourced criteria. More precision means less wasted spend and more exclusive deals.',
      },
      {
        id: 'a2',
        title: 'Data freshness — 2 weeks faster',
        content: 'PropertyRadar runs multi-source bake-offs per county; the winning source in our latest test was two weeks ahead across 400+ counties. For court data — Probate, Eviction, Divorce — PropStream has no equivalent. Those signals often arrive months late via recorder data.',
      },
      {
        id: 'a3',
        title: 'Marketing channels',
        content: 'PropertyRadar: 6 channels — mail, email, phone, SMS, display ads, and door-knocking — all coordinated in automated campaigns that fire when new matching leads appear. PropStream: 4 channels, no display ads, no SMS, no event-triggered multi-channel.',
      },
      {
        id: 'a4',
        title: 'Court-sourced distress data',
        content: 'PropertyRadar pulls eviction filings, probate cases, and divorce filings directly from courts. Combined with owner age and property tenure, these signals identify truly motivated sellers. PropStream relies on recorder data alone, which can trail a life event by months.',
      },
      {
        id: 'a5',
        title: 'Data quality process',
        content: 'PropertyRadar tests multiple sources head-to-head, back-tests against county records, and uses NLP/ML to normalize across 3,000+ counties. OwnerGraph™ resolves LLCs to real people. PropStream sources from a single bulk aggregator with no comparative vetting.',
      },
      {
        id: 'a6',
        title: 'Pricing model',
        content: 'PropertyRadar: flat monthly subscription — list building, monitoring, skip tracing, driving for dollars, comps, and all marketing channels included. No surprise add-ons. PropStream charges separately for many of these features and caps team usage on lower tiers.',
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
    description: 'These are the four capabilities PropStream users most commonly cite when they make the switch.',
    services: [
      {
        id: 'sw1',
        title: 'OwnerGraph™ — find the person, not the LLC',
        description: 'PropStream shows you the entity. PropertyRadar resolves LLCs to the real decision-maker so you know who to call — no extra step.',
        icon: 'manage_accounts',
      },
      {
        id: 'sw2',
        title: 'Court-sourced life-event signals',
        description: 'Probate, divorce, and eviction filings sourced direct from courts — not recorder data that arrives months too late to act on.',
        icon: 'gavel',
      },
      {
        id: 'sw3',
        title: '6-channel automated outreach',
        description: 'Build a campaign once. It fires mail, email, SMS, display ads, and more automatically when new properties hit your criteria — while you sleep.',
        icon: 'campaign',
      },
      {
        id: 'sw4',
        title: 'Daily data updates, backtested',
        description: 'Every source is verified against county records. Gaps are found and filled manually. You get the most current picture in the market — not day-old aggregated data.',
        icon: 'verified',
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
p.add(p.section('sec-testimonials', T.TINT, 96, [
  p.overline('t-ov', 'FROM PEOPLE WHO\'VE TRIED BOTH'),
  p.heading('t-h', 'The people who\'ve used both platforms'),
  p.spacer('t-sp', 'md'),
  {
    id: 'test1', type: 'testimonial', order: p.ord(),
    quote: 'I always come back to PropertyRadar because it\'s the easiest to use — and the data is just better. I tried PropStream and it felt like I was working with last month\'s information.',
    author: 'Dean Rogers',
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
    quote: 'I have never come across a more well-rounded, accurate, cutting-edge, data-driven tool like PropertyRadar. Once you try it, there\'s no going back.',
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
  description: 'Run the same search on both platforms. Check the results against your county recorder. The data speaks for itself.',
  primaryButtonText: 'Try it Free',
  primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing',
  secondaryButtonUrl: '/pricing',
}));

// 6. Footer
p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'compare/propertyradar-vs-propstream',
  title: 'PropertyRadar vs PropStream',
  seoTitle: 'PropertyRadar vs PropStream | Full Feature, Detail & Data Comparison',
  seoDescription: 'Discover how PropertyRadar outperforms PropStream with superior data accuracy, unmatched search criteria, and actionable insights to help you win more deals.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
