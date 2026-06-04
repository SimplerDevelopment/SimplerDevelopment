/**
 * Import PropertyRadar /built-for/commercial-agents page.
 * Run: npx tsx scripts/migrations/propertyradar/import-built-for-commercial-agents.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const PASTEL = T.PASTEL.com; // #A0CEEA sky

const p = makePage();

// 1. Hero — dark navy
p.add(p.hero({
  title: 'End the Deal Drought. Build a Predictable Pipeline.',
  subtitle: 'COMMERCIAL AGENTS',
  description: 'PropertyRadar helps local commercial real estate agents and brokers build a predictable pipeline of off-market listings across multifamily, office, retail, industrial, and residential in the markets you actually work.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'Explore CRE Plays', secondaryCtaLink: '/plays/commercial-agents',
  minHeight: '64vh',
}));

// 2. Problem/solution — WHITE with featured-content
p.add(p.section('sec-success', T.WHITE, 96, [
  p.overline('su-ov', 'WHAT SUCCESS LOOKS LIKE'),
  p.heading('su-h', 'A consistent flow of off-market CRE listings'),
  p.lead('su-l', 'Successful commercial agents use PropertyRadar to generate a consistent flow of new listings and power their growth. Our proven marketing strategies will take you from zero to hero.'),
  p.spacer('su-sp', 'lg'),
  {
    id: 'su-fc', type: 'featured-content', order: p.ord(),
    layout: 'image-right',
    title: 'See through LLCs and find the real decision-makers',
    description: 'Commercial real estate runs on relationships — but you can\'t build them if you can\'t find the right people. PropertyRadar lets you pierce through local LLCs, trusts, and corporations to find the principals behind the entities, with full contact information, so you can start better, more informed conversations.',
    features: [
      { id: 'f1', text: 'LLC, trust, and corporation entity piercing' },
      { id: 'f2', text: 'Full property, debt, equity, and transaction history' },
      { id: 'f3', text: 'Distress signals: tax delinquency, liens, USPS vacancy' },
      { id: 'f4', text: 'Market monitoring and automated alerts' },
    ],
    ctaText: 'See all features', ctaUrl: '/features/property-and-owner-data',
    elementStyles: {
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
      feature: { color: T.INK },
      featureIcon: { color: T.GREEN },
    },
  },
]));

// 3. Value props grid — TINT with sky accents
p.add(p.section('sec-howwin', T.TINT, 96, [
  {
    id: 'howwin-grid', type: 'services-grid', order: p.ord(), columns: 3,
    overline: 'HOW COMMERCIAL BROKERS WIN', title: 'Every CRE strategy. One platform.',
    accentColor: PASTEL,
    services: [
      { id: 'vp1', title: 'Target Likely Sellers', description: 'Use equity, hold period, and asset details to identify owners ready for liquidity, 1031 exchanges, repositioning, or retirement.', icon: 'sell', link: '/plays/commercial-agents/likely-sellers', linkText: 'Run the Play' },
      { id: 'vp2', title: 'Principal Behind LLCs', description: 'See through local LLCs, trusts, and companies to find real people and their contact info for better conversations.', icon: 'person_search', link: '/features/real-estate-tools', linkText: 'Learn More' },
      { id: 'vp3', title: 'Distressed Commercial', description: 'Use tax delinquencies, liens, foreclosure activity, and vacancy signals to find owners under pressure who need your help.', icon: 'warning_amber', link: '/plays/commercial-agents/distressed-commercial', linkText: 'Run the Play' },
      { id: 'vp4', title: 'Submarket Farming', description: 'Pull every multifamily, office, retail, or industrial property to systematically introduce yourself and stay top of mind.', icon: 'apartment', link: '/plays/commercial-agents/submarket-farming', linkText: 'Run the Play' },
      { id: 'vp5', title: 'Owner-User Exits', description: 'Target owner-occupied properties to help small business owners unlock equity through sales, relocations, or lease-back options.', icon: 'storefront', link: '/plays/commercial-agents/owner-user-exits', linkText: 'Run the Play' },
      { id: 'vp6', title: 'Buyer Needs Marketing', description: 'When a buyer has specific requirements, find every property and owner that fits and proactively reach out to get your deal done.', icon: 'search', link: '/plays/commercial-agents/buyer-needs', linkText: 'Run the Play' },
      { id: 'vp7', title: 'Portfolio Owners', description: 'Identify multi-property owners across asset classes and turn one relationship into a steady stream of business.', icon: 'domain', link: '/plays/commercial-agents/portfolio-owners', linkText: 'Run the Play' },
      { id: 'vp8', title: 'Market Monitoring & Alerts', description: 'Monitor sale, loan, foreclosure, and other activity so you always know what\'s trading, who\'s buying, and where to focus.', icon: 'notifications_active', link: '/features', linkText: 'Learn More' },
      { id: 'vp9', title: 'Deep Property Research', description: 'Go into every call and listing meeting prepared with full property, owner, debt, equity, and transaction history.', icon: 'analytics', link: '/features/property-and-owner-data', linkText: 'Learn More' },
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

// 4. Plays dark navy moment
p.add(p.section('sec-plays', T.NAVY, 116, [
  p.overline('pl-ov', 'CRE PLAYBOOK', T.GREEN),
  p.heading('pl-h', 'The Playbook to Grow Your Commercial Real Estate Business', 2, T.WHITE),
  p.lead('pl-l', 'A PropertyRadar Play is a ready-to-send marketing strategy: a targeted list, branded templates, and the ideal channel to maximize engagement.', 'rgba(255,255,255,0.72)'),
  p.spacer('pl-sp', 'md'),
  {
    id: 'plays-grid', type: 'card-grid', order: p.ord(), columns: 3,
    cards: [
      { id: 'pl1', title: 'Likely Sellers', description: 'Target CRE owners ready for liquidity events using equity, hold period, and other asset signals.', icon: 'sell', link: '/plays/commercial-agents/likely-sellers', linkText: 'Run the Play' },
      { id: 'pl2', title: 'Distressed Commercial', description: 'Reach owners with properties showing distress signals before the market knows they\'re ready to deal.', icon: 'warning_amber', link: '/plays/commercial-agents/distressed-commercial', linkText: 'Run the Play' },
      { id: 'pl3', title: 'Portfolio Owners', description: 'Find multi-asset owners and turn a single intro into a long-term pipeline of deals.', icon: 'domain', link: '/plays/commercial-agents/portfolio-owners', linkText: 'Run the Play' },
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
  p.button('pl-btn', 'Explore All CRE Plays', '/plays/commercial-agents', 'primary', { hoverEffect: 'glow' }),
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// 5. Testimonial — TINT
p.add(p.section('sec-testimonial', T.TINT, 96, [
  p.overline('t-ov', 'CRE PROFESSIONALS TRUST PROPERTYRADAR'),
  p.heading('t-h', 'Top-performing CRE pros rely on PropertyRadar'),
  p.lead('t-l', 'Thousands of top-performing agents, brokers, and commercial real estate professionals trust PropertyRadar to take their business to the next level.'),
  p.spacer('t-sp', 'md'),
  {
    id: 'testimonial-1', type: 'testimonial', order: p.ord(),
    quote: 'PropertyRadar completely changed my approach to prospecting. Being able to identify the actual decision-maker behind an LLC and reach them directly has opened doors I didn\'t even know existed. My deal pipeline has never been more consistent.',
    author: 'Robert Bagley',
    role: 'Commercial Real Estate Broker',
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
  description: 'Get instant access to property and owner information to level up your commercial real estate marketing today.',
  primaryButtonText: 'Start Free Trial', primaryButtonUrl: '/register',
  secondaryButtonText: 'See CRE Plays', secondaryButtonUrl: '/plays/commercial-agents',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'built-for/commercial-agents',
  title: 'End the Deal Drought | PropertyRadar for Commercial Agents',
  seoTitle: 'Commercial Agents | Generate Leads with PropertyRadar',
  seoDescription: 'Generate exclusive leads and boost your real estate business with PropertyRadar\'s targeted marketing strategies and powerful data tools. Start your free trial today.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
