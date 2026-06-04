/**
 * Import PropertyRadar /features/foreclosures page.
 * Run: npx tsx scripts/migrations/propertyradar/import-features-foreclosures.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// Hero
p.add(p.hero({
  title: 'Unlock Profitable Deals with the Most Trusted Foreclosure Platform Since 2007',
  subtitle: 'FORECLOSURE INTELLIGENCE',
  description: 'Since 2007, tens of thousands of real estate investors, agents, and professionals have relied on PropertyRadar to discover, analyze, and close billions of dollars in foreclosure deals nationwide.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '64vh',
}));

// Built for section (white)
p.add(p.section('sec-for', T.WHITE, 96, [
  p.overline('for-ov', 'BUILT FOR'),
  p.heading('for-h', 'Purpose-built for every foreclosure professional'),
  p.lead('for-l', 'PropertyRadar foreclosures are purpose-built for investors first, while giving Realtors, REO pros, and other experts the data and tools they need to turn distress into opportunity.'),
  p.spacer('for-sp', 'md'),
  {
    id: 'for-grid', type: 'services-grid', order: p.ord(), columns: 2,
    accentColor: T.GREEN,
    services: [
      {
        id: 'fo1', title: 'Real Estate Investors', icon: 'trending_up',
        description: 'Win more preforeclosure, auction, and REO opportunities. See what the competition is buying to stay a step ahead.',
      },
      {
        id: 'fo2', title: 'Listing Agents', icon: 'real_estate_agent',
        description: 'Help owners in distress and see upfront if they have equity or need you for a short sale.',
      },
      {
        id: 'fo3', title: 'REO Brokers', icon: 'apartment',
        description: 'See which banks are taking back properties and reach out to them the day it happens.',
      },
      {
        id: 'fo4', title: 'Other Professionals', icon: 'public',
        description: 'Used by governments, bond traders, attorneys, the press, and many others since 2007.',
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

// Find Foreclosures nationwide (tint)
p.add(p.section('sec-find', T.TINT, 96, [
  {
    id: 'find-fc', type: 'featured-content', order: p.ord(),
    title: 'Instantly find foreclosure properties nationwide',
    overline: 'NATIONWIDE SEARCH',
    description: 'Stop wasting time on stale or incomplete foreclosure lists. PropertyRadar delivers accurate, timely data on preforeclosures, auctions, and REOs across every state — updated daily. Access both judicial and non-judicial foreclosure data, and use advanced criteria — foreclosure stage, notice type, loan position, published bid, sale status, and equity — to pinpoint only the deals that match your exact buy-box.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/pr/Property%20%26%20Owner%20Data.png?width=1218&height=938&name=Property%20%26%20Owner%20Data.png',
    imagePosition: 'right',
    imageAlt: 'Foreclosure property search',
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
    },
  },
]));

// Auction tracking (dark navy moment)
p.add(p.section('sec-auction', T.NAVY, 116, [
  {
    id: 'auction-fc', type: 'featured-content', order: p.ord(),
    title: 'Track foreclosure auctions — stay ahead of the competition',
    overline: 'LIVE AUCTION TRACKING',
    description: 'Turn the courthouse steps into your trading floor with trustee sale tracking. Get opening bids, postponements, cancellations, and sale outcomes as they happen — updated every 15 minutes in 8 states. Exclusively see new REOs the day of auction, not weeks later. Available in 270 counties with a monthly auction planning calendar.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/Auction%20Calendar.png?width=1260&height=1220&name=Auction%20Calendar.png',
    imagePosition: 'left',
    imageAlt: 'Auction calendar tracking',
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

// Investment analysis + due diligence (white)
p.add(p.section('sec-analysis', T.WHITE, 96, [
  p.overline('ia-ov', 'ANALYZE & CLOSE'),
  p.heading('ia-h', 'Analyze foreclosure investments in seconds'),
  p.lead('ia-l', 'Move from raw data to clear, confident decisions with built-in ROI calculators, comps, and due diligence tools.'),
  p.spacer('ia-sp', 'md'),
  {
    id: 'analysis-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      {
        id: 'ia1', title: 'ROI & Profit Calculators', icon: 'calculate',
        description: 'Built-in calculators auto-compute ROI, cap rates, target profit, target bid, and break-even bid based on your own assumptions and costs.',
      },
      {
        id: 'ia2', title: 'Flip vs. Hold Comparisons', icon: 'compare_arrows',
        description: 'Instantly compare flip versus hold scenarios including rehab costs, rent assumptions, and financing terms to choose the best exit strategy.',
      },
      {
        id: 'ia3', title: 'Accurate Comparables', icon: 'rule',
        description: 'Leverage both MLS and off-market comps to refine your ARV and buy box with confidence in fast-changing markets.',
      },
      {
        id: 'ia4', title: 'Rich Property Profiles', icon: 'home_work',
        description: 'View AVM, estimated equity, tax data, prior sales, and comps. See every recorded loan and identify which is in foreclosure.',
      },
      {
        id: 'ia5', title: 'Kanban Deal Workflows', icon: 'view_kanban',
        description: 'Organize properties through customizable stages with a Kanban board, assigning tasks to team members and tracking progress.',
      },
      {
        id: 'ia6', title: 'Built-In Marketing', icon: 'campaign',
        description: 'Launch direct mail, email, online ads, and phone campaigns directly from your foreclosure lists — no separate tools needed.',
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

// Why PropertyRadar (tint)
p.add(p.section('sec-why', T.TINT, 96, [
  p.overline('wy-ov', 'WHY PROPERTYRADAR FORECLOSURES'),
  p.heading('wy-h', 'More than any other foreclosure site offers'),
  p.lead('wy-l', 'Stand out from generic foreclosure listing sites with deeper data, live auction intelligence, and built-in marketing that competitors simply don\'t offer.'),
  p.spacer('wy-sp', 'md'),
  {
    id: 'why-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      { id: 'wy1', title: 'Nationwide Data You Can Trust', icon: 'verified', description: 'Sourced directly from county courts and recorders since 2007. No resellers, no stale data.' },
      { id: 'wy2', title: 'Exclusive Foreclosure Data', icon: 'lock_open', description: 'Auction outcomes, drop bids, and postponement data weeks before other platforms in 270 counties.' },
      { id: 'wy3', title: 'Advanced Marketing & Automation', icon: 'auto_mode', description: 'Set automations so outreach fires automatically when new preforeclosures or auctions match your criteria.' },
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
  title: 'See the best foreclosure data',
  description: 'Investor-friendly plans that fit your budget today and scale seamlessly as your deal volume and team grow.',
  primaryButtonText: 'Start Free Trial', primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing', secondaryButtonUrl: '/pricing',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'features/foreclosures',
  title: 'Foreclosures | PropertyRadar',
  seoTitle: 'Unlock Profitable Foreclosure Deals | Trusted Nationwide Platform | PropertyRadar',
  seoDescription: 'Discover and seize profitable foreclosure opportunities nationwide with PropertyRadar, the trusted platform designed for real estate investors, agents, and professionals since 2007.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
