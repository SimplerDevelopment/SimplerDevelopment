/**
 * Import PropertyRadar /features/property-and-owner-data page.
 * Run: npx tsx scripts/migrations/propertyradar/import-features-property-and-owner-data.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// Hero
p.add(p.hero({
  title: 'Robust Property & Owner Data You Can Trust',
  subtitle: 'PROPERTY & OWNER INTELLIGENCE',
  description: 'Comprehensive data including: Property, Owner, Email, Phone, Distress, Life Event, Foreclosure, Purchase, Mortgage, Valuation, Equity, Demographics, Listings, Geospatial, and much more.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// Core data categories (white)
p.add(p.section('sec-data-cats', T.WHITE, 96, [
  p.overline('dc-ov', 'WHAT\'S INCLUDED'),
  p.heading('dc-h', 'Every data point you need to win'),
  p.lead('dc-l', 'See a complete, accurate picture of every property and owner in one place, so you can move fast and make confident decisions.'),
  p.spacer('dc-sp', 'md'),
  {
    id: 'data-cats', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      {
        id: 'dc1', title: 'Property & Ownership Details', icon: 'home_work',
        description: 'Comprehensive county assessor data — owner name, mailing address, deep property characteristics, tax assessment, and advanced zoning.',
      },
      {
        id: 'dc2', title: 'Owner Contact Information', icon: 'contacts',
        description: 'Pre-matched phones (mobile vs. landline), validated emails, entity resolution, and known litigator/DNC scrubbing.',
      },
      {
        id: 'dc3', title: 'Distress & Life Event Data', icon: 'warning_amber',
        description: 'Multi-source distress signals from county courts and recorders. More signals than any other platform, ranked by distress level.',
      },
      {
        id: 'dc4', title: 'Transaction History', icon: 'history',
        description: 'Comprehensive county recorder data with unique chain-of-title display, proprietary models, and links to document images.',
      },
      {
        id: 'dc5', title: 'Mortgage Data', icon: 'account_balance',
        description: 'Interest rate, rate type, adjustable details, loan-to-value, cash-out, loan type, purpose, and assignment details.',
      },
      {
        id: 'dc6', title: 'Value & Equity', icon: 'trending_up',
        description: 'Top-ranked AVMs, advanced equity estimates factoring value/debt/distress, HUD fair market rent data, and rent-vs-own analysis.',
      },
      {
        id: 'dc7', title: 'Owner Demographics', icon: 'people',
        description: 'Age, income, net worth, marital status, education, occupation, interests, and more — the gold standard in targeted marketing.',
      },
      {
        id: 'dc8', title: 'Listing Data', icon: 'real_estate_agent',
        description: 'Nationwide listing data with up-to-date comparables. Find off-market opportunities and avoid marketing to on-market properties.',
      },
      {
        id: 'dc9', title: 'Geospatial Data', icon: 'map',
        description: 'Parcel maps, heat maps by dozens of data points, flood zones, and boundary overlays for municipalities, districts, and tracts.',
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

// Featured content: Distress data (dark moment)
p.add(p.section('sec-distress', T.NAVY, 116, [
  {
    id: 'distress-fc', type: 'featured-content', order: p.ord(),
    title: 'Find motivated owners sooner with real distress signals',
    overline: 'DISTRESS & LIFE EVENTS',
    description: 'Sourced from county courts, recorders, and more — multi-source coverage gives you the whole story, not just pieces of it. Stack more real-world signals to laser-focus on the best prospects and sort results by degree of distress.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/pr/image3.png?width=1260&height=1024&name=image3.png',
    imagePosition: 'right',
    imageAlt: 'Distress signals dashboard',
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

// Featured content: Transaction history + Your Data (tint)
p.add(p.section('sec-tx', T.TINT, 96, [
  {
    id: 'tx-fc', type: 'featured-content', order: p.ord(),
    title: 'Understand a property\'s full story at a glance',
    overline: 'TRANSACTION HISTORY',
    description: 'Comprehensive county recorder data with a unique chain-of-title display that shows the complete picture. Proprietary models deliver unique data. View, add, edit, or remove document images directly.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/pr/transactions.png?width=608&height=468&name=transactions.png',
    imagePosition: 'left',
    imageAlt: 'Transaction history view',
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
    },
  },
]));

// Why Our Data Is Better (white)
p.add(p.section('sec-why-data', T.WHITE, 96, [
  p.overline('wd-ov', 'WHY OUR DATA IS BETTER'),
  p.heading('wd-h', 'Not just another reseller'),
  p.lead('wd-l', 'Since 2007, we\'ve made messy public records usable and useful for small businesses who need clear answers fast — not a pile of spreadsheets.'),
  p.spacer('wd-sp', 'md'),
  {
    id: 'why-data-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      { id: 'wd1', title: 'Multi-Sourced', icon: 'merge', description: 'We pull from county courts, recorders, and multiple third-party sources to give you the whole story — not just pieces.' },
      { id: 'wd2', title: 'Backfilled & Backtested', icon: 'verified', description: 'Our historical data is backfilled and backtested for accuracy so you can rely on it for investment decisions.' },
      { id: 'wd3', title: 'Acquired Daily', icon: 'update', description: 'New data is acquired daily and processed so your searches and automations reflect what is actually happening right now.' },
      { id: 'wd4', title: 'Cleaned & Enhanced', icon: 'auto_fix_high', description: 'Standardized, deduplicated, and enriched so every county looks consistent and every search returns reliable results.' },
      { id: 'wd5', title: 'Connected for Context', icon: 'hub', description: 'Data points are linked — property to owner to contact to transaction — so you see the full picture in one view.' },
      { id: 'wd6', title: 'SOC2 Secure', icon: 'security', description: 'Your data and ours is protected with enterprise-grade security controls and SOC2 compliance practices.' },
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
  title: 'Put this data to work',
  description: 'Access the industry\'s most comprehensive property and owner data — trusted by investors, agents, and service pros since 2007.',
  primaryButtonText: 'Start Free Trial', primaryButtonUrl: '/register',
  secondaryButtonText: 'See all features', secondaryButtonUrl: '/features',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'features/property-and-owner-data',
  title: 'Property & Owner Data | PropertyRadar',
  seoTitle: 'Robust Property & Owner Data | Comprehensive Insights | PropertyRadar',
  seoDescription: 'Access reliable property and owner data. Owner contact info, distress signals, transactions, and more. Make informed decisions and identify opportunities.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
