/**
 * Import PropertyRadar /features/api page.
 * Run: npx tsx scripts/migrations/propertyradar/import-features-api.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// Hero
p.add(p.hero({
  title: 'PropertyRadar API: Rich Property & Owner Data',
  subtitle: 'DEVELOPER API',
  description: 'Unlock direct access to rich, ready-to-use property and owner intelligence so you can power high-performing apps, workflows, and automations with real estate data that actually drives revenue.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// Connect to data (white)
p.add(p.section('sec-data', T.WHITE, 96, [
  {
    id: 'data-fc', type: 'featured-content', order: p.ord(),
    title: 'Connect to unmatched property data, instantly',
    overline: 'NATIONWIDE COVERAGE',
    description: 'Turn our nationwide property database and Owner Graph™ into a real-time data layer for your products, analytics, and workflows — instead of wrestling with static bulk files. Tap into millions of residential and commercial properties across the U.S. with thousands of data points per property, refreshed daily.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/pr/propertydatahero.png?width=600&height=308&name=propertydatahero.png',
    imagePosition: 'right',
    imageAlt: 'PropertyRadar property data',
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
    },
  },
]));

// API endpoints grid (tint)
p.add(p.section('sec-endpoints', T.TINT, 96, [
  p.overline('ep-ov', 'POWERFUL API ENDPOINTS'),
  p.heading('ep-h', 'Everything you need to build on PropertyRadar'),
  p.lead('ep-l', 'A complete set of endpoints designed for real estate professionals, developers, and data-driven businesses.'),
  p.spacer('ep-sp', 'md'),
  {
    id: 'endpoints-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      { id: 'ep1', title: 'Property Search', icon: 'search', description: 'Search millions of properties with hundreds of criteria. Get paginated results, sorting, and saved search support.' },
      { id: 'ep2', title: 'Transaction History', icon: 'history', description: 'Access the complete chain of title — deeds, loans, liens, foreclosures, and assignments with county document links.' },
      { id: 'ep3', title: 'Comparables', icon: 'compare', description: 'Pull on and off-market comps with customizable filters for accurate ARV and investment analysis.' },
      { id: 'ep4', title: 'Owner & Contact Details', icon: 'contacts', description: 'Retrieve verified phones, emails, addresses, entity resolution, and demographic data for any owner.' },
      { id: 'ep5', title: 'Marketing Lists & Webhooks', icon: 'list_alt', description: 'Create and manage dynamic lists, then receive real-time webhooks when properties and owners change.' },
      { id: 'ep6', title: 'Import, Match & Append', icon: 'upload', description: 'Upload your own data, match to PropertyRadar records, and append missing property or contact details at scale.' },
      { id: 'ep7', title: 'Direct Mail & Email', icon: 'mail', description: 'Trigger direct mail postcards and email campaigns programmatically from your own systems and workflows.' },
      { id: 'ep8', title: 'Parcel & Address Tools', icon: 'map', description: 'Geocode, standardize, and validate property addresses. Access parcel boundaries and geospatial data.' },
    ],
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: T.GREEN },
      card: cardOnLight,
    },
  },
]));

// Performance + security (dark navy)
p.add(p.section('sec-perf', T.NAVY, 116, [
  {
    id: 'perf-fc', type: 'featured-content', order: p.ord(),
    title: 'Speed, scale & reliability built for production',
    overline: 'PERFORMANCE & SECURITY',
    description: 'Run high-volume, real-time property data workloads with API performance designed for production apps, not one-off reports. Low-latency responses, bulk fetch support, and a clean RESTful JSON API. Protected by SOC 2 practices, encrypted data exchanges, strong identity controls, and intelligent rate limiting.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/Performant%20API.png?width=1260&height=1220&name=Performant%20API.png',
    imagePosition: 'right',
    imageAlt: 'PropertyRadar API performance',
    buttonText: 'Start Building',
    buttonUrl: '/register',
    elementStyles: {
      overline: { color: T.GREEN, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700' },
      description: { color: 'rgba(255,255,255,0.72)' },
      button: { color: T.NAVY, fontWeight: '600' },
    },
  },
], {}, {
  backgroundColor: T.NAVY,
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// Developer experience (white)
p.add(p.section('sec-devex', T.WHITE, 96, [
  p.overline('dx-ov', 'DEVELOPER-FRIENDLY EXPERIENCE'),
  p.heading('dx-h', 'Everything you need to build with confidence'),
  p.spacer('dx-sp', 'sm'),
  {
    id: 'devex-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      {
        id: 'dx1', title: 'Clear Documentation', icon: 'description',
        description: 'Intuitive, example-driven docs that show exactly how to authenticate, query, and integrate each endpoint into your stack.',
      },
      {
        id: 'dx2', title: 'Dedicated API Support', icon: 'support_agent',
        description: 'Work with responsive API experts who can help you architect solutions, troubleshoot edge cases, and optimize performance.',
      },
      {
        id: 'dx3', title: 'Simple Pricing & Free Trial', icon: 'price_check',
        description: 'Start building with transparent pricing and a free trial to validate your use cases and performance needs before committing.',
      },
    ],
    elementStyles: {
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: T.GREEN },
      card: cardOnLight,
    },
  },
]));

// Why choose (tint)
p.add(p.section('sec-why', T.TINT, 96, [
  p.overline('wy-ov', 'WHY PROPERTYRADAR OVER THE COMPETITION'),
  p.heading('wy-h', 'Built to drive action, not just deliver data'),
  p.lead('wy-l', 'Choose an API built not just to deliver raw data, but to drive action, automation, and outcomes for real estate-focused businesses of all sizes.'),
  p.spacer('wy-sp', 'md'),
  {
    id: 'why-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      { id: 'wy1', title: 'Beyond Bulk Data', icon: 'dynamic_feed', description: 'Real-time, enriched data with daily updates — not static dump files you have to process and store yourself.' },
      { id: 'wy2', title: 'Automation-First Design', icon: 'auto_mode', description: 'Webhooks, triggers, and marketing endpoints built in so your systems respond to market changes automatically.' },
      { id: 'wy3', title: 'Enterprise Power for Small Businesses', icon: 'business', description: 'SOC2 security, scalable architecture, and pricing that works for startups and solo developers, not just big enterprises.' },
    ],
    elementStyles: {
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: T.GREEN },
      card: cardOnLight,
    },
  },
]));

// Final CTA
p.add(p.ctaBlock({
  title: 'Start building with PropertyRadar today',
  description: 'Unlock direct access to rich property and owner intelligence. Start your free trial and explore the API.',
  primaryButtonText: 'Start Free Trial', primaryButtonUrl: '/register',
  secondaryButtonText: 'See integrations', secondaryButtonUrl: '/features/integrations',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'features/api',
  title: 'API | PropertyRadar',
  seoTitle: 'Unlock Property Data & Marketing Tools | Drive Revenue with PropertyRadar',
  seoDescription: 'Access powerful real estate data and marketing tools for seamless property insights, targeted outreach, and automated workflows to drive your business success.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
