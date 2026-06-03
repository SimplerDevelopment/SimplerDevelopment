/**
 * Import PropertyRadar /features overview page.
 * Run: npx tsx scripts/migrations/propertyradar/import-features.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// Hero
p.add(p.hero({
  title: 'One Platform. Every Feature You Need.',
  subtitle: 'EVERYTHING IN ONE PLACE',
  description: 'AI-supported property and owner data, real estate tools, lead generation, and marketing automation all in one place — so you discover opportunities faster, reach owners first, supercharge due diligence, and scale with less effort.',
  ctaText: 'Try it Free', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// Feature overview grid (7 feature sub-pages)
p.add(p.section('sec-features-grid', T.WHITE, 96, [
  {
    id: 'features-grid', type: 'services-grid', order: p.ord(), columns: 3,
    overline: 'PLATFORM FEATURES', title: 'Everything you need to dominate your market',
    description: 'From raw data to closed deals — PropertyRadar brings together 7 powerful feature sets in a single platform.',
    accentColor: T.GREEN,
    services: [
      {
        id: 'f1', title: 'Property & Owner Data', icon: 'dataset',
        description: 'Nationwide, public-records-based property and owner information continuously updated, cleaned, and enhanced.',
        link: '/features/property-and-owner-data', linkText: 'Learn more',
      },
      {
        id: 'f2', title: 'Targeted Marketing', icon: 'campaign',
        description: 'Direct mail, email, SMS, phone, online ads, and door knocking — all from one integrated platform.',
        link: '/features/targeted-marketing', linkText: 'Learn more',
      },
      {
        id: 'f3', title: 'Foreclosures', icon: 'gavel',
        description: 'The most trusted foreclosure platform since 2007. Preforeclosures, auctions, REOs, and live auction tracking.',
        link: '/features/foreclosures', linkText: 'Learn more',
      },
      {
        id: 'f4', title: 'Real Estate Tools', icon: 'build',
        description: 'Advanced property search, skip tracing, comps, investment analysis, heat maps, and drive-for-dollars.',
        link: '/features/real-estate-tools', linkText: 'Learn more',
      },
      {
        id: 'f5', title: 'Property Address Scanner', icon: 'qr_code_scanner',
        description: 'Free Chrome extension that scans any webpage for property addresses and turns them into actionable lists instantly.',
        link: '/features/property-address-scanner', linkText: 'Learn more',
      },
      {
        id: 'f6', title: 'Integrations', icon: 'hub',
        description: 'Connect PropertyRadar to 5,000+ apps via Zapier and native integrations. No code required.',
        link: '/features/integrations', linkText: 'Learn more',
      },
      {
        id: 'f7', title: 'API', icon: 'code',
        description: 'Rich property and owner data API with real-time webhooks, powerful endpoints, and enterprise-grade reliability.',
        link: '/features/api', linkText: 'Learn more',
      },
    ],
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: T.GREEN },
      card: cardOnLight,
    },
  },
]));

// Stats section (dark navy)
p.add(p.section('sec-stats', T.NAVY, 116, [
  p.overline('stats-ov', 'BY THE NUMBERS', T.GREEN, 'center'),
  p.heading('stats-h', 'Trusted by thousands of professionals nationwide', 2, T.WHITE, 'center'),
  p.spacer('stats-sp', 'md'),
  {
    id: 'stats', type: 'stats', order: p.ord(), columns: 4,
    stats: [
      { id: 's1', value: '$250B+', label: 'Completed Transactions' },
      { id: 's2', value: '3X', label: 'Marketing ROI' },
      { id: 's3', value: '160M+', label: 'Properties Nationwide' },
      { id: 's4', value: '1B+', label: 'Phones & Emails' },
    ],
    elementStyles: {
      statValue: { color: T.GREEN, fontFamily: T.PF, fontWeight: '700', fontSize: 'clamp(2.5rem,4vw,3.25rem)', letterSpacing: '-0.02em' },
      statLabel: { color: 'rgba(255,255,255,0.7)', fontWeight: '500', letterSpacing: '0.02em' },
    },
  },
], {}, {
  backgroundColor: T.NAVY,
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// Why Choose PropertyRadar section
p.add(p.section('sec-why', T.TINT, 96, [
  {
    id: 'why-grid', type: 'services-grid', order: p.ord(), columns: 3,
    overline: 'WHY PROPERTYRADAR', title: 'What sets us apart',
    description: 'Not just another data reseller — a complete platform built for small businesses who need clear answers fast.',
    accentColor: T.GREEN,
    services: [
      {
        id: 'w1', title: "Industry's Most Powerful Search", icon: 'manage_search',
        description: 'Hundreds of property, owner, mortgage, equity, and demographic criteria to build pinpoint-accurate lists other platforms cannot touch.',
      },
      {
        id: 'w2', title: 'Multi-Channel Marketing Included', icon: 'send',
        description: 'Direct mail, email, SMS, phone, online ads, and door knocking built right in — no extra subscriptions needed.',
      },
      {
        id: 'w3', title: 'Industry-Specific Playbooks', icon: 'menu_book',
        description: 'Ready-to-launch plays built for investors, agents, mortgage pros, and service professionals — start closing in days.',
      },
    ],
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: T.GREEN },
      card: cardOnLight,
    },
  },
]));

// Final CTA
p.add(p.ctaBlock({
  title: 'Your next deal is waiting',
  description: 'Join thousands of real estate pros who trust PropertyRadar to find motivated owners, automate outreach, and grow their business.',
  primaryButtonText: 'Try it Free', primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing', secondaryButtonUrl: '/pricing',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'features',
  title: 'Features — One Platform. Every Feature You Need.',
  seoTitle: 'AI-Supported Property Data | Comprehensive Real Estate Tools | PropertyRadar',
  seoDescription: 'Discover a powerful platform for real estate professionals, offering AI-driven property data, lead generation, and marketing automation to accelerate opportunities and enhance decision-making.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
