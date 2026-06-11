/**
 * Import PropertyRadar /compare/propertyradar-vs-dealmachine page.
 * Run: npx tsx scripts/migrations/propertyradar/import-compare-dealmachine.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// 1. Hero
p.add(p.hero({
  title: 'PropertyRadar vs DealMachine',
  subtitle: 'HONEST COMPARISON',
  description: 'DealMachine helps you find properties. PropertyRadar tells you which ones are worth pursuing — with verified data, court-sourced life-event signals, and 6-channel automated outreach built in.',
  ctaText: 'Try it Free', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// 2. Head-to-head accordion (T.WHITE)
p.add(p.section('sec-compare', T.WHITE, 96, [
  p.overline('cmp-ov', 'HEAD-TO-HEAD'),
  p.heading('cmp-h', 'DealMachine finds properties. PropertyRadar finds motivated owners.'),
  p.lead('cmp-l', 'A fair look at the four limitations in DealMachine that cost investors deals every day — and how PropertyRadar addresses each.'),
  p.spacer('cmp-sp', 'md'),
  {
    id: 'cmp-accordion', type: 'accordion', order: p.ord(),
    items: [
      {
        id: 'a1',
        title: 'Search depth — 300+ vs 157 filters',
        content: 'PropertyRadar: 300+ distinct criteria including owner demographics, 30 distress signals, and OwnerGraph™ LLC-to-person resolution. DealMachine: 157 filters — enough for a basic list, but no distress-score ranking, no owner demographics, and no LLC resolution in search. You can\'t sort by motivation level before you build your list.',
      },
      {
        id: 'a2',
        title: 'Data freshness — 2 weeks faster',
        content: 'PropertyRadar\'s multi-source selection was two weeks faster than DealMachine\'s single-provider data across 400+ counties in our latest bake-off. For court data — Probate, Eviction, Divorce — DealMachine has no equivalent at all. Those signals are critical for finding truly motivated sellers.',
      },
      {
        id: 'a3',
        title: 'Marketing automation — 6 vs 2 channels',
        content: 'PropertyRadar: mail, email, phone, SMS, display ads, and door-knocking — all coordinated and firing automatically when new matching leads appear. DealMachine: mail and phone only, no display ads, no event-triggered multi-channel automation.',
      },
      {
        id: 'a4',
        title: 'Data quality & LLC resolution',
        content: 'PropertyRadar uses NLP/ML to normalize records across 3,000+ counties. OwnerGraph™ resolves LLC entities to the real people behind them — so you know who to call without any extra step. DealMachine shows you the entity name and stops there.',
      },
      {
        id: 'a5',
        title: 'Distress data accuracy',
        content: 'DealMachine often miscategorizes tax sales as trustee sales, and treats any non-owner-occupied property held 15+ years as a "tired landlord" — yielding many false leads. PropertyRadar combines court-sourced eviction filings with owner age and property tenure to find genuinely motivated tired landlords.',
      },
      {
        id: 'a6',
        title: 'Skip tracing quality & cost',
        content: 'PropertyRadar\'s contact data is searchable before you build your list, includes owner demographics, and resolves LLCs via OwnerGraph™. DealMachine\'s email accuracy is self-reported at ~10% and DNC status cannot be filtered before list-build.',
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
    description: 'DealMachine hands you a property. PropertyRadar hands you an opportunity — with context, motivation signals, and an automated outreach plan.',
    services: [
      {
        id: 'sw1',
        title: 'OwnerGraph™ — beyond the LLC',
        description: 'DealMachine shows you the entity. PropertyRadar resolves it to the real person behind the LLC — name, contact, demographics — so you can make that call immediately.',
        icon: 'manage_accounts',
      },
      {
        id: 'sw2',
        title: 'Court-sourced motivation signals',
        description: 'Probate, divorce, and eviction filings sourced direct from courts. Combined with owner age and property data, these signals identify sellers who are truly ready to move — not just properties that have been held a long time.',
        icon: 'gavel',
      },
      {
        id: 'sw3',
        title: 'Know which doors to knock before you drive',
        description: 'Use 300+ criteria, distress scores, and court signals to build a targeted list first — then drive those specific streets. Every windshield minute becomes intentional.',
        icon: 'directions_car',
      },
      {
        id: 'sw4',
        title: '6-channel automated campaigns',
        description: 'Build your campaign once. When a new property hits your criteria, PropertyRadar automatically coordinates mail, email, SMS, display ads, and more — no manual trigger required.',
        icon: 'campaign',
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

// 4. Testimonials (T.TINT)
p.add(p.section('sec-testimonials', T.TINT, 96, [
  p.overline('t-ov', 'FROM PEOPLE WHO\'VE TRIED BOTH'),
  p.heading('t-h', 'The people who\'ve used both platforms'),
  p.spacer('t-sp', 'md'),
  {
    id: 'test1', type: 'testimonial', order: p.ord(),
    quote: 'I always come back to PropertyRadar because it\'s the easiest to use — and the data is the most accurate. I tried DealMachine but found myself going back to verify everything manually.',
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
    quote: 'I have never come across a more well-rounded, accurate, cutting-edge, data-driven tool like PropertyRadar. The court data alone is worth the switch.',
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
  description: 'Run the same search on both platforms. Check against your county recorder. The data speaks for itself — 5-day free trial, quick setup.',
  primaryButtonText: 'Try it Free',
  primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing',
  secondaryButtonUrl: '/pricing',
}));

// 6. Footer
p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'compare/propertyradar-vs-dealmachine',
  title: 'PropertyRadar vs DealMachine',
  seoTitle: 'PropertyRadar vs DealMachine | Data Accuracy, Search Power, Marketing',
  seoDescription: 'Discover why PropertyRadar outperforms DealMachine with superior data accuracy, extensive search criteria, and actionable insights to maximize your real estate investments.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
