/**
 * Import PropertyRadar /features/property-address-scanner page.
 * Run: npx tsx scripts/migrations/propertyradar/import-features-property-address-scanner.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// Hero
p.add(p.hero({
  title: 'Scan Property Addresses from Any Webpage — Instantly',
  subtitle: 'FREE CHROME EXTENSION',
  description: 'Seamless, fast, and easy — Property Address Scanner from PropertyRadar collects and compiles property data and owner information across any website or landing page. 100% free, no login required.',
  ctaText: 'Get the Free Extension', ctaLink: 'https://chromewebstore.google.com/detail/pdidiffbfejmlkkcgkkmcpkkiinjcmoc',
  secondaryCtaText: 'Try it Free', secondaryCtaLink: '/register',
  minHeight: '62vh',
}));

// Stop wasting time (white)
p.add(p.section('sec-free', T.WHITE, 96, [
  {
    id: 'free-fc', type: 'featured-content', order: p.ord(),
    title: 'Stop wasting time on manual data entry',
    overline: 'ALL-IN-ONE ADDRESS SCANNER — 100% FREE',
    description: 'Tired of copying and pasting addresses into spreadsheets? Click scan and export to CSV or Excel — it\'s that easy. Property Address Scanner finds all the property addresses on any website in one click, parses and formats them to US Postal Service standards, and lets you export unlimited addresses instantly.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/Address%20Scanner.png?width=1260&height=1220&name=Address%20Scanner.png',
    imagePosition: 'right',
    imageAlt: 'Address Scanner Chrome extension',
    buttonText: 'Get the Free Extension',
    buttonUrl: 'https://chromewebstore.google.com/detail/pdidiffbfejmlkkcgkkmcpkkiinjcmoc',
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
      button: { color: T.NAVY, fontWeight: '600' },
    },
  },
]));

// Free features grid (tint)
p.add(p.section('sec-free-features', T.TINT, 96, [
  p.overline('ff-ov', 'FREE FOR EVERYONE'),
  p.heading('ff-h', 'More than a standard web scraper'),
  p.lead('ff-l', 'Pull scattered lists of addresses from any website and create a list of property addresses in seconds — no manual work needed.'),
  p.spacer('ff-sp', 'md'),
  {
    id: 'free-grid', type: 'services-grid', order: p.ord(), columns: 2,
    accentColor: T.GREEN,
    services: [
      {
        id: 'ff1', title: 'Scan Any Website in One Click', icon: 'qr_code_scanner',
        description: 'Property Address Scanner works on ANY website or webpage — no other Chrome extension can do this.',
      },
      {
        id: 'ff2', title: 'Export Unlimited Addresses', icon: 'download',
        description: 'Export as many addresses as you\'d like to CSV, Excel, or copy directly to your clipboard.',
      },
      {
        id: 'ff3', title: 'Auto-Formats to USPS Standards', icon: 'check_circle',
        description: 'Addresses are automatically parsed, cleaned, and formatted to US Postal Service standards. No heavy lifting required.',
      },
      {
        id: 'ff4', title: 'Quick Links to Major Sites', icon: 'open_in_new',
        description: 'Check any address on Zillow, Redfin, and Realtor.com instantly, plus get Google Maps directions with one click.',
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

// Subscriber power (dark navy)
p.add(p.section('sec-subscriber', T.NAVY, 116, [
  p.overline('sub-ov', 'FOR PROPERTYRADAR SUBSCRIBERS', T.GREEN, 'center'),
  p.heading('sub-h', 'Unlock the full power of PropertyRadar', 2, T.WHITE, 'center'),
  p.lead('sub-l', 'Subscribers get instant property profiles, owner contact info, list integration, and automated marketing — right in their browser.', 'rgba(255,255,255,0.72)', 'center'),
  p.spacer('sub-sp', 'md'),
  {
    id: 'sub-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      {
        id: 'sb1', title: 'Instant Property Profiles', icon: 'home_work',
        description: 'Owner contact info, listing status, equity, value, transaction history, mortgage details, and more — on any webpage.',
      },
      {
        id: 'sb2', title: 'Add to Lists Directly', icon: 'playlist_add',
        description: 'Add properties directly to your PropertyRadar lists without leaving the page — available on desktop and mobile.',
      },
      {
        id: 'sb3', title: 'Marketing on Autopilot', icon: 'auto_mode',
        description: 'Real-time property data paired with hyper-targeted marketing that runs automatically in the background.',
      },
    ],
    elementStyles: {
      overline: { color: T.GREEN, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700' },
      serviceTitle: { color: T.WHITE, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: 'rgba(255,255,255,0.72)' },
      serviceIcon: { color: T.GREEN },
      card: { backgroundColor: T.NAVY2, borderWidth: '1px', borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'solid', borderRadius: '16px' },
    },
  },
], {}, {
  backgroundColor: T.NAVY,
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// Business use cases (white)
p.add(p.section('sec-use-cases', T.WHITE, 96, [
  p.overline('uc-ov', 'BUILT TO GROW YOUR BUSINESS'),
  p.heading('uc-h', 'Turn any website into a list of opportunities'),
  p.lead('uc-l', 'Property Address Scanner is engineered to scan any website and turn scattered data into a list of clean, formatted addresses to build meaningful connections.'),
  p.spacer('uc-sp', 'md'),
  {
    id: 'use-cases-grid', type: 'services-grid', order: p.ord(), columns: 2,
    accentColor: T.GREEN,
    services: [
      {
        id: 'uc1', title: 'FSBO Websites', icon: 'sell',
        description: 'Turn "For Sale By Owner" websites into a list of motivated sellers and new leads to fuel your pipeline instantly.',
      },
      {
        id: 'uc2', title: 'Tax Auction & Delinquent Lists', icon: 'gavel',
        description: 'Turn county assessor data, tax auction websites, or delinquent tax databases into full property details and owner contact info in seconds.',
      },
      {
        id: 'uc3', title: 'Natural Disaster Impact Lists', icon: 'warning',
        description: 'Compile quick lists of properties after a natural disaster so you can reach out and offer assistance and professional services.',
      },
      {
        id: 'uc4', title: 'Code Enforcement Websites', icon: 'report',
        description: 'Whether it\'s code violations, property upkeep, or a house that needs TLC — create a list from any county website in seconds.',
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

// How it works (tint)
p.add(p.section('sec-how', T.TINT, 96, [
  p.overline('hw-ov', 'HOW IT WORKS'),
  p.heading('hw-h', '3 easy steps'),
  p.spacer('hw-sp', 'md'),
  {
    id: 'how-stats', type: 'stats', order: p.ord(), columns: 3,
    stats: [
      { id: 'hw1', value: '01', label: 'Scan any webpage for all property addresses' },
      { id: 'hw2', value: '02', label: 'Research deeper with PropertyRadar (or export for free)' },
      { id: 'hw3', value: '03', label: 'Connect with property owners' },
    ],
    elementStyles: {
      statValue: { color: T.GREEN, fontFamily: T.PF, fontWeight: '700', fontSize: 'clamp(2.5rem,4vw,3.25rem)', letterSpacing: '-0.02em' },
      statLabel: { color: T.INK, fontWeight: '500', letterSpacing: '0.02em', fontSize: '1rem' },
    },
  },
]));

// Final CTA
p.add(p.ctaBlock({
  title: 'Ready to scan, research, and connect?',
  description: 'Add Property Address Scanner to Chrome — it\'s 100% free. No login or email required.',
  primaryButtonText: 'Get the Free Extension', primaryButtonUrl: 'https://chromewebstore.google.com/detail/pdidiffbfejmlkkcgkkmcpkkiinjcmoc',
  secondaryButtonText: 'Try PropertyRadar Free', secondaryButtonUrl: '/register',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'features/property-address-scanner',
  title: 'Property Address Scanner | PropertyRadar',
  seoTitle: 'Scan Property Addresses Instantly | Effortless Data Collection | PropertyRadar',
  seoDescription: 'Scan property addresses from any website effortlessly with the Property Address Scanner. Export data instantly and unlock additional features with a PropertyRadar subscription.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
