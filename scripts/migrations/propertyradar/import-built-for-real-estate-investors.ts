/**
 * Import PropertyRadar /built-for/real-estate-investors page.
 * Run: npx tsx scripts/migrations/propertyradar/import-built-for-real-estate-investors.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const PASTEL = T.PASTEL.inv; // #AC98F0 purple

const p = makePage();

// 1. Hero — dark navy
p.add(p.hero({
  title: 'Close More Deals with Motivated Sellers',
  subtitle: 'REAL ESTATE INVESTORS',
  description: 'Stop wasting time on overpriced "deals". Consistently identify the best opportunities, connect with the right property owners, better evaluate risk, and close more real deals that fit your buy box.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'Explore Investor Plays', secondaryCtaLink: '/plays/real-estate-investors',
  minHeight: '64vh',
}));

// 2. Problem/solution section — WHITE with featured-content
p.add(p.section('sec-success', T.WHITE, 96, [
  p.overline('su-ov', 'WHAT SUCCESS LOOKS LIKE'),
  p.heading('su-h', 'From zero to consistent deal flow'),
  p.lead('su-l', 'Successful investors use PropertyRadar to generate a consistent deal flow that matches their buy box. Our proven marketing strategies and due diligence data will take you from zero to hero.'),
  p.spacer('su-sp', 'lg'),
  {
    id: 'su-fc', type: 'featured-content', order: p.ord(),
    layout: 'image-right',
    title: 'Find deals others miss — before they hit the market',
    description: 'PropertyRadar\'s advanced search combines equity, distress signals, life events, and ownership history to surface off-market deals that your competition simply can\'t see. Stack multiple criteria to build hyper-targeted lists that match your exact buy box.',
    features: [
      { id: 'f1', text: 'Advanced distress signal filters: foreclosure, tax delinquency, liens' },
      { id: 'f2', text: 'Life event targeting: probate, divorce, pre-probate' },
      { id: 'f3', text: 'Skip tracing built in — no separate subscription needed' },
      { id: 'f4', text: 'Deal analysis & comps to underwrite in minutes' },
    ],
    ctaText: 'See how it works', ctaUrl: '/features/property-and-owner-data',
    elementStyles: {
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
      feature: { color: T.INK },
      featureIcon: { color: T.GREEN },
    },
  },
]));

// 3. Value props grid — TINT with audience pastel accents
p.add(p.section('sec-howwin', T.TINT, 96, [
  {
    id: 'howwin-grid', type: 'services-grid', order: p.ord(), columns: 3,
    overline: 'HOW INVESTORS WIN', title: 'Every investor strategy. One platform.',
    accentColor: PASTEL,
    services: [
      { id: 'vp1', title: 'Foreclosure Leads', description: 'Instantly spot preforeclosure, auction, and bank-owned properties with equity and urgency, then reach owners first.', icon: 'gavel' },
      { id: 'vp2', title: 'Distressed Property Leads', description: 'Market to owners in trouble — tax delinquent, liens, judgments, bankruptcy — and automate turning pressure into off-market deals.', icon: 'warning_amber' },
      { id: 'vp3', title: 'Life Event Leads', description: 'Target probate, pre-probate, and divorce properties to offer private solutions when selling is both likely and urgent.', icon: 'event' },
      { id: 'vp4', title: 'Absentee & Tired Landlords', description: 'Find absentee owners, eviction filings, and vacant rentals to give burned-out landlords an easy exit.', icon: 'person_off' },
      { id: 'vp5', title: 'Cash Buyer Leads', description: 'Discover active cash and investor-friendly buyers in your markets to move wholesale, flip, rental, and land deals quickly.', icon: 'payments' },
      { id: 'vp6', title: 'Driving for Dollars', description: 'Use mobile route tracking to turn every drive-for-dollars session into a saved list you can hit with mail, calls, and emails.', icon: 'directions_car' },
      { id: 'vp7', title: 'Skip Tracing', description: 'Tap built-in phone numbers and emails for owners, LLCs, heirs, and relatives — market to real decision-makers.', icon: 'manage_search' },
      { id: 'vp8', title: 'Deal Analysis & Due Diligence', description: 'Run property, equity, title history, comps, and ROI analysis to underwrite flips, rentals, and wholesale deals confidently.', icon: 'calculate' },
      { id: 'vp9', title: 'Competitive & Market Research', description: 'Monitor market dynamics and every deal your competitors close to adjust your buy box and stay a step ahead.', icon: 'insights' },
    ],
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: PASTEL },
      card: cardOnLight,
    },
  },
]));

// 4. Plays dark navy moment — card-grid
p.add(p.section('sec-plays', T.NAVY, 116, [
  p.overline('pl-ov', 'INVESTOR PLAYBOOK', T.GREEN),
  p.heading('pl-h', 'The Playbook to Grow Your Investing Success', 2, T.WHITE),
  p.lead('pl-l', 'A PropertyRadar Play is a ready-to-send marketing strategy: a targeted list, branded templates, and the ideal channel to maximize engagement with your target audience.', 'rgba(255,255,255,0.72)'),
  p.spacer('pl-sp', 'md'),
  {
    id: 'plays-grid', type: 'card-grid', order: p.ord(), columns: 3,
    cards: [
      { id: 'pl1', title: 'Foreclosure Leads', description: 'Reach preforeclosure owners first with calls, mail, or email before competitors even know they\'re motivated.', icon: 'gavel', link: '/plays/real-estate-investors', linkText: 'Run the Play' },
      { id: 'pl2', title: 'Absentee Owners', description: 'Find out-of-state and remote owners ready to exit with a targeted multi-channel campaign.', icon: 'person_off', link: '/plays/real-estate-investors/absentee-owners', linkText: 'Run the Play' },
      { id: 'pl3', title: 'Cash Buyers', description: 'Build a buyer list of active cash investors to move deals fast at stronger prices.', icon: 'payments', link: '/plays/real-estate-investors/cash-buyers', linkText: 'Run the Play' },
    ],
    elementStyles: {
      title: { color: T.WHITE, fontFamily: T.PF, fontWeight: '600' },
      description: { color: 'rgba(255,255,255,0.72)' },
      icon: { color: T.GREEN },
      link: { color: T.GREEN },
      card: {
        backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: '1px',
        borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'solid', borderRadius: '16px',
        customCSS: 'transition:all .3s ease',
      },
    },
  },
  p.spacer('pl-sp2', 'lg'),
  p.button('pl-btn', 'Explore All Investor Plays', '/plays/real-estate-investors', 'primary', { hoverEffect: 'glow' }),
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// 5. Testimonial — TINT
p.add(p.section('sec-testimonial', T.TINT, 96, [
  p.overline('t-ov', 'REAL ESTATE INVESTORS TRUST PROPERTYRADAR'),
  p.heading('t-h', 'Proven through multiple market cycles'),
  p.lead('t-l', 'Thousands of real estate investors trust PropertyRadar to find, source, and close investment properties and off-market deals.'),
  p.spacer('t-sp', 'md'),
  {
    id: 'testimonial-1', type: 'testimonial', order: p.ord(),
    quote: 'PropertyRadar is hands-down the best platform for finding off-market deals. The foreclosure and distressed property data is incredibly accurate, and being able to reach owners directly through their skip tracing is a game changer. I\'ve closed deals I never would have found elsewhere.',
    author: 'Henish Pulickal',
    role: 'Real Estate Investor',
    elementStyles: {
      quote: { color: T.INK, fontFamily: T.PF, fontSize: '1.1875rem', fontStyle: 'italic', lineHeight: '1.7' },
      author: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      role: { color: T.GREEN_D },
    },
  },
]));

// 6. CTA
p.add(p.ctaBlock({
  title: 'Ready to Own Your Market?',
  description: 'Get instant access to property and owner data, investor playbooks, and automated marketing tools to find your next investment property today.',
  primaryButtonText: 'Start Free Trial', primaryButtonUrl: '/register',
  secondaryButtonText: 'See Investor Plays', secondaryButtonUrl: '/plays/real-estate-investors',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'built-for/real-estate-investors',
  title: 'Source Your Own Deals at Any Scale | PropertyRadar for Real Estate Investors',
  seoTitle: 'Source Your Own Deals | Maximize Real Estate Opportunities | PropertyRadar',
  seoDescription: 'Discover how PropertyRadar empowers real estate investors to find, evaluate, and close off-market deals effectively, ensuring consistent success and growth in their investments.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
