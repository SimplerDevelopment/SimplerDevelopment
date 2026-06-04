/**
 * Import PropertyRadar /features/real-estate-tools page.
 * Run: npx tsx scripts/migrations/propertyradar/import-features-real-estate-tools.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// Hero
p.add(p.hero({
  title: 'All-In-One Real Estate Tools',
  subtitle: 'RESEARCH, SEARCH & CLOSE',
  description: 'Discover the all-in-one real estate data and marketing platform that helps you find better leads, research any property, and connect with owners faster.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// Property Search (white, featured content)
p.add(p.section('sec-search', T.WHITE, 96, [
  {
    id: 'search-fc', type: 'featured-content', order: p.ord(),
    title: "Industry's best property search",
    overline: 'PROPERTY SEARCH',
    description: 'Find exactly the properties and owners you want fast with nationwide coverage and hundreds of real estate-specific search criteria built for professionals. Search 160M+ U.S. properties with deep criteria for hyper-targeted lists. Natural-language AI search translates plain English into powerful queries. Save searches as dynamic lists that automatically monitor your market.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/pr/Powerful%20Property%20Search.png?width=608&height=468&name=Powerful%20Property%20Search.png',
    imagePosition: 'right',
    imageAlt: 'Powerful property search interface',
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
    },
  },
]));

// Core tools grid (tint)
p.add(p.section('sec-tools', T.TINT, 96, [
  p.overline('t-ov', 'ALL THE TOOLS'),
  p.heading('t-h', 'Everything you need in a single platform'),
  p.lead('t-l', 'Move from raw data to clear, confident decisions with integrated property profiles, comps, investment analysis, and field tools.'),
  p.spacer('t-sp', 'md'),
  {
    id: 'tools-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      {
        id: 'to1', title: 'Property & Owner Lookup', icon: 'search',
        description: 'Instantly see who owns any property, its value, and how to reach the owner. Look up by name, address, APN, phone, or email.',
      },
      {
        id: 'to2', title: 'Built-In Skip Tracing', icon: 'person_search',
        description: 'High-quality phone numbers and email addresses for owners, relatives, and neighbors built in — no separate service required.',
      },
      {
        id: 'to3', title: 'Drive for Dollars Mobile App', icon: 'directions_car',
        description: 'Tap to add properties as you drive, pull owner details at the curb, and launch outreach before you park.',
      },
      {
        id: 'to4', title: 'World-Class List Stacking', icon: 'layers',
        description: 'Stack multiple lists — absentee owners, equity, distress — to instantly see the highest-probability prospects.',
      },
      {
        id: 'to5', title: 'Smart Comparables', icon: 'compare',
        description: 'Surface on and off-market comps that other tools miss. Customize by beds, baths, distance, and dates. Export, report, and share.',
      },
      {
        id: 'to6', title: 'Investment Analysis', icon: 'calculate',
        description: 'Estimate profits, cash flow, and return scenarios in seconds with flip/hold comparisons and support for creative financing.',
      },
      {
        id: 'to7', title: 'Heat Maps', icon: 'map',
        description: 'Visualize property trends, ownership distribution, and real estate turnover with color-coded maps that convert seamlessly into searches.',
      },
      {
        id: 'to8', title: 'Transaction History', icon: 'history',
        description: 'See the full chain of title — deeds, loans, liens, and foreclosures — in logical order with links to county sources.',
      },
      {
        id: 'to9', title: 'Automations & Alerts', icon: 'notifications_active',
        description: 'Real-time alerts and if-this-then-that workflows that trigger mail, email, tasks, or integrations whenever properties change.',
      },
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

// Mobile + field tools (dark navy moment)
p.add(p.section('sec-mobile', T.NAVY, 116, [
  {
    id: 'mobile-fc', type: 'featured-content', order: p.ord(),
    title: 'Win on the go with mobile & field tools',
    overline: 'MOBILE APP',
    description: 'Turn every drive into a stream of off-market leads with a mobile app that captures properties, owners, and follow-up while you\'re in the field. Plan door-knocking routes, log visits, launch outreach on the spot, and keep your pipeline fresh with notes, photos, and status updates from anywhere.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/Mobile.png?width=1220&height=1200&name=Mobile.png',
    imagePosition: 'right',
    imageAlt: 'PropertyRadar mobile app',
    buttonText: 'Start Free Trial',
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

// Who uses PropertyRadar (white)
p.add(p.section('sec-who', T.WHITE, 96, [
  p.overline('who-ov', 'BUILT FOR EVERY PRO'),
  p.heading('who-h', 'Real results for real estate professionals'),
  p.spacer('who-sp', 'sm'),
  {
    id: 'who-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      { id: 'wh1', title: 'Residential Agents', icon: 'home_work', description: 'Find listings before competitors and nurture your geographic farm with targeted, automated outreach.' },
      { id: 'wh2', title: 'Real Estate Investors', icon: 'trending_up', description: 'Source off-market deals consistently, not by chance. Stack distress signals, analyze investments, and close faster.' },
      { id: 'wh3', title: 'Mortgage Pros', icon: 'account_balance', description: 'Target borrowers ready to act now. Spot refi opportunities using rate, equity, and transaction data.' },
      { id: 'wh4', title: 'Commercial Agents', icon: 'apartment', description: 'Find commercial listings and build lasting relationships with property owners across your territory.' },
      { id: 'wh5', title: 'Home Service Pros', icon: 'handyman', description: 'Reach homeowners who need your services today using property age, type, and distress signals.' },
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
  title: 'Your next deal is waiting',
  description: 'Great data, powerful tools, and multi-channel marketing — now within reach for solopreneurs, teams, and small businesses.',
  primaryButtonText: 'Start Free Trial', primaryButtonUrl: '/register',
  secondaryButtonText: 'See all features', secondaryButtonUrl: '/features',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'features/real-estate-tools',
  title: 'Real Estate Tools | PropertyRadar',
  seoTitle: 'All-In-One Real Estate Tools | Discover PropertyRadar Solutions',
  seoDescription: 'Discover PropertyRadar\'s all-in-one real estate platform that streamlines lead generation, property research, and owner connections with advanced search tools and automation features.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
