/**
 * Import PropertyRadar /compare/propertyradar-vs-listsource page.
 * Run: npx tsx scripts/migrations/propertyradar/import-compare-listsource.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// 1. Hero
p.add(p.hero({
  title: 'PropertyRadar vs ListSource',
  subtitle: 'HONEST COMPARISON',
  description: 'Your search for a ListSource alternative is finally over. PropertyRadar gives you more leads at a lower price, with built-in skip tracing, automated list monitoring, and multi-channel marketing — all in one platform.',
  ctaText: 'Try it Free', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// 2. Head-to-head accordion (T.WHITE)
p.add(p.section('sec-compare', T.WHITE, 96, [
  p.overline('cmp-ov', 'HEAD-TO-HEAD'),
  p.heading('cmp-h', 'Why PropertyRadar is the best ListSource alternative'),
  p.lead('cmp-l', 'ListSource is a traditional list-purchase tool. PropertyRadar is a complete lead generation platform — with better data, lower cost, and built-in ways to act on every lead.'),
  p.spacer('cmp-sp', 'md'),
  {
    id: 'cmp-accordion', type: 'accordion', order: p.ord(),
    items: [
      {
        id: 'a1',
        title: 'Property & demographic criteria — 300+ vs basic',
        content: 'PropertyRadar gives you 300+ filtering criteria including equity amount, owner income, owner age, owner demographics, and property features. ListSource focuses primarily on property filtering criteria; demographic data is limited and not available in all states.',
      },
      {
        id: 'a2',
        title: 'See your list before you pay',
        content: 'With PropertyRadar, you can preview your list before exporting — so you know exactly what you\'re getting before any commitment. ListSource requires purchasing records upfront without that preview capability.',
      },
      {
        id: 'a3',
        title: 'Phone numbers & email addresses — included',
        content: 'PropertyRadar appends phone numbers and email addresses to records — or you can filter to only include records that already have contact info. Skip tracing is included in your subscription, not a separate purchase.',
      },
      {
        id: 'a4',
        title: 'Automatically updated lists',
        content: 'PropertyRadar lists are live — they automatically add new matches and remove properties that no longer qualify. You\'re always first to an opportunity. ListSource provides static snapshots that go stale immediately after purchase.',
      },
      {
        id: 'a5',
        title: 'Pricing — subscription vs. per-list',
        content: 'A single ListSource list can cost as much as an annual PropertyRadar subscription. With PropertyRadar, you create unlimited lists with different criteria sets throughout the year — affordably testing messaging and targeting without per-list charges.',
      },
      {
        id: 'a6',
        title: 'Marketing integrations',
        content: 'PropertyRadar integrates directly with Pipedrive, LionDesk, SalesRabbit, Mojo, PostcardMania, and more via Zapier. ListSource delivers a flat CSV export — you do the rest manually.',
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
    id: 'switch-grid', type: 'services-grid', order: p.ord(), columns: 3, accentColor: T.GREEN,
    overline: 'WHY PROS SWITCH', title: 'What you gain when you move to PropertyRadar',
    description: 'ListSource users who upgrade to PropertyRadar find they get more leads, better contact data, and a platform designed for professionals — not just data exports.',
    services: [
      {
        id: 'sw1',
        title: 'Better value for your money',
        description: 'More leads and more features at a fraction of the per-list cost. One subscription covers everything — lists, skip tracing, comps, marketing, and automation.',
        icon: 'price_check',
      },
      {
        id: 'sw2',
        title: 'Visual lead maps',
        description: 'Draw your exact market shape on a map, layer on 300+ criteria, and see exactly which properties match — before you build your list or export a single record.',
        icon: 'map',
      },
      {
        id: 'sw3',
        title: 'Always up to date',
        description: 'Your lists automatically update as new properties hit your criteria and old ones age out. Be first to every opportunity — not the last to know.',
        icon: 'update',
      },
      {
        id: 'sw4',
        title: 'Mobile app & field notes',
        description: 'All your best leads right in your pocket. Drive for dollars, door-knock, and take notes — all in the same platform you used to build your list.',
        icon: 'smartphone',
      },
      {
        id: 'sw5',
        title: 'Multi-channel outreach',
        description: 'Connect with leads via direct mail, cold calling, email, social media ads, and door-knocking — all from a single integrated platform.',
        icon: 'campaign',
      },
      {
        id: 'sw6',
        title: 'Smart integrations',
        description: 'Sync leads directly into your CRM and marketing stack — Pipedrive, LionDesk, SalesRabbit, PostcardMania, and more via native integrations and Zapier.',
        icon: 'integration_instructions',
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
  p.overline('t-ov', 'DESIGNED FOR PROFESSIONALS'),
  p.heading('t-h', 'See why pros trust PropertyRadar over list providers'),
  p.spacer('t-sp', 'md'),
  {
    id: 'test1', type: 'testimonial', order: p.ord(),
    quote: 'I used to spend as much on a single ListSource list as I now pay for a whole year of PropertyRadar — and with ListSource I got a CSV that was already stale. With PropertyRadar, my lists update automatically and I can act on opportunities the same day they appear.',
    author: 'PropertyRadar Customer',
    role: 'Mortgage Professional',
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
  description: 'Try PropertyRadar free — full access to property data, 300+ filters, and marketing tools. No credit card required.',
  primaryButtonText: 'Try it Free',
  primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing',
  secondaryButtonUrl: '/pricing',
}));

// 6. Footer
p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'compare/propertyradar-vs-listsource',
  title: 'PropertyRadar vs ListSource',
  seoTitle: 'PropertyRadar Vs. ListSource | Full Comparison',
  seoDescription: 'Curious about the difference between PropertyRadar vs. ListSource? Check out our comparison table & learn about PropertyRadar as a ListSource alternative.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
